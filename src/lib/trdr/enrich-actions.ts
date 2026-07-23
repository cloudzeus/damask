'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import {
  searchGemiCompanies,
  getGemiCompany,
  getGemiCompanyDocuments,
  downloadGemiFile,
  mapGemiCompany,
  type GemiCompanyRaw,
  type GemiDocumentDecision,
  type GemiDocumentPublication,
} from '@/lib/trdr/gemi'
import { aadeLookup } from '@/lib/trdr/aade'
import { resolveKadForActivity } from '@/lib/registries/kad'
import { matchRegion, type RegionMatch } from '@/lib/registries/regions'

/**
 * Server actions πίσω από τον εμπλουτισμό Trdr με ΓΕΜΗ/ΑΑΔΕ/Geo (W2 spec §0.7).
 * Gating: ΙΔΙΟ idiom με src/app/(app)/partners/actions.ts — 'customer.view' για
 * αναγνώσεις/previews χωρίς εγγραφή (ακόμα κι αν χτυπάνε εξωτερικό API),
 * 'customer.edit' για ΚΑΘΕ mutation. ΚΑΝΕΝΑ νέο permission.
 *
 * Ref semantics: pb-ref app/api/admin/companies/[id]/gemi-sync/route.ts —
 * βλ. buildTrdrKadRows παρακάτω για το PRIMARY-preferred dedupe (πιστό port).
 */

// ── TrdrKad replace (shared by applyAadeToTrdr + gemiSyncTrdr) ─────────────

type RawActivity = { code: string; description: string; kind: 'PRIMARY' | 'SECONDARY'; order: number }

type TrdrKadRow = {
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
async function buildTrdrKadRows(trdrId: string, activities: RawActivity[]): Promise<TrdrKadRow[]> {
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

async function replaceTrdrKad(tx: Prisma.TransactionClient, trdrId: string, rows: TrdrKadRow[]) {
  await tx.trdrKad.deleteMany({ where: { trdrId } })
  if (rows.length > 0) await tx.trdrKad.createMany({ data: rows })
}

// ── ΑΑΔΕ preview + apply ────────────────────────────────────────────────────

/** Preview (καμία εγγραφή) — ΑΦΜ → mapped στοιχεία + activities. */
export async function aadeLookupTrdr(afm: string) {
  await requirePermission('customer.view')
  return aadeLookup(afm)
}

/** ΑΦΜ υποχρεωτικό στο Trdr — γράφει τα ΑΑΔΕ πεδία + TrdrKad replace + aadeSyncedAt. */
export async function applyAadeToTrdr(trdrId: string) {
  await requirePermission('customer.edit')

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId } })
  if (!trdr) notFound()
  if (!trdr.AFM) throw new Error('Ο συναλλασσόμενος δεν έχει ΑΦΜ — δεν μπορεί να γίνει έλεγχος ΑΑΔΕ.')

  const result = await aadeLookup(trdr.AFM)
  if (!result) throw new Error(`Δεν βρέθηκαν στοιχεία ΑΑΔΕ για το ΑΦΜ ${trdr.AFM}.`)

  const { mapped, activities } = result
  const rawActivities: RawActivity[] = activities
    .filter((a): a is { code: string; description: string | null; kind: 'PRIMARY' | 'SECONDARY'; order: number } => a.code != null)
    .map((a) => ({ code: a.code, description: a.description ?? '', kind: a.kind, order: a.order }))
  const kadRows = rawActivities.length > 0 ? await buildTrdrKadRows(trdrId, rawActivities) : []

  await prisma.$transaction(async (tx) => {
    await tx.trdr.update({
      where: { id: trdrId },
      data: {
        NAME: mapped.NAME || undefined,
        ADDRESS: mapped.ADDRESS,
        ZIP: mapped.ZIP,
        CITY: mapped.CITY,
        foundingDate: mapped.foundingDate,
        aadeStatus: mapped.aadeStatus,
        aadeFirmKind: mapped.aadeFirmKind,
        appLegalForm: mapped.appLegalForm,
        aadeSyncedAt: new Date(),
      },
    })
    await replaceTrdrKad(tx, trdrId, kadRows)
  })

  revalidatePath(`/partners/${trdrId}`)
  return { ok: true as const, name: mapped.NAME, kads: kadRows.length }
}

// ── ΓΕΜΗ preview + sync ─────────────────────────────────────────────────────

/** Preview (καμία εγγραφή) — αναζήτηση (αν δεν δοθεί arGemi) → getCompany + document counts. */
export async function gemiLookupTrdr(input: { afm?: string; arGemi?: string }) {
  await requirePermission('customer.view')

  let arGemi = input.arGemi?.trim() || null
  if (!arGemi) {
    const afm = input.afm?.trim()
    if (!afm) throw new Error('Δώσε ΑΦΜ ή αριθμό ΓΕΜΗ για αναζήτηση.')
    const search = await searchGemiCompanies({ afm, resultsSize: 5 })
    const first = search.results[0]
    arGemi = first?.arGemi ? String(first.arGemi) : null
    if (!arGemi) return null
  }

  const [company, docSet] = await Promise.all([
    getGemiCompany(arGemi),
    getGemiCompanyDocuments(arGemi).catch(() => ({ decision: [], publication: [] })),
  ])
  const mapped = mapGemiCompany(company)
  return {
    mapped,
    documentCounts: {
      decisions: docSet.decision?.length ?? 0,
      publications: docSet.publication?.length ?? 0,
    },
  }
}

