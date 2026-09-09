'use server'

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'

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
}

export async function listTrdrDossier(trdrId: string): Promise<DossierDocItem[]> {
  await requirePermission('customer.view')
  const rows = await prisma.trdrDossierDocument.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    include: { documentType: { select: { name: true, expires: true } } },
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
  }))
}

export async function uploadTrdrDossierDoc(
  trdrId: string,
  input: { documentTypeId: string; name: string; base64: string; mimeType: string; ext: string; issuedAt?: string | null; expiresAt?: string | null },
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
      issuedAt: input.issuedAt ? new Date(input.issuedAt) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      uploadedById: session.user.id,
    },
  })
  revalidatePath(`/partners/${trdrId}`)
  return { id }
}

export async function updateTrdrDossierDoc(
  id: string,
  input: { documentTypeId?: string; name?: string; issuedAt?: string | null; expiresAt?: string | null },
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

// ── #1: AI classify δικαιολογητικού (τύπος + ημ. λήξης) ───────────────────────

export type DossierClassify = { typeName: string | null; expiresAt: string | null }

/** Διαβάζει την OCR σύνοψη ενός ανεβασμένου δικαιολογητικού και προτείνει (α)
 * τον τύπο από τον κατάλογο και (β) την ημ. λήξης (για τύπους που λήγουν, π.χ.
 * φορολογική/ασφαλιστική ενημερότητα). Ενδεικτικό — ο χρήστης επιβεβαιώνει. */
export async function classifyDossierDocument(
  input: { summary: string; types: { name: string; expires: boolean }[] },
): Promise<{ ok: true; result: DossierClassify } | { ok: false; message: string }> {
  await requirePermission('customer.edit')
  const names = input.types.map(t => `${t.name}${t.expires ? ' (λήγει)' : ''}`).join(', ')
  const messages = [
    { role: 'system' as const, content: `Είσαι βοηθός αναγνώρισης ελληνικών επιχειρηματικών δικαιολογητικών. Με βάση τη σύνοψη ενός εγγράφου, εντόπισε (α) τον τύπο του από τον κατάλογο και (β) την ημερομηνία λήξης/ισχύος (μόνο αν ο τύπος λήγει — π.χ. φορολογική/ασφαλιστική ενημερότητα· ψάξε «ισχύει έως», «λήγει», «έως»). Διαθέσιμοι τύποι: ${names}. Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"type":"ακριβές όνομα τύπου από τον κατάλογο ή null","expiresAt":"YYYY-MM-DD ή null"}.` },
    { role: 'user' as const, content: input.summary.slice(0, 4000) },
  ]
  try {
    const text = await deepseekChat(messages, { model: 'deepseek-chat', maxTokens: 300, scope: 'OTHER', refType: 'dossier-classify' })
    const p = parseJsonLoose(text) as { type?: unknown; expiresAt?: unknown } | null
    // Αφαίρεση τυχόν annotation «(λήγει)» που echo-άρει το μοντέλο από τη λίστα.
    const rawType = (typeof p?.type === 'string' ? p.type : '').replace(/\s*\([^)]*\)\s*$/, '').trim()
    const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω]+/gi, ' ').trim()
    const hit = rawType ? input.types.find(t => norm(t.name) === norm(rawType)) : null
    const rawExp = typeof p?.expiresAt === 'string' ? p.expiresAt.trim() : ''
    const expiresAt = /^\d{4}-\d{2}-\d{2}$/.test(rawExp) ? rawExp : null
    return { ok: true, result: { typeName: hit?.name ?? null, expiresAt } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η αναγνώριση απέτυχε.' }
  }
}
