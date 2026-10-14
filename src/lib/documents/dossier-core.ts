import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { coverObligationsFromDossierDoc } from '@/lib/pm/form-obligations'
import { processTemplateIfApplicable, type TemplateApplied } from '@/lib/tax/template-auto'
import { isEmeDocumentType, parseEmeText, extractEmeWithAi, applyEmeToTrdr } from '@/lib/tax/eme'
import { isE3TypeName, extractE3WithAi, applyE3ToTrdr, type E3Applied } from '@/lib/tax/e3'
import { isMmeTypeName, extractMmeWithAi, applyMmeToTrdr, govgrCodeFromText, type MmeApplied } from '@/lib/tax/mme'

/**
 * (Plain module — ΧΩΡΙΣ έλεγχο δικαιωμάτων· ο καλών τον κάνει.) Καταχώριση δικαιολογητικού στην αποθήκη πελάτη με
 * όλη την αυτόματη επεξεργασία (κάλυψη εκκρεμοτήτων, ΕΜΕ/Ε3/Δήλωση ΜΜΕ, Οδηγός Εντύπου, εκμάθηση αναγνώρισης).
 * Το καλεί το server action uploadTrdrDossierDoc (με session) και η μαζική εισαγωγή στο παρασκήνιο (worker).
 */

export type DossierUploadInput = {
    documentTypeId: string; name: string; base64: string; mimeType: string; ext: string
  /** Τα bytes ήδη σε μνήμη (worker) — αλλιώς από το base64. */
  body?: Buffer
    issuedAt?: string | null; expiresAt?: string | null
    programId?: string | null; reusable?: boolean
    /** Από την έξυπνη αναγνώριση: τι είχε προταθεί + απόσπασμα κειμένου → γίνεται
     * παράδειγμα εκμάθησης (επιβεβαίωση ή διόρθωση). */
    learn?: { predictedTypeId: string | null; snippet: string; fileName: string } | null
    /** Αντικατάσταση: το παλιό δικαιολογητικό (ίδιου πελάτη) αφαιρείται μετά την αποθήκευση. */
    replaceDocId?: string | null
    /** Πλήρες ψηφιακό κείμενο (αν υπάρχει) — για ειδικούς τύπους όπως το ΕΜΕ. */
    fullText?: string | null
    /** Περίοδος για τύπους-σειρές (π.χ. Φ2 «2025-03»). */
    period?: string | null
    /** Τμήμα από χωρισμό πακέτου (δεν ξαναελέγχεται ως πακέτο). */
    fromBundle?: boolean
}

export type DossierUploadResult = { id: string; covered: number; coveredPrograms: string[]; eme?: EmeApplied | null; e3?: E3Applied | null; mme?: MmeApplied | null; template?: TemplateApplied | null }

