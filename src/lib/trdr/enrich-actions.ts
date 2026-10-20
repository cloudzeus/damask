'use server'

import { revalidatePath } from 'next/cache'
import { notFound } from 'next/navigation'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { trdrGemiFolder } from '@/lib/trdr/cdn-folder'
import {
  searchGemiCompanies,
  getGemiCompany,
  getGemiCompanyDocuments,
  downloadGemiFile,
  mapGemiCompany,
  gemiMetadata,
  type GemiCompanyRaw,
  type GemiDocumentDecision,
  type GemiDocumentPublication,
} from '@/lib/trdr/gemi'
import { aadeLookup } from '@/lib/trdr/aade'
import { matchRegion, type RegionMatch } from '@/lib/registries/regions'
import { logActivity } from '@/lib/activity/log'
import {
  applyAadeCore, gemiSyncCore, buildTrdrKadRows, replaceTrdrKad, safeExt, toDate, gemiDocKey, type RawActivity,
} from '@/lib/trdr/enrich-core'

/**
 * Server actions πίσω από τον εμπλουτισμό Trdr με ΓΕΜΗ/ΑΑΔΕ/Geo (W2 spec §0.7).
 * Gating: ΙΔΙΟ idiom με src/app/(app)/partners/actions.ts — 'customer.view' για
 * αναγνώσεις/previews χωρίς εγγραφή (ακόμα κι αν χτυπάνε εξωτερικό API),
 * 'customer.edit' για ΚΑΘΕ mutation. ΚΑΝΕΝΑ νέο permission.
 *
 * Ref semantics: pb-ref app/api/admin/companies/[id]/gemi-sync/route.ts —
 * βλ. buildTrdrKadRows παρακάτω για το PRIMARY-preferred dedupe (πιστό port).
 */

// ── ΑΑΔΕ preview + apply ────────────────────────────────────────────────────

/** Preview (καμία εγγραφή) — ΑΦΜ → mapped στοιχεία + activities. */
export async function aadeLookupTrdr(afm: string) {
  await requirePermission('customer.view')
  return aadeLookup(afm)
}

/** ΑΦΜ υποχρεωτικό στο Trdr — γράφει τα ΑΑΔΕ πεδία + TrdrKad replace + aadeSyncedAt. */
export async function applyAadeToTrdr(trdrId: string) {
  await requirePermission('customer.edit')
  const r = await applyAadeCore(trdrId)
  // Νέα διεύθυνση/ΚΑΔ → ΓΕΜΗ (αν λείπει) + γεωκωδικοποίηση + περιφέρεια + δυνητικά προγράμματα (παρασκήνιο).
  { const { enqueueTrdrDerive } = await import('@/lib/trdr/derive'); await enqueueTrdrDerive(trdrId) }
  revalidatePath(`/partners/${trdrId}`)
  return r
}

export type AadeKadCheck = {
  ok: true
  aadeName: string | null
  added: { code: string; description: string; kind: 'PRIMARY' | 'SECONDARY' }[]
  removed: { code: string; description: string }[]
  unchanged: number
}

/**
 * Read-only «Έλεγχος για νέους ΚΑΔ» — φέρνει τους ΚΑΔ της ΑΑΔΕ, τους
 * κανονικοποιεί με ΤΟ ΙΔΙΟ pipeline του applyAadeToTrdr (buildTrdrKadRows) και
 * τους συγκρίνει με τους ήδη αποθηκευμένους TrdrKad. ΔΕΝ γράφει τίποτα — η
 * εφαρμογή γίνεται μέσω applyAadeToTrdr. Η σύγκριση είναι στον κανονικό κωδικό
 * (r.code), όχι στον raw ΑΑΔΕ, ώστε να ταιριάζει με το TrdrKad.code που αποθηκεύεται.
 */
