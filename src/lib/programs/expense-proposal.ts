'use server'

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { aadeLookup, AadeLookupError } from '@/lib/aade'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { ensureTrdrCdnFolder } from '@/lib/trdr/cdn-folder'

/**
 * Σχεδιασμός προϋπολογισμού υποβολής — προμηθευτές (με ΑΦΜ μέσω ΑΑΔΕ) + ενυπόγραφη
 * προσφορά (αρχείο) ανά δαπάνη + εκκρεμότητα όταν λείπει προσφορά. Χτίζει πάνω
 * στο υπάρχον ProgramExpense (δεν το αντικαθιστά).
 */

const SUPPLIER_SODTYPE = 12

export type SupplierOption = { id: string; name: string; afm: string | null }

/** Προμηθευτές του συγκεκριμένου πελάτη (όσοι έχουν χρησιμοποιηθεί στις δαπάνες
 * των έργων του) — «κάθε πελάτης τους δικούς του προμηθευτές». */
export async function listCustomerSuppliers(trdrId: string): Promise<SupplierOption[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programExpense.findMany({
    where: { supplierTrdrId: { not: null }, application: { trdrId } },
    distinct: ['supplierTrdrId'],
    select: { supplier: { select: { id: true, NAME: true, AFM: true } } },
  })
  return rows.filter(r => r.supplier).map(r => ({ id: r.supplier!.id, name: r.supplier!.NAME, afm: r.supplier!.AFM })).sort((a, b) => a.name.localeCompare(b.name, 'el'))
}

/** Αναζήτηση προμηθευτών (SODTYPE 12) με επωνυμία/ΑΦΜ — για τον picker. */
export async function searchSuppliers(query: string): Promise<SupplierOption[]> {
  await requirePermission('programs.manage')
  const q = query.trim()
  if (q.length < 2) return []
  const rows = await prisma.trdr.findMany({
    where: { SODTYPE: SUPPLIER_SODTYPE, OR: [{ NAME: { contains: q, mode: 'insensitive' } }, { AFM: { contains: q.replace(/\D/g, '') } }] },
    orderBy: { NAME: 'asc' }, take: 15, select: { id: true, NAME: true, AFM: true },
  })
  return rows.map(r => ({ id: r.id, name: r.NAME, afm: r.AFM }))
}

/** Εύρεση/δημιουργία προμηθευτή μόνο με ΑΦΜ (ΑΑΔΕ → όλα τα στοιχεία). */
export async function findOrCreateSupplierByAfm(afm: string): Promise<{ ok: boolean; supplier?: SupplierOption; created?: boolean; message?: string }> {
  await requirePermission('programs.manage')
  const clean = afm.replace(/\D/g, '').slice(0, 9)
  if (clean.length !== 9) return { ok: false, message: 'Μη έγκυρο ΑΦΜ (9 ψηφία).' }

  const existing = await prisma.trdr.findFirst({ where: { AFM: clean, SODTYPE: SUPPLIER_SODTYPE }, select: { id: true, NAME: true, AFM: true } })
  if (existing) return { ok: true, created: false, supplier: { id: existing.id, name: existing.NAME, afm: existing.AFM } }

  let name = `ΑΦΜ ${clean}`
  let address: string | undefined, zip: string | undefined, city: string | undefined, legalForm: string | undefined
  try {
    const c = await aadeLookup(clean)
    if (c) { name = c.name || name; address = c.address ?? undefined; zip = c.zip ?? undefined; city = c.city ?? undefined; legalForm = c.legalForm ?? undefined }
  } catch (err) {
    if (err instanceof AadeLookupError) return { ok: false, message: err.message }
  }
  const created = await prisma.trdr.create({
    data: { NAME: name, AFM: clean, SODTYPE: SUPPLIER_SODTYPE, ISPROSP: 0, ADDRESS: address, ZIP: zip, CITY: city, appLegalForm: legalForm },
    select: { id: true, NAME: true, AFM: true },
  })
  await ensureTrdrCdnFolder(created.id).catch(() => {})
  return { ok: true, created: true, supplier: { id: created.id, name: created.NAME, afm: created.AFM } }
}

/** Εξασφαλίζει/αφαιρεί εκκρεμότητα «Λείπει προσφορά» ανάλογα με το αν η δαπάνη
 * έχει ανεβασμένη ενυπόγραφη προσφορά. kind CUSTOM, sourceId = expenseId. */
async function syncQuoteObligation(expenseId: string): Promise<void> {
  const exp = await prisma.programExpense.findUnique({ where: { id: expenseId }, select: { applicationId: true, description: true, quoteStorageKey: true } })
  if (!exp) return
  const existing = await prisma.applicationObligation.findFirst({ where: { applicationId: exp.applicationId, kind: 'CUSTOM', sourceId: expenseId }, select: { id: true, status: true } })
  if (exp.quoteStorageKey) {
    if (existing && (existing.status === 'PENDING' || existing.status === 'IN_PROGRESS')) {
      await prisma.applicationObligation.delete({ where: { id: existing.id } })
    }
  } else if (!existing) {
    await prisma.applicationObligation.create({
      data: { applicationId: exp.applicationId, stage: 'EXPENSES_DELIVERABLES', kind: 'CUSTOM', sourceId: expenseId, name: `Λείπει προσφορά: ${exp.description}`, mandatory: false, status: 'PENDING', order: 0 },
    })
  }
}

/** Δημόσια wrapper — καλείται μετά τη δημιουργία δαπάνης (χωρίς προσφορά → εκκρεμότητα). */
export async function ensureExpenseQuoteObligation(expenseId: string): Promise<void> {
  await requirePermission('programs.manage')
  await syncQuoteObligation(expenseId)
}

export async function uploadExpenseQuote(
  expenseId: string,
  input: { name: string; base64: string; mimeType: string; ext: string },
): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  const exp = await prisma.programExpense.findUnique({ where: { id: expenseId }, select: { applicationId: true } })
  if (!exp) return { ok: false }
  const id = crypto.randomUUID()
  const ext = (input.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `expense-quotes/${expenseId}/${id}.${ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.base64, 'base64'), contentType: input.mimeType })
  await prisma.programExpense.update({ where: { id: expenseId }, data: { quoteStorageKey: key, quoteName: input.name.trim() || 'Προσφορά', quoteMimeType: input.mimeType } })
  await syncQuoteObligation(expenseId)
  revalidatePath(`/programs`)
  return { ok: true }
}

export async function removeExpenseQuote(expenseId: string): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.programExpense.update({ where: { id: expenseId }, data: { quoteStorageKey: null, quoteName: null, quoteMimeType: null } })
  await syncQuoteObligation(expenseId) // ξαναδημιουργεί την εκκρεμότητα
}

/** Ανάθεση προμηθευτή σε δαπάνη (γράφει και vendor/vendorAfm για ιστορικό). */
export async function setExpenseSupplier(expenseId: string, supplierTrdrId: string | null): Promise<void> {
  await requirePermission('programs.manage')
  let vendor: string | null = null, vendorAfm: string | null = null
  if (supplierTrdrId) {
    const s = await prisma.trdr.findUnique({ where: { id: supplierTrdrId }, select: { NAME: true, AFM: true } })
    vendor = s?.NAME ?? null; vendorAfm = s?.AFM ?? null
  }
  await prisma.programExpense.update({ where: { id: expenseId }, data: { supplierTrdrId, vendor, vendorAfm } })
}
