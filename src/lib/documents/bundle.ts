import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { isSeriesKind, normalizePeriod, periodLabel, type SeriesKind } from '@/lib/documents/series'

/**
 * (Plain module — worker.) ΠΑΚΕΤΟ δικαιολογητικών σειράς σε ένα PDF (π.χ. «5 Φ2 2021» = 12 μηνιαία Φ2): χωρίζεται
 * ΣΕΛΙΔΑ-ΣΕΛΙΔΑ σε ένα έγγραφο ανά περίοδο — ίδια λογική με τις μισθοδοτικές (κομμάτια σελίδων, επανάληψη/μισό σε
 * αποτυχία). Κάθε περίοδος γίνεται κανονικό δικαιολογητικό (τιμές «Σάρωσης τιμών», πλέγμα σειράς, υποχρεώσεις).
 */

export const QUEUE_SERIES_BUNDLE = 'series-bundle'
const PAGES_PER_CHUNK = 6

type PageInfo = { page: number; period: string | null; continues: boolean }

async function readPagePeriods(pdf: Uint8Array, pages: number[], kind: SeriesKind, typeName: string, userId: string | null, refId: string): Promise<PageInfo[]> {
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(pdf, { ignoreEncryption: true })
  const part = await PDFDocument.create()
  for (const pg of await part.copyPages(src, pages)) part.addPage(pg)
  const { geminiGenerate } = await import('@/lib/gemini')
  const unit = kind === 'MONTHLY' ? 'YYYY-MM (μήνας φορολογικής περιόδου)' : kind === 'QUARTERLY' ? 'YYYY-Q1..Q4' : 'YYYY'
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const r = await geminiGenerate({
        parts: [{ inlineData: { data: Buffer.from(await part.save()).toString('base64'), mimeType: 'application/pdf' } }, { text: `Οι σελίδες είναι οι ${pages.map(p => p + 1).join(', ')} ενός PDF.` }],
        systemInstruction: [
          `Το PDF περιέχει ΠΟΛΛΑ έγγραφα τύπου «${typeName}» (σειρά ανά περίοδο), το ένα μετά το άλλο.`,
          `Για ΚΑΘΕ σελίδα (με τη σειρά) πες την περίοδο που αφορά (${unit}) και αν είναι συνέχεια (2η+ σελίδα) του ίδιου εγγράφου με την προηγούμενη.`,
          'Απάντησε ΑΥΣΤΗΡΑ JSON: {"pages":[{"page": αριθμός σελίδας όπως δόθηκε, "period": "…" ή null, "continues": true|false}]}',
        ].join('\n'),
        json: true, fast: true, scope: 'OCR_VISION', refType: 'series-bundle', refId, userId,
      })
      const p = (parseJsonLoose(r.text) ?? {}) as { pages?: { page?: unknown; period?: unknown; continues?: unknown }[] }
      const out = (p.pages ?? []).map((x, i) => ({
        page: pages[i] ?? Number(x.page) - 1,
        period: normalizePeriod(typeof x.period === 'string' ? x.period : null, kind),
        continues: x.continues === true,
      }))
      if (out.length) return out
    } catch (err) { if (attempt) throw err }
  }
  return pages.map(page => ({ page, period: null, continues: false }))
}

export type SplitResult = { bundle: boolean; created: { period: string; docId: string }[]; existing: string[]; unknownPages: number[] }

