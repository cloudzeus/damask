'use server'

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'

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
  },
): Promise<{ id: string }> {
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
  revalidatePath(`/partners/${trdrId}`)
  return { id }
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
