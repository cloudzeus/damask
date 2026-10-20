import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { trdrGemiFolder } from '@/lib/trdr/cdn-folder'
import {
  searchGemiCompanies,
  getGemiCompany,
  getGemiCompanyDocuments,
  downloadGemiFile,
  mapGemiCompany,
  type GemiDocumentDecision,
  type GemiDocumentPublication,
} from '@/lib/trdr/gemi'
import { aadeLookup } from '@/lib/trdr/aade'
import { resolveIrsdataCode } from '@/lib/trdr/irsdata'
import { resolveKadForActivity } from '@/lib/registries/kad'
import { logActivity } from '@/lib/activity/log'
import { greeceCountryId } from '@/lib/trdr/country'

/**
 * (Plain module — actions ΚΑΙ workers.) Πυρήνας εμπλουτισμού Trdr από ΑΑΔΕ/ΓΕΜΗ χωρίς έλεγχο δικαιωμάτων: τον καλούν
 * οι server actions (enrich-actions.ts, ΜΕΤΑ το requirePermission) και η αυτόματη καταχώριση στο παρασκήνιο
 * (trdr/derive.ts) σε κάθε νέο πελάτη. Δεν κάνει revalidatePath (μόνο οι actions).
 */

// ── TrdrKad replace (shared by applyAadeToTrdr + gemiSyncTrdr) ─────────────

export type RawActivity = { code: string; description: string; kind: 'PRIMARY' | 'SECONDARY'; order: number }

export type TrdrKadRow = {
  trdrId: string
  code: string
  codeWithoutDots: string | null
  codeAade: string | null
  description: string
  kind: 'PRIMARY' | 'SECONDARY'
  order: number
}

/**
 * Resolve κάθε activity στον κανονικό ΚΑΔ (W1 resolveKadForActivity), μετά dedupe
 * by canonical code — δύο activities μπορεί να πέσουν στον ίδιο κανονικό κωδικό
 * (π.χ. PRIMARY + SECONDARY, ή δύο raw codes που κανονικοποιούνται στο ίδιο).
 * Το unique constraint είναι (trdrId, code) — προτιμάμε PRIMARY, αλλιώς κρατάμε
 * την πρώτη εμφάνιση (ΙΔΙΟ idiom με το ref: αντικατάσταση ΜΟΝΟ όταν prev δεν
 * είναι PRIMARY και το τρέχον ΕΙΝΑΙ PRIMARY).
 */
export async function buildTrdrKadRows(trdrId: string, activities: RawActivity[]): Promise<TrdrKadRow[]> {
  const resolved = await Promise.all(activities.map((a) => resolveKadForActivity(a.code, a.description)))
  const byCode = new Map<string, TrdrKadRow>()
  activities.forEach((a, i) => {
    const r = resolved[i]
    const prev = byCode.get(r.code)
    if (prev && !(prev.kind !== 'PRIMARY' && a.kind === 'PRIMARY')) return
    byCode.set(r.code, {
      trdrId,
      code: r.code,
      codeWithoutDots: r.codeWithoutDots,
      codeAade: r.codeAade,
      description: r.description,
      kind: a.kind,
      order: a.order ?? i,
    })
  })
  return Array.from(byCode.values())
}

export async function replaceTrdrKad(tx: Prisma.TransactionClient, trdrId: string, rows: TrdrKadRow[]) {
  await tx.trdrKad.deleteMany({ where: { trdrId } })
  if (rows.length > 0) await tx.trdrKad.createMany({ data: rows })
}

/**
 * Conditional-spread patch: μόνο τα keys των οποίων η τιμή στο `obj` ΔΕΝ είναι
 * null περνάνε στο αποτέλεσμα. Η ΑΑΔΕ/ΓΕΜΗ πηγή αναπαριστά «η πηγή δεν έχει
 * αυτό το πεδίο» με `null` στον mapper (gemi-map.ts / aade-map.ts) — αν το
 * γράφαμε raw σε ένα Prisma update, ΘΑ ΣΒΗΝΕ μια ήδη γνωστή τιμή στο Trdr
 * (data loss). Mirror του `?? undefined` semantics του ref. Πεδία που ΠΡΕΠΕΙ
 * να μπορούν να καθαρίζονται (π.χ. gemiSyncedAt/gemiData) μένουν ΕΚΤΟΣ αυτής
 * της λίστας και γράφονται explicit στο καλούντα.
 */