export async function createDossierDocCore(trdrId: string, userId: string, input: DossierUploadInput): Promise<DossierUploadResult> {
  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true } })
  if (!trdr) throw new Error('Ο συναλλασσόμενος δεν βρέθηκε.')

  const id = crypto.randomUUID()
  const docPeriod = await periodFor(input.documentTypeId, input.period)
  const ext = (input.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `dossier/${trdrId}/${id}.${ext}`
  const body = input.body ?? Buffer.from(input.base64, 'base64')
  await bunnyUploadPrivate({ key, body, contentType: input.mimeType })

  await prisma.trdrDossierDocument.create({
    data: {
      id,
      trdrId,
      documentTypeId: input.documentTypeId,
      name: input.name.trim() || 'Δικαιολογητικό',
      storageKey: key,
      mimeType: input.mimeType,
      sizeBytes: Buffer.byteLength(body),
      contentHash: crypto.createHash('sha256').update(body).digest('hex'),
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      programId: input.programId || null,
      reusable: input.reusable ?? true,
      period: docPeriod,
      uploadedById: userId,
    },
  })
  if (input.replaceDocId) {
    await prisma.trdrDossierDocument.deleteMany({ where: { id: input.replaceDocId, trdrId } })
  }
  if (input.learn && (input.learn.snippet.trim() || input.learn.fileName.trim())) {
    await prisma.documentClassificationExample.create({
      data: {
        documentTypeId: input.documentTypeId,
        predictedTypeId: input.learn.predictedTypeId,
        wasCorrect: input.learn.predictedTypeId === input.documentTypeId,
        fileName: input.learn.fileName.slice(0, 200),
        snippet: input.learn.snippet.slice(0, 1500),
        trdrId,
        createdById: userId,
      },
    }).catch(() => { /* η εκμάθηση δεν μπλοκάρει ποτέ την αποθήκευση */ })
  }
  // Καλύπτει αυτόματα τις ανοιχτές εκκρεμότητες ίδιου τύπου στα προγράμματα του πελάτη.
  const cover = await coverObligationsFromDossierDoc(id).catch(() => ({ covered: 0, programs: [] as string[] }))
  // ΕΜΕ: αυτόματη ανάγνωση εργαζομένων/μέσου όρου → Οδηγός Εντύπων + εργαζόμενοι εταιρίας.
  const eme = await processEmeIfApplicable({ trdrId, documentTypeId: input.documentTypeId, fullText: input.fullText ?? null, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: userId })
  // Ε3: αυτόματη ανάγνωση κύκλου εργασιών/αποτελεσμάτων ανά έτος + κάλυψη εκκρεμοτήτων «Ε3 <έτος>».
  const e3 = await processE3IfApplicable({ docId: id, trdrId, documentTypeId: input.documentTypeId, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: userId })
  if (e3?.coveredExtra) { cover.covered += e3.coveredExtra.covered; cover.programs.push(...e3.coveredExtra.programs) }
  // Δήλωση ΜΜΕ (επίσημη για ΟΠΣΚΕ): ΕΜΕ/κύκλος εργασιών/κατηγορία + κάλυψη ισοδύναμων τύπων.
  const mme = await processMmeIfApplicable({ docId: id, trdrId, documentTypeId: input.documentTypeId, fullText: input.fullText ?? null, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: userId })
  if (mme?.coveredExtra) { cover.covered += mme.coveredExtra.covered; cover.programs.push(...mme.coveredExtra.programs) }
  // Οποιοσδήποτε άλλος τύπος με έτοιμο Οδηγό Εντύπου: βρίσκει τα δηλωμένα πεδία και τα καταχωρεί στον προορισμό τους.
  const template = !eme && !e3 && !mme
    ? await processTemplateIfApplicable({ docId: id, trdrId, documentTypeId: input.documentTypeId, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: userId, period: docPeriod, text: input.fullText ?? null })
    : null
  // Οι τιμές του Οδηγού διαβάστηκαν τώρα → η ξαναεξέταση καταλόγου δεν θα τις ξαναδιαβάσει (βλ. import/catalog.ts).
  if (template) await prisma.trdrDossierDocument.update({ where: { id }, data: { valuesReadAt: new Date() } }).catch(() => {})
  // ΠΑΚΕΤΟ σειράς (π.χ. 12 Φ2 σε ένα PDF) → χωρισμός σελίδα-σελίδα σε έγγραφα ανά περίοδο, στο παρασκήνιο.
  if (!input.fromBundle && input.mimeType === 'application/pdf') {
    try {
      const t = await prisma.documentType.findUnique({ where: { id: input.documentTypeId }, select: { seriesKind: true } })
      if (t?.seriesKind && t.seriesKind !== 'LIST') {
        const { PDFDocument } = await import('pdf-lib')
        const pages = (await PDFDocument.load(body, { ignoreEncryption: true })).getPageCount()
        if (pages >= 2) { const { enqueueBundleSplit } = await import('@/lib/documents/bundle'); await enqueueBundleSplit(id, userId) }
      }
    } catch (err) { console.error('[dossier] έλεγχος πακέτου απέτυχε', err) }
  }
  return { id, covered: cover.covered, coveredPrograms: [...new Set(cover.programs)], eme, e3: e3?.applied ?? null, mme: mme?.applied ?? null, template }
}


export async function periodFor(documentTypeId: string, raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null
  const t = await prisma.documentType.findUnique({ where: { id: documentTypeId }, select: { seriesKind: true } })
  const { isSeriesKind, normalizePeriod } = await import('./series')
  return isSeriesKind(t?.seriesKind) ? normalizePeriod(raw, t.seriesKind) : null
}

// ── ΕΜΕ (Πίνακας ταξινόμησης βάσει μεγέθους) ─────────────────────────────────

export type EmeApplied = { year: number; eme: number | null; employees: number; updatedCompany: boolean; afmMismatch: boolean }

