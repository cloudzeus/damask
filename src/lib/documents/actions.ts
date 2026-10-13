'use server'

import { createDossierDocCore, periodFor, type DossierUploadInput, type DossierUploadResult } from './dossier-core'
export type { EmeApplied } from './dossier-core'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { coverObligationsFromDossierDoc } from '@/lib/pm/form-obligations'

/**
 * Τύποι δικαιολογητικών (ελαφρύς κατάλογος) + αποθήκη δικαιολογητικών ανά πελάτη.
 * Ο κοινός τύπος (DocumentType) «δένει» πρόγραμμα ↔ αποθήκη πελάτη ↔ αποδελτίωση
 * PDF. Η αποθήκη κρατά ό,τι έχει ήδη η εταιρία (με ημ. λήξης) ώστε στην ένταξη
 * σε πρόγραμμα να μη ζητείται ξανά ό,τι υπάρχει valid.
 */

// ── Τύποι δικαιολογητικών ────────────────────────────────────────────────────

export type DocumentTypeOption = { id: string; name: string; expires: boolean; validityDays?: number | null; seriesKind?: string | null }

export async function listDocumentTypes(): Promise<DocumentTypeOption[]> {
  await requirePermission('customer.view')
  const rows = await prisma.documentType.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, expires: true, validityDays: true, seriesKind: true },
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
  /** Σειρά: τύπος σειράς + περίοδος του εγγράφου (π.χ. «2025-03»). */
  seriesKind: string | null
  period: string | null
}

export async function listTrdrDossier(trdrId: string): Promise<DossierDocItem[]> {
  await requirePermission('customer.view')
  const rows = await prisma.trdrDossierDocument.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    include: { documentType: { select: { name: true, expires: true, seriesKind: true } }, program: { select: { title: true } } },
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
    seriesKind: r.documentType.seriesKind,
    period: r.period,
  }))
}

export async function uploadTrdrDossierDoc(trdrId: string, input: DossierUploadInput): Promise<DossierUploadResult> {
  const session = await requirePermission('customer.edit')
  const res = await createDossierDocCore(trdrId, session.user.id, input)
  revalidatePath(`/partners/${trdrId}`)
  return res
}

export async function updateTrdrDossierDoc(
  id: string,
  input: { documentTypeId?: string; name?: string; issuedAt?: string | null; expiresAt?: string | null; programId?: string | null; reusable?: boolean; period?: string | null },
): Promise<void> {
  await requirePermission('customer.edit')
  const row = await prisma.trdrDossierDocument.findUniqueOrThrow({ where: { id }, select: { trdrId: true, documentTypeId: true } })
  const periodPatch = input.period !== undefined || input.documentTypeId !== undefined
    ? { period: await periodFor(input.documentTypeId ?? row.documentTypeId, input.period) }
    : {}
  await prisma.trdrDossierDocument.update({
    where: { id },
    data: {
      ...(input.documentTypeId !== undefined ? { documentTypeId: input.documentTypeId } : {}),
      ...(input.name !== undefined ? { name: input.name.trim() || 'Δικαιολογητικό' } : {}),
      ...(input.issuedAt !== undefined ? { issuedAt: input.issuedAt ? new Date(input.issuedAt) : null } : {}),
      ...(input.expiresAt !== undefined ? { expiresAt: input.expiresAt ? new Date(input.expiresAt) : null } : {}),
      ...(input.programId !== undefined ? { programId: input.programId || null } : {}),
      ...(input.reusable !== undefined ? { reusable: input.reusable } : {}),
      ...periodPatch,
    },
  })
  // Αλλαγή περιόδου/τύπου σε σειρά → επανυπολογισμός κάλυψης των εκκρεμοτήτων.
  if (Object.keys(periodPatch).length) await coverObligationsFromDossierDoc(id).catch(() => null)
  revalidatePath(`/partners/${row.trdrId}`)
}

/** Περίοδος κανονικοποιημένη στη μορφή του τύπου (null αν ο τύπος δεν είναι σειρά ή δεν δόθηκε). */

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
  items: { key: string; hash: string; typeId: string | null; period?: string | null }[],
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
    select: { id: true, name: true, contentHash: true, documentTypeId: true, createdAt: true, expiresAt: true, period: true, documentType: { select: { name: true, seriesKind: true } } },
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
    // Σειρές: «ίδιος τύπος» σημαίνει ίδια ΠΕΡΙΟΔΟΣ (12 Φ2 διαφορετικών μηνών δεν είναι διπλότυπα)· LIST ποτέ.
    const sameType = i.typeId
      ? rows.filter(r => r.documentTypeId === i.typeId && !exactIds.has(r.id) && (!r.documentType.seriesKind || (r.documentType.seriesKind !== 'LIST' && !!i.period && r.period === i.period)))
      : []
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