export function omitNulls<T extends Record<string, unknown>>(obj: T, keys: (keyof T)[]): Partial<T> {
  const out: Partial<T> = {}
  for (const k of keys) {
    const v = obj[k]
    if (v !== null) out[k] = v
  }
  return out
}


// ── ΑΑΔΕ ──

/** ΑΦΜ υποχρεωτικό στο Trdr — γράφει τα ΑΑΔΕ πεδία + TrdrKad replace + aadeSyncedAt. */
export async function applyAadeCore(trdrId: string, userId?: string | null) {

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId } })
  if (!trdr) throw new Error('Ο συναλλασσόμενος δεν βρέθηκε.')
  if (!trdr.AFM) throw new Error('Ο συναλλασσόμενος δεν έχει ΑΦΜ — δεν μπορεί να γίνει έλεγχος ΑΑΔΕ.')

  const result = await aadeLookup(trdr.AFM)
  if (!result) throw new Error(`Δεν βρέθηκαν στοιχεία ΑΑΔΕ για το ΑΦΜ ${trdr.AFM}.`)

  const { mapped, activities } = result
  const rawActivities: RawActivity[] = activities
    .filter((a): a is { code: string; description: string | null; kind: 'PRIMARY' | 'SECONDARY'; order: number } => a.code != null)
    .map((a) => ({ code: a.code, description: a.description ?? '', kind: a.kind, order: a.order }))
  const kadRows = rawActivities.length > 0 ? await buildTrdrKadRows(trdrId, rawActivities) : []

  // ΔΟΥ → Trdr.IRSDATA (soft ref στο Irsdata.CODE) — βλ. resolveIrsdataCode.
  const irsdataCode = await resolveIrsdataCode(mapped.doyCode, mapped.doyDescr)
  // Εγγεγραμμένη σε ελληνική ΔΟΥ ⇒ Χώρα = Ελλάδα (μόνο αν λείπει).
  const grId = irsdataCode && trdr.COUNTRY == null ? await greeceCountryId() : null

  await prisma.$transaction(async (tx) => {
    await tx.trdr.update({
      where: { id: trdrId },
      data: {
        NAME: mapped.NAME || undefined,
        ...omitNulls(mapped, ['ADDRESS', 'ZIP', 'CITY', 'foundingDate', 'aadeStatus', 'aadeFirmKind', 'appLegalForm']),
        ...(irsdataCode ? { IRSDATA: irsdataCode } : {}),
        ...(grId != null ? { COUNTRY: grId } : {}),
        aadeSyncedAt: new Date(),
      },
    })
    await replaceTrdrKad(tx, trdrId, kadRows)
  })

  await logActivity('partner.aade_check', { entityType: 'trdr', entityId: trdrId, summary: mapped.NAME ?? undefined, meta: { kads: kadRows.length }, userId })
  return { ok: true as const, name: mapped.NAME, kads: kadRows.length }
}

// ── ΓΕΜΗ ──