export async function aadeKadCheckTrdr(trdrId: string): Promise<AadeKadCheck> {
  await requirePermission('customer.view')

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { AFM: true } })
  if (!trdr) notFound()
  if (!trdr.AFM) throw new Error('Ο συναλλασσόμενος δεν έχει ΑΦΜ — δεν μπορεί να γίνει έλεγχος ΑΑΔΕ.')

  const result = await aadeLookup(trdr.AFM)
  if (!result) throw new Error(`Δεν βρέθηκαν στοιχεία ΑΑΔΕ για το ΑΦΜ ${trdr.AFM}.`)

  const rawActivities: RawActivity[] = result.activities
    .filter((a): a is { code: string; description: string | null; kind: 'PRIMARY' | 'SECONDARY'; order: number } => a.code != null)
    .map((a) => ({ code: a.code, description: a.description ?? '', kind: a.kind, order: a.order }))
  const kadRows = rawActivities.length > 0 ? await buildTrdrKadRows(trdrId, rawActivities) : []

  const existing = await prisma.trdrKad.findMany({ where: { trdrId }, select: { code: true, description: true } })
  const existingCodes = new Set(existing.map((e) => e.code))
  const incomingCodes = new Set(kadRows.map((r) => r.code))

  const added = kadRows
    .filter((r) => !existingCodes.has(r.code))
    .map((r) => ({ code: r.code, description: r.description, kind: r.kind }))
  const removed = existing
    .filter((e) => !incomingCodes.has(e.code))
    .map((e) => ({ code: e.code, description: e.description }))

  return { ok: true, aadeName: result.mapped.NAME, added, removed, unchanged: kadRows.length - added.length }
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

/**
 * resolve arGemi (input→stored→search με ΑΦΜ) → update Trdr (ΓΕΜΗ πεδία + gemiData raw) + TrdrKad replace
 * + έγγραφα (ανά έγγραφο, μη-θανατηφόρα). Πυρήνας: gemiSyncCore (enrich-core.ts).
 */