async function processEmeIfApplicable(input: {
  trdrId: string
  documentTypeId: string
  fullText: string | null
  base64: string
  mimeType: string
  storageKey: string
  name: string
  userId: string
}): Promise<EmeApplied | null> {
  if (!(await isEmeDocumentType(input.documentTypeId))) return null
  try {
    let data = input.fullText ? parseEmeText(input.fullText) : null
    let model: string | null = data ? 'parser' : null
    if (!data || data.employees.length === 0) {
      if (/pdf|image\//.test(input.mimeType)) {
        data = await extractEmeWithAi({ base64: input.base64, mimeType: input.mimeType }, { userId: input.userId })
        model = 'gemini'
      }
    }
    if (!data) return null
    return await applyEmeToTrdr({ trdrId: input.trdrId, data, storageKey: input.storageKey, name: input.name, userId: input.userId, model })
  } catch (err) {
    console.error('[eme] processing failed', err)
    return null
  }
}

// ── Ε3 (Κατάσταση Οικονομικών Στοιχείων) ─────────────────────────────────────

async function processE3IfApplicable(input: {
  docId: string
  trdrId: string
  documentTypeId: string
  base64: string
  mimeType: string
  storageKey: string
  name: string
  userId: string
}): Promise<{ applied: E3Applied; coveredExtra: { covered: number; programs: string[] } } | null> {
  const type = await prisma.documentType.findUnique({ where: { id: input.documentTypeId }, select: { name: true } })
  if (!isE3TypeName(type?.name) || !/pdf|image\//.test(input.mimeType)) return null
  try {
    const data = await extractE3WithAi({ base64: input.base64, mimeType: input.mimeType }, { userId: input.userId })
    if (!data) return null
    const applied = await applyE3ToTrdr({ trdrId: input.trdrId, data, storageKey: input.storageKey, name: input.name, userId: input.userId, model: 'gemini' })
    // Προγράμματα που ζητούν «Ε3 <έτος>» με δικό τους τύπο → καλύπτονται από αυτό το Ε3.
    const sameYearTypes = (await prisma.documentType.findMany({ where: { name: { contains: String(applied.year) }, id: { not: input.documentTypeId } }, select: { id: true, name: true } }))
      .filter(t => isE3TypeName(t.name))
    const coveredExtra = { covered: 0, programs: [] as string[] }
    for (const t of sameYearTypes) {
      const r = await coverObligationsFromDossierDoc(input.docId, { asTypeId: t.id }).catch(() => ({ covered: 0, programs: [] as string[] }))
      coveredExtra.covered += r.covered
      coveredExtra.programs.push(...r.programs)
    }
    return { applied, coveredExtra }
  } catch (err) {
    console.error('[e3] processing failed', err)
    return null
  }
}

// ── Δήλωση ΜΜΕ (Παράρτημα Ι ΕΚ 651/2014) ─────────────────────────────────────

async function processMmeIfApplicable(input: {
  docId: string
  trdrId: string
  documentTypeId: string
  fullText: string | null
  base64: string
  mimeType: string
  storageKey: string
  name: string
  userId: string
}): Promise<{ applied: MmeApplied; coveredExtra: { covered: number; programs: string[] } } | null> {
  const type = await prisma.documentType.findUnique({ where: { id: input.documentTypeId }, select: { name: true } })
  if (!isMmeTypeName(type?.name) || !/pdf|image\//.test(input.mimeType)) return null
  try {
    const data = await extractMmeWithAi({ base64: input.base64, mimeType: input.mimeType }, { userId: input.userId })
    if (!data) return null
    data.govgrCode = govgrCodeFromText(input.fullText) ?? data.govgrCode
    const applied = await applyMmeToTrdr({ trdrId: input.trdrId, data, storageKey: input.storageKey, name: input.name, userId: input.userId, model: 'gemini' })
    // Ισοδύναμοι τύποι (Υπόδειγμα Β / Υπεύθυνη Δήλωση ΜΜΕ / Δήλωση ΜΜΕ) — κάλυψη σε όλα τα προγράμματα.
    const coveredExtra = { covered: 0, programs: [] as string[] }
    if (!applied.afmMismatch) {
      const equivalents = (await prisma.documentType.findMany({ where: { id: { not: input.documentTypeId }, name: { contains: 'ΜΜΕ' } }, select: { id: true, name: true } }))
        .filter(t => isMmeTypeName(t.name))
      for (const t of equivalents) {
        const r = await coverObligationsFromDossierDoc(input.docId, { asTypeId: t.id }).catch(() => ({ covered: 0, programs: [] as string[] }))
        coveredExtra.covered += r.covered
        coveredExtra.programs.push(...r.programs)
      }
    }
    return { applied, coveredExtra }
  } catch (err) {
    console.error('[mme] processing failed', err)
    return null
  }
}