export function safeExt(contentType: string, fallback = 'pdf'): string {
  const map: Record<string, string> = {
    'application/pdf': 'pdf',
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/tiff': 'tif',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  }
  return map[contentType.split(';')[0].trim()] ?? fallback
}

/** Storage-key-safe kak/kad — τα ΓΕΜΗ identifiers ΘΕΩΡΗΤΙΚΑ είναι απλά αλφαριθμητικά, sanitize είναι defense-in-depth. */
export function sanitizeKak(kak: string): string {
  return kak.replace(/[^A-Za-z0-9._-]/g, '_')
}

export function toDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

/** base = ο κοινός φάκελος ΓΕΜΗ του πελάτη (partners/<type>/<ΑΦΜ>/documents/gemi/), με trailing slash. */
export function gemiDocKey(base: string, kak: string, docKind: 'DECISION' | 'PUBLICATION' | 'OTHER', ext: string): string {
  const prefix = docKind === 'PUBLICATION' ? 'pub-' : ''
  return `${base}${prefix}${sanitizeKak(kak)}.${ext}`
}

export type ImportDocFields = {
  title: string
  sourceUrl: string | null
  docKind: 'DECISION' | 'PUBLICATION' | 'OTHER'
  assembly?: string | null
  summary?: string | null
  decisionSubject?: string | null
  dateAssemblyDecided?: Date | null
  dateAnnounced?: Date | null
  dateRegistrated?: Date | null
  applicationStatus?: string | null
  metadata: unknown
}

/** Download (μόνο αν δεν έχει ήδη storageKey) → Bunny private → upsert TrdrDocument. Non-fatal — ο caller κάνει try/catch ανά έγγραφο. */
export async function importGemiDocument(trdrId: string, kak: string, fields: ImportDocFields): Promise<void> {
  const existing = await prisma.trdrDocument.findUnique({
    where: { trdrId_kak: { trdrId, kak } },
    select: { storageKey: true },
  })

  let storageKey: string | undefined
  let mimeType: string | undefined
  let sizeBytes: number | undefined
  if (fields.sourceUrl && !existing?.storageKey) {
    const { buffer, contentType } = await downloadGemiFile(fields.sourceUrl)
    mimeType = contentType
    sizeBytes = buffer.length
    const gemiBase = (await trdrGemiFolder(trdrId)) ?? `trdr/${trdrId}/gemi/`
    storageKey = gemiDocKey(gemiBase, kak, fields.docKind, safeExt(contentType))
    await bunnyUploadPrivate({ key: storageKey, body: buffer, contentType })
  }

  const shared = {
    docKind: fields.docKind,
    title: fields.title,
    assembly: fields.assembly ?? null,
    summary: fields.summary ?? null,
    decisionSubject: fields.decisionSubject ?? null,
    dateAssemblyDecided: fields.dateAssemblyDecided ?? null,
    dateAnnounced: fields.dateAnnounced ?? null,
    dateRegistrated: fields.dateRegistrated ?? null,
    applicationStatus: fields.applicationStatus ?? null,
    sourceUrl: fields.sourceUrl ?? null,
    metadata: fields.metadata as Prisma.InputJsonValue,
  }

  await prisma.trdrDocument.upsert({
    where: { trdrId_kak: { trdrId, kak } },
    update: { ...shared, ...(storageKey ? { storageKey, mimeType, sizeBytes } : {}) },
    create: { trdrId, source: 'GEMI', kak, ...shared, storageKey, mimeType, sizeBytes },
  })
}

/** resolve arGemi: δοσμένο → αποθηκευμένο → αναζήτηση με ΑΦΜ. Πετάει ελληνικό μήνυμα αν δεν βρεθεί. */
export async function resolveArGemi(trdr: { AFM: string | null; arGemi: string | null }, given?: string): Promise<string> {
  const direct = given?.trim() || trdr.arGemi || null
  if (direct) return direct
  if (!trdr.AFM) throw new Error('Άγνωστος αριθμός ΓΕΜΗ: ο συναλλασσόμενος δεν έχει ούτε αριθμό ΓΕΜΗ ούτε ΑΦΜ για αναζήτηση.')
  const search = await searchGemiCompanies({ afm: trdr.AFM, resultsSize: 5 })
  const first = search.results[0]
  const found = first?.arGemi ? String(first.arGemi) : null
  if (!found) throw new Error(`Άγνωστος αριθμός ΓΕΜΗ: δεν βρέθηκε εγγραφή ΓΕΜΗ για το ΑΦΜ ${trdr.AFM}.`)
  return found
}

/**
 * resolve arGemi (input→stored→search με ΑΦΜ) → update Trdr (ΓΕΜΗ πεδία + gemiData raw)
 * + TrdrKad replace ΜΕΣΑ σε transaction· έγγραφα ΕΚΤΟΣ transaction, ανά έγγραφο
 * try/catch (μη-θανατηφόρο) — counts documentsImported/documentsFailed.
 */
export async function gemiSyncCore(trdrId: string, opts: { arGemi?: string; syncDocuments?: boolean; userId?: string | null } = {}) {

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId } })
  if (!trdr) throw new Error('Ο συναλλασσόμενος δεν βρέθηκε.')

  const arGemi = await resolveArGemi(trdr, opts.arGemi)
  const syncDocuments = opts.syncDocuments ?? true

  const [company, docSet] = await Promise.all([
    getGemiCompany(arGemi),
    syncDocuments
      ? getGemiCompanyDocuments(arGemi).catch(() => ({ decision: [], publication: [] }))
      : Promise.resolve({ decision: [], publication: [] } as { decision: GemiDocumentDecision[]; publication: GemiDocumentPublication[] }),
  ])
  const m = mapGemiCompany(company)
  const kadRows = m.activities.length > 0 ? await buildTrdrKadRows(trdrId, m.activities) : []

  try {
    await prisma.$transaction(async (tx) => {
      await tx.trdr.update({
        where: { id: trdrId },
        data: {
          NAME: m.NAME || undefined,
          ...omitNulls(m, [
            'ADDRESS', 'ZIP', 'CITY',
            'gemiOffice', 'gemiStatus', 'gemiObjective', 'gemiIsBranch', 'gemiAutoRegistered', 'gemiLastStatusChange',
            'foundingDate', 'appLegalForm',
          ]),
          ...(m.EMAIL !== undefined ? { EMAIL: m.EMAIL } : {}),
          arGemi: m.arGemi,
          gemiSyncedAt: new Date(),
          gemiData: company as unknown as Prisma.InputJsonValue,
          ISACTIVE: m.ISACTIVE,
        },
      })
      await replaceTrdrKad(tx, trdrId, kadRows)
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      throw new Error('Ο αριθμός ΓΕΜΗ έχει ήδη συνδεθεί με άλλον συναλλασσόμενο.')
    }
    throw e
  }

  let documentsImported = 0
  let documentsFailed = 0
  if (syncDocuments) {
    for (const d of docSet.decision ?? []) {
      if (!d.kak) continue
      try {
        await importGemiDocument(trdrId, d.kak, {
          docKind: 'DECISION',
          title: d.decisionSubject || d.summary || `Απόφαση ${d.kak}`,
          sourceUrl: d.assemblyDecisionUrl ?? null,
          assembly: d.assembly ?? null,
          summary: d.summary ?? null,
          decisionSubject: d.decisionSubject ?? null,
          dateAssemblyDecided: toDate(d.dateAssemblyDecided),
          dateAnnounced: toDate(d.dateAnnounced),
          dateRegistrated: toDate(d.dateRegistrated),
          applicationStatus: d.applicationStatusDescription ?? null,
          metadata: d,
        })
        documentsImported++
      } catch {
        documentsFailed++
      }
    }
    for (const p of docSet.publication ?? []) {
      if (!p.kad) continue
      try {
        await importGemiDocument(trdrId, p.kad, {
          docKind: 'PUBLICATION',
          title: `Δημοσίευση ΥΜΣ ${p.kad}`,
          sourceUrl: p.url ?? null,
          metadata: p,
        })
        documentsImported++
      } catch {
        documentsFailed++
      }
    }
  }

  await logActivity('partner.gemi_sync', { entityType: 'trdr', entityId: trdrId, meta: { kads: kadRows.length, documentsImported, documentsFailed }, userId: opts.userId })
  return { ok: true as const, arGemi, kads: kadRows.length, documentsImported, documentsFailed }
}