/** Χωρίζει ένα δικαιολογητικό-πακέτο σε έγγραφα ανά περίοδο. Αν είναι ΕΝΑ έγγραφο (μία περίοδος) δεν κάνει τίποτα. */
export async function splitSeriesBundle(docId: string, userId: string | null): Promise<SplitResult> {
  const doc = await prisma.trdrDossierDocument.findUniqueOrThrow({
    where: { id: docId },
    select: { id: true, trdrId: true, name: true, storageKey: true, mimeType: true, programId: true, reusable: true, uploadedById: true, documentTypeId: true, documentType: { select: { name: true, seriesKind: true } } },
  })
  const kind = doc.documentType.seriesKind
  const none: SplitResult = { bundle: false, created: [], existing: [], unknownPages: [] }
  if (!isSeriesKind(kind) || kind === 'LIST' || (doc.mimeType ?? '') !== 'application/pdf') return none
  const bytes = new Uint8Array(await bunnyDownload(doc.storageKey))
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(bytes, { ignoreEncryption: true })
  const total = src.getPageCount()
  if (total < 2) return none

  // 1. Περίοδος ανά σελίδα (κομμάτια 6 σελίδων).
  const infos: PageInfo[] = []
  for (let i = 0; i < total; i += PAGES_PER_CHUNK) {
    const pages = Array.from({ length: Math.min(PAGES_PER_CHUNK, total - i) }, (_, k) => i + k)
    infos.push(...await readPagePeriods(bytes, pages, kind, doc.documentType.name, userId, doc.id))
  }
  // 2. Ομάδες: διαδοχικές σελίδες ίδιας περιόδου (ή «συνέχεια») = ένα έγγραφο.
  const groups: { period: string; pages: number[] }[] = []
  const unknownPages: number[] = []
  for (const p of infos.sort((a, b) => a.page - b.page)) {
    const last = groups[groups.length - 1]
    if (last && (p.period === last.period || (p.continues && !p.period))) { last.pages.push(p.page); continue }
    if (!p.period) { unknownPages.push(p.page + 1); continue }
    groups.push({ period: p.period, pages: [p.page] })
  }
  if (new Set(groups.map(g => g.period)).size < 2) return { ...none, unknownPages }

  // 3. Ένα δικαιολογητικό ανά περίοδο (όσα δεν υπάρχουν ήδη) — με ανάγνωση τιμών/κάλυψη υποχρεώσεων όπως κάθε ανέβασμα.
  const { createDossierDocCore } = await import('@/lib/documents/dossier-core')
  const created: SplitResult['created'] = []
  const existing: string[] = []
  const owner = userId ?? doc.uploadedById
  if (!owner) throw new Error('Χωρίς χρήστη για την καταχώριση.')
  for (const g of groups) {
    const dup = await prisma.trdrDossierDocument.findFirst({ where: { trdrId: doc.trdrId, documentTypeId: doc.documentTypeId, period: g.period, id: { not: doc.id } }, select: { id: true } })
    if (dup) { existing.push(g.period); continue }
    const part = await PDFDocument.create()
    for (const pg of await part.copyPages(src, g.pages)) part.addPage(pg)
    const body = Buffer.from(await part.save())
    const r = await createDossierDocCore(doc.trdrId, owner, {
      documentTypeId: doc.documentTypeId, name: `${doc.documentType.name} ${periodLabel(g.period)} (από «${doc.name}», σελ. ${g.pages.map(p => p + 1).join('-')})`.slice(0, 200),
      base64: body.toString('base64'), body, mimeType: 'application/pdf', ext: 'pdf', period: g.period,
      programId: doc.programId, reusable: doc.reusable, issuedAt: null, expiresAt: null, fromBundle: true,
    })
    created.push({ period: g.period, docId: r.id })
  }
  // 4. Το πακέτο αντικαταστάθηκε από τα επιμέρους (το αρχείο μένει στο Bunny ως πρωτότυπο).
  if (created.length || existing.length) {
    await prisma.trdrFormRecord.updateMany({ where: { dossierDocId: doc.id }, data: { dossierDocId: null } })
    await prisma.trdrDossierDocument.delete({ where: { id: doc.id } })
    // Υποχρεώσεις σειράς των έργων του πελάτη: ξανά από τα επιμέρους (και καθαρισμός αναφορών στο πακέτο).
    await prisma.applicationDocument.deleteMany({ where: { storageKey: doc.storageKey, application: { trdrId: doc.trdrId } } })
    const { syncSeriesForApplication } = await import('@/lib/pm/form-obligations')
    for (const a of await prisma.programApplication.findMany({ where: { trdrId: doc.trdrId }, select: { id: true } })) await syncSeriesForApplication(a.id)
  }
  return { bundle: true, created, existing, unknownPages }
}

/** Στο παρασκήνιο (pg-boss) — καλείται μετά από ανέβασμα δικαιολογητικού σειράς σε PDF πολλών σελίδων. */
export async function enqueueBundleSplit(docId: string, userId: string | null): Promise<void> {
  try {
    const { startBoss } = await import('@/lib/queue')
    const boss = await startBoss()
    await boss.send(QUEUE_SERIES_BUNDLE, { docId, userId }, { singletonKey: docId, retryLimit: 1 })
  } catch (err) { console.error('[bundle] προγραμματισμός απέτυχε', err) }
}

/** Εργασία παρασκηνίου: χωρισμός + ειδοποίηση με το αποτέλεσμα. */
export async function runBundleJob(docId: string, userId: string | null): Promise<SplitResult | null> {
  const doc = await prisma.trdrDossierDocument.findUnique({ where: { id: docId }, select: { name: true, trdrId: true, trdr: { select: { NAME: true } } } })
  if (!doc) return null
  const r = await splitSeriesBundle(docId, userId)
  if (r.bundle) {
    const { createNotification } = await import('@/lib/notifications/service')
    await createNotification({
      title: `Πακέτο «${doc.name}» χωρίστηκε σε ${r.created.length} περιόδους`,
      body: [
        `${doc.trdr.NAME}: ${r.created.map(c => periodLabel(c.period)).join(', ') || '—'}.`,
        r.existing.length ? `Υπήρχαν ήδη: ${r.existing.map(periodLabel).join(', ')}.` : null,
        r.unknownPages.length ? `Χωρίς αναγνωρισμένη περίοδο οι σελίδες ${r.unknownPages.join(', ')}.` : null,
      ].filter(Boolean).join(' '),
      entityType: 'Trdr', entityId: doc.trdrId, meta: { kind: 'series-bundle', created: r.created.length },
    })
  }
  return r
}
