'use server'

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { coverObligationsFromDossierDoc } from '@/lib/pm/form-obligations'
import { isEmeDocumentType, parseEmeText, extractEmeWithAi, applyEmeToTrdr } from '@/lib/tax/eme'
import { isE3TypeName, extractE3WithAi, applyE3ToTrdr, type E3Applied } from '@/lib/tax/e3'
import { isMmeTypeName, extractMmeWithAi, applyMmeToTrdr, govgrCodeFromText, type MmeApplied } from '@/lib/tax/mme'

/**
 * Τύποι δικαιολογητικών (ελαφρύς κατάλογος) + αποθήκη δικαιολογητικών ανά πελάτη.
 * Ο κοινός τύπος (DocumentType) «δένει» πρόγραμμα ↔ αποθήκη πελάτη ↔ αποδελτίωση
 * PDF. Η αποθήκη κρατά ό,τι έχει ήδη η εταιρία (με ημ. λήξης) ώστε στην ένταξη
 * σε πρόγραμμα να μη ζητείται ξανά ό,τι υπάρχει valid.
 */

// ── Τύποι δικαιολογητικών ────────────────────────────────────────────────────

export type DocumentTypeOption = { id: string; name: string; expires: boolean }

export async function listDocumentTypes(): Promise<DocumentTypeOption[]> {
  await requirePermission('customer.view')
  const rows = await prisma.documentType.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, expires: true },
  })
  return rows
}

/** Δημιουργία τύπου (inline modal). Idempotent στο όνομα — αν υπάρχει, επιστρέφει τον υπάρχοντα. */
export async function createDocumentType(name: string, expires: boolean): Promise<DocumentTypeOption> {
  await requirePermission('customer.edit')
  const clean = name.trim()
  if (!clean) throw new Error('Το όνομα του τύπου είναι υποχρεωτικό.')
  const existing = await prisma.documentType.findUnique({ where: { name: clean }, select: { id: true, name: true, expires: true } })
  if (existing) return existing
  const row = await prisma.documentType.create({ data: { name: clean, expires }, select: { id: true, name: true, expires: true } })
  return row
}

// ── Αποθήκη πελάτη ───────────────────────────────────────────────────────────

export type DossierDocItem = {
  id: string
  documentTypeId: string
  documentTypeName: string
  typeExpires: boolean
  name: string
  mimeType: string | null
  sizeBytes: number | null
  issuedAt: string | null
  expiresAt: string | null
  /** παράγωγο: έχει λήξει (expiresAt < σήμερα). */
  expired: boolean
  createdAt: string
  programId: string | null
  programTitle: string | null
  reusable: boolean
}

export async function listTrdrDossier(trdrId: string): Promise<DossierDocItem[]> {
  await requirePermission('customer.view')
  const rows = await prisma.trdrDossierDocument.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    include: { documentType: { select: { name: true, expires: true } }, program: { select: { title: true } } },
  })
  const now = Date.now()
  return rows.map(r => ({
    id: r.id,
    documentTypeId: r.documentTypeId,
    documentTypeName: r.documentType.name,
    typeExpires: r.documentType.expires,
    name: r.name,
    mimeType: r.mimeType,
    sizeBytes: r.sizeBytes,
    issuedAt: r.issuedAt ? r.issuedAt.toISOString() : null,
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    expired: r.expiresAt ? r.expiresAt.getTime() < now : false,
    createdAt: r.createdAt.toISOString(),
    programId: r.programId,
    programTitle: r.program?.title ?? null,
    reusable: r.reusable,
  }))
}