function safeExt(contentType: string, fallback = 'pdf'): string {
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
function sanitizeKak(kak: string): string {
  return kak.replace(/[^A-Za-z0-9._-]/g, '_')
}

function toDate(v?: string | null): Date | null {
  if (!v) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

function gemiDocKey(trdrId: string, kak: string, docKind: 'DECISION' | 'PUBLICATION' | 'OTHER', ext: string): string {
  const prefix = docKind === 'PUBLICATION' ? 'pub-' : ''
  return `trdr/${trdrId}/gemi/${prefix}${sanitizeKak(kak)}.${ext}`
}

type ImportDocFields = {
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
async function importGemiDocument(trdrId: string, kak: string, fields: ImportDocFields): Promise<void> {
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
    storageKey = gemiDocKey(trdrId, kak, fields.docKind, safeExt(contentType))
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
async function resolveArGemi(trdr: { AFM: string | null; arGemi: string | null }, given?: string): Promise<string> {
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
export async function gemiSyncTrdr(trdrId: string, opts: { arGemi?: string; syncDocuments?: boolean } = {}) {
  await requirePermission('customer.edit')

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId } })
  if (!trdr) notFound()

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

  await prisma.$transaction(async (tx) => {
    await tx.trdr.update({
      where: { id: trdrId },
      data: {
        NAME: m.NAME || undefined,
        ADDRESS: m.ADDRESS,
        ZIP: m.ZIP,
        CITY: m.CITY,
        ...(m.EMAIL !== undefined ? { EMAIL: m.EMAIL } : {}),
        arGemi: m.arGemi,
        gemiOffice: m.gemiOffice,
        gemiStatus: m.gemiStatus,
        gemiObjective: m.gemiObjective,
        gemiIsBranch: m.gemiIsBranch,
        gemiAutoRegistered: m.gemiAutoRegistered,
        gemiLastStatusChange: m.gemiLastStatusChange,
        gemiSyncedAt: new Date(),
        gemiData: company as unknown as Prisma.InputJsonValue,
        foundingDate: m.foundingDate,
        appLegalForm: m.appLegalForm,
        ISACTIVE: m.ISACTIVE,
      },
    })
    await replaceTrdrKad(tx, trdrId, kadRows)
  })

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

  revalidatePath(`/partners/${trdrId}`)
  return { ok: true as const, arGemi, kads: kadRows.length, documentsImported, documentsFailed }
}

// ── Region matching (row + bulk) ────────────────────────────────────────────

type TrdrForMatch = {
  ADDRESS: string | null
  CITY: string | null
  DISTRICT: string | null
  ZIP: string | null
  appLat: number | null
  appLng: number | null
  gemiData: unknown
}

function matchInputFromTrdr(trdr: TrdrForMatch) {
  const gemiData = trdr.gemiData as GemiCompanyRaw | null
  return {
    address: trdr.ADDRESS,
    city: trdr.CITY,
    district: trdr.DISTRICT,
    zip: trdr.ZIP,
    municipalityDescr: gemiData?.municipality?.descr ?? null,
    prefectureDescr: gemiData?.prefecture?.descr ?? null,
    latitude: trdr.appLat,
    longitude: trdr.appLng,
  }
}

/** Εντοπισμός Region για ΕΝΑ Trdr — γράφει regionCode αν βρεθεί match, αλλιώς null χωρίς εγγραφή. */
export async function matchTrdrRegionAction(trdrId: string): Promise<RegionMatch | null> {
  await requirePermission('customer.edit')

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId } })
  if (!trdr) notFound()

  const match = await matchRegion(matchInputFromTrdr(trdr))
  if (!match) return null

  await prisma.trdr.update({ where: { id: trdrId }, data: { regionCode: match.regionCode } })
  revalidatePath(`/partners/${trdrId}`)
  return match
}

export type BulkMatchTallies = { gemi: number; name: number; geo: number; none: number; failed: number }

/** Μαζικός εντοπισμός Region για όλα τα Trdr με regionCode=null (cap 500) — ανά-γραμμή try/catch. */
export async function bulkMatchTrdrRegions(): Promise<BulkMatchTallies> {
  await requirePermission('customer.edit')

  const rows = await prisma.trdr.findMany({
    where: { regionCode: null },
    select: { id: true, ADDRESS: true, CITY: true, DISTRICT: true, ZIP: true, appLat: true, appLng: true, gemiData: true },
    take: 500,
  })

  const tallies: BulkMatchTallies = { gemi: 0, name: 0, geo: 0, none: 0, failed: 0 }
  for (const row of rows) {
    try {
      const match = await matchRegion(matchInputFromTrdr(row))
      if (match) {
        await prisma.trdr.update({ where: { id: row.id }, data: { regionCode: match.regionCode } })
        tallies[match.confidence]++
      } else {
        tallies.none++
      }
    } catch {
      tallies.failed++
    }
  }

  revalidatePath('/partners')
  return tallies
}