export async function gemiSyncTrdr(trdrId: string, opts: { arGemi?: string; syncDocuments?: boolean } = {}) {
  await requirePermission('customer.edit')
  const r = await gemiSyncCore(trdrId, opts)
  { const { enqueueTrdrDerive } = await import('@/lib/trdr/derive'); await enqueueTrdrDerive(trdrId) }
  revalidatePath(`/partners/${trdrId}`)
  return r
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

export type BulkKadTallies = { updated: number; noKad: number; failed: number }

/**
 * Μαζικός εντοπισμός ΚΑΔ από ΑΑΔΕ για Trdr με ΑΦΜ αλλά ΧΩΡΙΣ κανέναν ΚΑΔ
 * (fill-missing, ίδιο idiom με bulkMatchTrdrRegions — cap 200 γιατί εδώ κάθε
 * γραμμή κάνει ΕΝΑ εξωτερικό ΑΑΔΕ lookup, σε αντίθεση με τον region matcher που
 * δουλεύει μόνο σε αποθηκευμένα δεδομένα). Ανά-γραμμή try/catch — μια αποτυχία
 * ΑΑΔΕ δεν σταματά τους υπόλοιπους. Γράφει μόνο τους ΚΑΔ + aadeSyncedAt (δεν
 * αγγίζει NAME/διεύθυνση σε μαζική λειτουργία).
 */
export async function bulkAadeKadTrdr(): Promise<BulkKadTallies> {
  await requirePermission('customer.edit')

  const rows = await prisma.trdr.findMany({
    where: { AFM: { not: null }, kads: { none: {} } },
    select: { id: true, AFM: true },
    take: 200,
  })

  const tallies: BulkKadTallies = { updated: 0, noKad: 0, failed: 0 }
  for (const row of rows) {
    if (!row.AFM) { tallies.failed++; continue }
    try {
      const result = await aadeLookup(row.AFM)
      const rawActivities: RawActivity[] = (result?.activities ?? [])
        .filter((a): a is { code: string; description: string | null; kind: 'PRIMARY' | 'SECONDARY'; order: number } => a.code != null)
        .map((a) => ({ code: a.code, description: a.description ?? '', kind: a.kind, order: a.order }))
      const kadRows = rawActivities.length > 0 ? await buildTrdrKadRows(row.id, rawActivities) : []
      if (kadRows.length === 0) { tallies.noKad++; continue }
      await prisma.$transaction(async (tx) => {
        await replaceTrdrKad(tx, row.id, kadRows)
        await tx.trdr.update({ where: { id: row.id }, data: { aadeSyncedAt: new Date() } })
      })
      tallies.updated++
    } catch {
      tallies.failed++
    }
  }

  await logActivity('partner.kad_bulk', { entityType: 'trdr', meta: { ...tallies } })
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
  const gemiBase = (await trdrGemiFolder(trdrId)) ?? `trdr/${trdrId}/gemi/`
  const storageKey = gemiDocKey(gemiBase, input.kak, input.docKind, safeExt(contentType))
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

// ── ΓΕΜΗ metadata refresh (admin op — Ρυθμίσεις) ────────────────────────────

export type RefreshGemiMetadataCounts = {
  legalTypes: number
  gemiOffices: number
  companyStatuses: number
  prefectures: number
  municipalities: number
}

function toRefDate(v?: string): Date | null {
  return v ? new Date(v) : null
}

/**
 * Ανανέωση των 5 μητρώων αναφοράς ΓΕΜΗ (LegalType/GemiOfficeRef/CompanyStatusRef/
 * PrefectureRef/MunicipalityRef) από το Open Data API — admin/metadata op, ΟΧΙ
 * mutation Trdr, gated 'settings.manage' (ίδιο permission με τις υπόλοιπες
 * κάρτες Ρυθμίσεων — βλ. src/app/(app)/settings/actions.ts).
 *
 * Ref: pb-ref app/api/admin/metadata/refresh-gemi/route.ts — municipalities
 * ΤΕΛΕΥΤΑΙΑ (FK σε PrefectureRef). Το DAMASK schema δεν έχει `descrEn` στήλη
 * (ref είχε) — παραλείπεται.
 */
export async function refreshGemiMetadata(): Promise<{ ok: true; counts: RefreshGemiMetadataCounts }> {
  await requirePermission('settings.manage')

  const [legalTypes, gemiOffices, statuses, prefectures, municipalities] = await Promise.all([
    gemiMetadata.legalTypes(),
    gemiMetadata.gemiOffices(),
    gemiMetadata.companyStatuses(),
    gemiMetadata.prefectures(),
    gemiMetadata.municipalities(),
  ])

  const toInt = (v: string | number) => (typeof v === 'number' ? v : parseInt(v, 10))

  await Promise.all(
    legalTypes.map((t) => {
      const id = toInt(t.id)
      return prisma.legalType.upsert({
        where: { id },
        update: { descr: t.descr, lastUpdated: toRefDate(t.lastUpdated) },
        create: { id, descr: t.descr, lastUpdated: toRefDate(t.lastUpdated) },
      })
    }),
  )

  await Promise.all(
    gemiOffices.map((o) => {
      const id = toInt(o.id)
      const fields = {
        descr: o.descr,
        address: o.address ?? null,
        city: o.city ?? null,
        zip: o.zipCode ?? null,
        phone: o.phone ?? null,
        fax: o.fax ?? null,
        url: o.url ?? null,
        lastUpdated: toRefDate(o.lastUpdated),
      }
      return prisma.gemiOfficeRef.upsert({ where: { id }, update: fields, create: { id, ...fields } })
    }),
  )

  await Promise.all(
    statuses.map((s) => {
      const id = toInt(s.id)
      const fields = { descr: s.descr, isActive: s.isActive, lastUpdated: toRefDate(s.lastUpdated) }
      return prisma.companyStatusRef.upsert({ where: { id }, update: fields, create: { id, ...fields } })
    }),
  )

  await Promise.all(
    prefectures.map((p) => {
      const id = String(p.id)
      const fields = { descr: p.descr, lastUpdated: toRefDate(p.lastUpdated) }
      return prisma.prefectureRef.upsert({ where: { id }, update: fields, create: { id, ...fields } })
    }),
  )

  // Municipalities ΤΕΛΕΥΤΑΙΑ — FK σε PrefectureRef (prefectureId).
  await Promise.all(
    municipalities.map((m) => {
      const id = String(m.id)
      const fields = { descr: m.descr, prefectureId: m.prefectureId ?? null, lastUpdated: toRefDate(m.lastUpdated) }
      return prisma.municipalityRef.upsert({ where: { id }, update: fields, create: { id, ...fields } })
    }),
  )

  return {
    ok: true,
    counts: {
      legalTypes: legalTypes.length,
      gemiOffices: gemiOffices.length,
      companyStatuses: statuses.length,
      prefectures: prefectures.length,
      municipalities: municipalities.length,
    },
  }
}