export async function uploadTrdrDossierDoc(
  trdrId: string,
  input: {
    documentTypeId: string; name: string; base64: string; mimeType: string; ext: string
    issuedAt?: string | null; expiresAt?: string | null
    programId?: string | null; reusable?: boolean
    /** Από την έξυπνη αναγνώριση: τι είχε προταθεί + απόσπασμα κειμένου → γίνεται
     * παράδειγμα εκμάθησης (επιβεβαίωση ή διόρθωση). */
    learn?: { predictedTypeId: string | null; snippet: string; fileName: string } | null
    /** Αντικατάσταση: το παλιό δικαιολογητικό (ίδιου πελάτη) αφαιρείται μετά την αποθήκευση. */
    replaceDocId?: string | null
    /** Πλήρες ψηφιακό κείμενο (αν υπάρχει) — για ειδικούς τύπους όπως το ΕΜΕ. */
    fullText?: string | null
  },
): Promise<{ id: string; covered: number; coveredPrograms: string[]; eme?: EmeApplied | null; e3?: E3Applied | null; mme?: MmeApplied | null }> {
  const session = await requirePermission('customer.edit')
  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true } })
  if (!trdr) throw new Error('Ο συναλλασσόμενος δεν βρέθηκε.')

  const id = crypto.randomUUID()
  const ext = (input.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `dossier/${trdrId}/${id}.${ext}`
  const body = Buffer.from(input.base64, 'base64')
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
      uploadedById: session.user.id,
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
        createdById: session.user.id,
      },
    }).catch(() => { /* η εκμάθηση δεν μπλοκάρει ποτέ την αποθήκευση */ })
  }
  // Καλύπτει αυτόματα τις ανοιχτές εκκρεμότητες ίδιου τύπου στα προγράμματα του πελάτη.
  const cover = await coverObligationsFromDossierDoc(id).catch(() => ({ covered: 0, programs: [] as string[] }))
  // ΕΜΕ: αυτόματη ανάγνωση εργαζομένων/μέσου όρου → Οδηγός Εντύπων + εργαζόμενοι εταιρίας.
  const eme = await processEmeIfApplicable({ trdrId, documentTypeId: input.documentTypeId, fullText: input.fullText ?? null, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: session.user.id })
  // Ε3: αυτόματη ανάγνωση κύκλου εργασιών/αποτελεσμάτων ανά έτος + κάλυψη εκκρεμοτήτων «Ε3 <έτος>».
  const e3 = await processE3IfApplicable({ docId: id, trdrId, documentTypeId: input.documentTypeId, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: session.user.id })
  if (e3?.coveredExtra) { cover.covered += e3.coveredExtra.covered; cover.programs.push(...e3.coveredExtra.programs) }
  // Δήλωση ΜΜΕ (επίσημη για ΟΠΣΚΕ): ΕΜΕ/κύκλος εργασιών/κατηγορία + κάλυψη ισοδύναμων τύπων.
  const mme = await processMmeIfApplicable({ docId: id, trdrId, documentTypeId: input.documentTypeId, fullText: input.fullText ?? null, base64: input.base64, mimeType: input.mimeType, storageKey: key, name: input.name, userId: session.user.id })
  if (mme?.coveredExtra) { cover.covered += mme.coveredExtra.covered; cover.programs.push(...mme.coveredExtra.programs) }
  revalidatePath(`/partners/${trdrId}`)
  return { id, covered: cover.covered, coveredPrograms: [...new Set(cover.programs)], eme, e3: e3?.applied ?? null, mme: mme?.applied ?? null }
}

export async function updateTrdrDossierDoc(
  id: string,
  input: { documentTypeId?: string; name?: string; issuedAt?: string | null; expiresAt?: string | null; programId?: string | null; reusable?: boolean },
): Promise<void> {
  await requirePermission('customer.edit')
  const row = await prisma.trdrDossierDocument.findUniqueOrThrow({ where: { id }, select: { trdrId: true } })
  await prisma.trdrDossierDocument.update({
    where: { id },
    data: {
      ...(input.documentTypeId !== undefined ? { documentTypeId: input.documentTypeId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() || 'Δικαιολογητικό' } : {}),
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt ? new Date(input.issuedAt) : null } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
      ...(input.programId !== undefined ? { programId: input.programId || null } : {}),
      ...(input.reusable !== undefined ? { reusable: input.reusable } : {}),
    },
  })
  revalidatePath(`/partners/${row.trdrId}`)
}

export async function removeTrdrDossierDoc(id: string): Promise<void> {
  await requirePermission('customer.edit')
  const row = await prisma.trdrDossierDocument.findUniqueOrThrow({ where: { id }, select: { trdrId: true } })
  await prisma.trdrDossierDocument.delete({ where: { id } })
  revalidatePath(`/partners/${row.trdrId}`)
}

/** Προγράμματα του πελάτη (για επιλογή «σε ποιο πρόγραμμα αναφέρεται»). */
export async function listTrdrProgramsForDossier(trdrId: string): Promise<{ id: string; title: string }[]> {
  await requirePermission('customer.view')
  const apps = await prisma.programApplication.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    select: { program: { select: { id: true, title: true } } },
  })
  return apps.map(a => a.program)
}

// ── C3: εντοπισμός διπλοεγγραφών ─────────────────────────────────────────────

export type DossierDuplicateHit = {
  id: string
  name: string
  typeName: string
  createdAt: string
  expiresAt: string | null
  /** σε ισχύ (χωρίς λήξη ή λήξη στο μέλλον) */
  valid: boolean
}
export type DossierDuplicateCheck = {
  key: string
  /** Ακριβώς το ίδιο αρχείο (ίδιο SHA-256) — ανεξάρτητα από όνομα/τύπο. */
  exact: DossierDuplicateHit[]
  /** Ίδιος τύπος δικαιολογητικού που υπάρχει ήδη (π.χ. ενημερότητα σε ισχύ). */
  sameType: DossierDuplicateHit[]
}