// ── ΓΕΜΗ documents: on-demand preview + save + saved list + remove ─────────

export type GemiDocumentPreview = {
  kak: string
  docKind: 'DECISION' | 'PUBLICATION'
  title: string
  dates: { dateAssemblyDecided?: string | null; dateAnnounced?: string | null; dateRegistrated?: string | null }
  sourceUrl: string | null
  alreadySaved: boolean
}

/** Live preview (χωρίς αποθήκευση) — απαιτεί αποθηκευμένο arGemi στο Trdr. */
export async function listTrdrGemiDocuments(trdrId: string): Promise<GemiDocumentPreview[]> {
  await requirePermission('customer.view')

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true, arGemi: true } })
  if (!trdr) notFound()
  if (!trdr.arGemi) throw new Error('Ο συναλλασσόμενος δεν έχει αριθμό ΓΕΜΗ.')

  const [docSet, saved] = await Promise.all([
    getGemiCompanyDocuments(trdr.arGemi),
    prisma.trdrDocument.findMany({ where: { trdrId }, select: { kak: true } }),
  ])
  const savedKaks = new Set(saved.map((d) => d.kak).filter((k): k is string => Boolean(k)))

  const decisions: GemiDocumentPreview[] = (docSet.decision ?? [])
    .filter((d): d is GemiDocumentDecision & { kak: string } => Boolean(d.kak))
    .map((d) => ({
      kak: d.kak,
      docKind: 'DECISION',
      title: d.decisionSubject || d.summary || `Απόφαση ${d.kak}`,
      dates: { dateAssemblyDecided: d.dateAssemblyDecided ?? null, dateAnnounced: d.dateAnnounced ?? null, dateRegistrated: d.dateRegistrated ?? null },
      sourceUrl: d.assemblyDecisionUrl ?? null,
      alreadySaved: savedKaks.has(d.kak),
    }))
  const publications: GemiDocumentPreview[] = (docSet.publication ?? [])
    .filter((p): p is GemiDocumentPublication & { kad: string } => Boolean(p.kad))
    .map((p) => ({
      kak: p.kad,
      docKind: 'PUBLICATION',
      title: `Δημοσίευση ΥΜΣ ${p.kad}`,
      dates: {},
      sourceUrl: p.url ?? null,
      alreadySaved: savedKaks.has(p.kad),
    }))

  return [...decisions, ...publications]
}

/** Αποθήκευση ΕΝΟΣ εγγράφου ΓΕΜΗ επιλογής χρήστη (από το on-demand preview) — download→Bunny→upsert TrdrDocument. */
export async function saveTrdrGemiDocument(
  trdrId: string,
  input: {
    kak: string
    docKind: 'DECISION' | 'PUBLICATION' | 'OTHER'
    title: string
    sourceUrl: string
    dates?: { dateAssemblyDecided?: string | null; dateAnnounced?: string | null; dateRegistrated?: string | null }
    metadata?: unknown
  },
) {
  await requirePermission('customer.edit')

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true } })
  if (!trdr) notFound()

  const { buffer, contentType } = await downloadGemiFile(input.sourceUrl)
  const storageKey = gemiDocKey(trdrId, input.kak, input.docKind, safeExt(contentType))
  await bunnyUploadPrivate({ key: storageKey, body: buffer, contentType })

  const shared = {
    docKind: input.docKind,
    title: input.title,
    sourceUrl: input.sourceUrl,
    storageKey,
    mimeType: contentType,
    sizeBytes: buffer.length,
    dateAssemblyDecided: toDate(input.dates?.dateAssemblyDecided),
    dateAnnounced: toDate(input.dates?.dateAnnounced),
    dateRegistrated: toDate(input.dates?.dateRegistrated),
    metadata: (input.metadata ?? {}) as Prisma.InputJsonValue,
  }

  const doc = await prisma.trdrDocument.upsert({
    where: { trdrId_kak: { trdrId, kak: input.kak } },
    update: shared,
    create: { trdrId, source: 'GEMI', kak: input.kak, ...shared },
  })

  revalidatePath(`/partners/${trdrId}`)
  return doc
}

/** Αποθηκευμένα TrdrDocument (ΟΧΙ live ΓΕΜΗ) για την καρτέλα. */
export async function listTrdrDocuments(trdrId: string) {
  await requirePermission('customer.view')
  return prisma.trdrDocument.findMany({ where: { trdrId }, orderBy: { createdAt: 'desc' } })
}

/** Διαγραφή ενός αποθηκευμένου TrdrDocument (τη γραμμή — ΟΧΙ το αρχείο στο Bunny, βλ. module doc). */
export async function removeTrdrDocument(docId: string) {
  await requirePermission('customer.edit')

  const doc = await prisma.trdrDocument.findUnique({ where: { id: docId } })
  if (!doc) notFound()

  await prisma.trdrDocument.delete({ where: { id: docId } })
  revalidatePath(`/partners/${doc.trdrId}`)
  return { ok: true as const }
}