/** Για κάθε αρχείο της παρτίδας: υπάρχει ήδη ίδιο αρχείο ή ίδιος τύπος στον πελάτη; */
export async function checkDossierDuplicates(
  trdrId: string,
  items: { key: string; hash: string; typeId: string | null }[],
): Promise<DossierDuplicateCheck[]> {
  await requirePermission('customer.view')
  const hashes = [...new Set(items.map(i => i.hash).filter(Boolean))]
  const typeIds = [...new Set(items.map(i => i.typeId).filter((t): t is string => !!t))]
  if (hashes.length === 0 && typeIds.length === 0) return items.map(i => ({ key: i.key, exact: [], sameType: [] }))
  const rows = await prisma.trdrDossierDocument.findMany({
    where: {
      trdrId,
      OR: [
        ...(hashes.length ? [{ contentHash: { in: hashes } }] : []),
        ...(typeIds.length ? [{ documentTypeId: { in: typeIds } }] : []),
      ],
    },
    orderBy: { createdAt: 'desc' },
    select: { id: true, name: true, contentHash: true, documentTypeId: true, createdAt: true, expiresAt: true, documentType: { select: { name: true } } },
  })
  const now = Date.now()
  const hit = (r: (typeof rows)[number]): DossierDuplicateHit => ({
    id: r.id,
    name: r.name,
    typeName: r.documentType.name,
    createdAt: r.createdAt.toISOString(),
    expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null,
    valid: !r.expiresAt || r.expiresAt.getTime() > now,
  })
  return items.map(i => {
    const exact = rows.filter(r => i.hash && r.contentHash === i.hash)
    const exactIds = new Set(exact.map(r => r.id))
    const sameType = i.typeId ? rows.filter(r => r.documentTypeId === i.typeId && !exactIds.has(r.id)) : []
    return { key: i.key, exact: exact.map(hit), sameType: sameType.map(hit) }
  })
}

// ── Ποια ευρωπαϊκά προγράμματα χρειάζονται αυτόν τον τύπο ──────────────────────

export type ProgramNeed = {
  programId: string
  title: string
  /** ο πελάτης έχει ενταχθεί στο πρόγραμμα */
  joined: boolean
  /** κατάσταση της εκκρεμότητας του πελάτη (αν έχει ενταχθεί) */
  status: 'PENDING' | 'IN_PROGRESS' | 'SUBMITTED' | 'APPROVED' | 'REJECTED' | 'WAIVED' | null
  formName: string
}

/** Για κάθε τύπο: προγράμματα του πελάτη που τον απαιτούν (με κατάσταση) + ενεργά
 * προγράμματα που τον ζητούν (για ένταξη). Ταξινόμηση: πρώτα τα δικά του. */
export async function listProgramNeedsForTypes(trdrId: string, typeIds: string[]): Promise<Record<string, ProgramNeed[]>> {
  await requirePermission('customer.view')
  const ids = [...new Set(typeIds.filter(Boolean))]
  if (ids.length === 0) return {}
  const apps = await prisma.programApplication.findMany({ where: { trdrId }, select: { id: true, programId: true } })
  const appByProgram = new Map(apps.map(a => [a.programId, a.id]))
  const forms = await prisma.programRequiredForm.findMany({
    where: {
      documentTypeId: { in: ids },
      mandatory: true,
      OR: [{ program: { status: 'ACTIVE' } }, { programId: { in: apps.map(a => a.programId) } }],
    },
    select: { id: true, name: true, documentTypeId: true, programId: true, program: { select: { title: true } } },
  })
  const obligations = await prisma.applicationObligation.findMany({
    where: { kind: 'FORM', sourceId: { in: forms.map(f => f.id) }, applicationId: { in: apps.map(a => a.id) } },
    select: { sourceId: true, status: true },
  })
  const statusByForm = new Map(obligations.map(o => [o.sourceId!, o.status]))
  const out: Record<string, ProgramNeed[]> = {}
  for (const f of forms) {
    const list = (out[f.documentTypeId!] ??= [])
    if (list.some(x => x.programId === f.programId)) continue
    const joined = appByProgram.has(f.programId)
    list.push({ programId: f.programId, title: f.program.title, joined, status: joined ? (statusByForm.get(f.id) ?? null) : null, formName: f.name })
  }
  for (const k of Object.keys(out)) out[k].sort((a, b) => Number(b.joined) - Number(a.joined) || a.title.localeCompare(b.title, 'el'))
  return out
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
