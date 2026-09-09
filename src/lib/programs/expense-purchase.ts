'use server'

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * Β2 — Στοιχεία πραγματικής αγοράς ανά δαπάνη (φάση υλοποίησης): παραστατικό +
 * extrait τράπεζας + serial + βεβαίωση προμηθευτή, με AI διασταύρωση απέναντι
 * στην εγκεκριμένη δαπάνη. Ξεχωριστό από το physical-object certification.
 */

export type PurchaseDocKind = 'invoice' | 'bankExtrait' | 'supplierCert'
const DOC_FIELDS: Record<PurchaseDocKind, { keyField: 'invoiceKey' | 'bankExtraitKey' | 'supplierCertKey'; nameField: 'invoiceName' | 'bankExtraitName' | 'supplierCertName'; label: string }> = {
  invoice: { keyField: 'invoiceKey', nameField: 'invoiceName', label: 'Παραστατικό' },
  bankExtrait: { keyField: 'bankExtraitKey', nameField: 'bankExtraitName', label: 'Extrait τράπεζας' },
  supplierCert: { keyField: 'supplierCertKey', nameField: 'supplierCertName', label: 'Βεβαίωση προμηθευτή' },
}

export type PurchaseVerdict = 'OK' | 'MISMATCH' | 'UNCERTAIN'
export type PurchaseItem = {
  expenseId: string
  description: string
  amount: number
  categoryName: string | null
  supplierName: string | null
  supplierAfm: string | null
  serial: string | null
  invoiceNumber: string | null
  invoiceDate: string | null
  paidAmount: number | null
  docs: Record<PurchaseDocKind, { has: boolean; name: string | null }>
  missingDocs: string[]
  reconVerdict: PurchaseVerdict | null
  reconNote: string | null
  ocr: { amount: number | null; supplier: string | null; number: string | null } | null
  inRequest: { ordinal: number; status: string } | null
}

function docsOf(p: { invoiceKey: string | null; invoiceName: string | null; bankExtraitKey: string | null; bankExtraitName: string | null; supplierCertKey: string | null; supplierCertName: string | null } | null): PurchaseItem['docs'] {
  return {
    invoice: { has: !!p?.invoiceKey, name: p?.invoiceName ?? null },
    bankExtrait: { has: !!p?.bankExtraitKey, name: p?.bankExtraitName ?? null },
    supplierCert: { has: !!p?.supplierCertKey, name: p?.supplierCertName ?? null },
  }
}

/** Λίστα αγορών (ACTIVE δαπάνες + purchase) ενός έργου. */
export async function listExpensePurchases(applicationId: string): Promise<PurchaseItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: {
      id: true, description: true, amount: true,
      category: { select: { name: true } },
      supplier: { select: { NAME: true, AFM: true } }, vendor: true, vendorAfm: true,
      purchase: true,
      paymentRequest: { select: { ordinal: true, status: true } },
    },
  })
  return rows.map(r => {
    const p = r.purchase
    const docs = docsOf(p)
    const missingDocs = (Object.keys(DOC_FIELDS) as PurchaseDocKind[]).filter(k => !docs[k].has).map(k => DOC_FIELDS[k].label)
    return {
      expenseId: r.id, description: r.description, amount: Number(r.amount),
      categoryName: r.category?.name ?? null,
      supplierName: r.supplier?.NAME ?? r.vendor ?? null, supplierAfm: r.supplier?.AFM ?? r.vendorAfm ?? null,
      serial: p?.serial ?? null, invoiceNumber: p?.invoiceNumber ?? null,
      invoiceDate: p?.invoiceDate?.toISOString() ?? null,
      paidAmount: p?.paidAmount != null ? Number(p.paidAmount) : null,
      docs, missingDocs,
      reconVerdict: (p?.reconVerdict ?? null) as PurchaseVerdict | null,
      reconNote: p?.reconNote ?? null,
      ocr: p?.ocrCheckedAt ? { amount: p.ocrAmount != null ? Number(p.ocrAmount) : null, supplier: p.ocrSupplier ?? null, number: p.ocrNumber ?? null } : null,
      inRequest: r.paymentRequest ? { ordinal: r.paymentRequest.ordinal, status: r.paymentRequest.status } : null,
    }
  })
}

/** Αποθήκευση OCR ανάγνωσης παραστατικού (τι διάβασε το AI από το ίδιο το
 * αρχείο) + auto-prefill πληρωμένου ποσού / αρ. παραστατικού αν είναι κενά. */
export async function saveInvoiceOcr(
  expenseId: string,
  input: { amount?: number | null; supplier?: string | null; docNumber?: string | null; date?: string | null },
): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  const existing = await prisma.expensePurchase.findUnique({ where: { expenseId }, select: { paidAmount: true, invoiceNumber: true } })
  const d = input.date ? new Date(input.date) : null
  const ocrData = {
    ocrAmount: input.amount ?? null,
    ocrSupplier: input.supplier?.trim() || null,
    ocrNumber: input.docNumber?.trim() || null,
    ocrDate: d && !Number.isNaN(d.getTime()) ? d : null,
    ocrCheckedAt: new Date(),
  }
  // prefill μόνο όταν ο χρήστης δεν έχει ήδη βάλει τιμή
  const prefill: Record<string, unknown> = {}
  if (existing?.paidAmount == null && input.amount != null) prefill.paidAmount = input.amount
  if (!existing?.invoiceNumber && input.docNumber?.trim()) prefill.invoiceNumber = input.docNumber.trim()
  await prisma.expensePurchase.upsert({
    where: { expenseId },
    create: { expenseId, ...ocrData, ...prefill },
    update: { ...ocrData, ...prefill },
  })
  revalidatePath('/programs')
  return { ok: true }
}

async function ensurePurchase(expenseId: string): Promise<void> {
  await prisma.expensePurchase.upsert({ where: { expenseId }, create: { expenseId }, update: {} })
}

export async function savePurchaseMeta(
  expenseId: string,
  input: { serial?: string | null; invoiceNumber?: string | null; invoiceDate?: string | null; paidAmount?: number | null },
): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  const data: Record<string, unknown> = {}
  if (input.serial !== undefined) data.serial = input.serial?.trim() || null
  if (input.invoiceNumber !== undefined) data.invoiceNumber = input.invoiceNumber?.trim() || null
  if (input.invoiceDate !== undefined) { const d = input.invoiceDate ? new Date(input.invoiceDate) : null; data.invoiceDate = d && !Number.isNaN(d.getTime()) ? d : null }
  if (input.paidAmount !== undefined) data.paidAmount = input.paidAmount
  await prisma.expensePurchase.upsert({ where: { expenseId }, create: { expenseId, ...data }, update: data })
  revalidatePath('/programs')
  return { ok: true }
}

export async function uploadPurchaseDoc(
  expenseId: string,
  kind: PurchaseDocKind,
  input: { name: string; base64: string; mimeType: string; ext: string },
): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  const f = DOC_FIELDS[kind]
  if (!f) return { ok: false }
  const id = crypto.randomUUID()
  const ext = (input.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `expense-purchases/${expenseId}/${kind}-${id}.${ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.base64, 'base64'), contentType: input.mimeType })
  await prisma.expensePurchase.upsert({
    where: { expenseId },
    create: { expenseId, [f.keyField]: key, [f.nameField]: input.name.trim() || f.label },
    update: { [f.keyField]: key, [f.nameField]: input.name.trim() || f.label },
  })
  revalidatePath('/programs')
  return { ok: true }
}

export async function removePurchaseDoc(expenseId: string, kind: PurchaseDocKind): Promise<void> {
  await requirePermission('programs.manage')
  const f = DOC_FIELDS[kind]
  if (!f) return
  await ensurePurchase(expenseId)
  await prisma.expensePurchase.update({ where: { expenseId }, data: { [f.keyField]: null, [f.nameField]: null } })
  revalidatePath('/programs')
}

export type PurchaseReconResult = { verdict: PurchaseVerdict; note: string }

/** AI διασταύρωση αγοράς ↔ εγκεκριμένης δαπάνης: ελέγχει ποσό (paidAmount vs
 * εγκεκριμένο), προμηθευτή, πληρότητα των 3 εγγράφων. DeepSeek δίνει verdict +
 * τεκμηρίωση στα ελληνικά. (Deep OCR των αρχείων → Β3.) */
export async function reconcileExpensePurchase(expenseId: string): Promise<{ ok: true; result: PurchaseReconResult } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const r = await prisma.programExpense.findUnique({
    where: { id: expenseId },
    select: {
      description: true, amount: true, docNumber: true,
      supplier: { select: { NAME: true, AFM: true } }, vendor: true, vendorAfm: true,
      purchase: true,
    },
  })
  if (!r) return { ok: false, message: 'Η δαπάνη δεν βρέθηκε.' }
  const p = r.purchase
  const approvedAmount = Number(r.amount)
  const supplierName = r.supplier?.NAME ?? r.vendor ?? null
  const docs = docsOf(p)
  const missing = (Object.keys(DOC_FIELDS) as PurchaseDocKind[]).filter(k => !docs[k].has).map(k => DOC_FIELDS[k].label)

  const ocrLine = p?.ocrCheckedAt
    ? `AI ανάγνωση παραστατικού (από το ίδιο το αρχείο): ποσό ${p.ocrAmount != null ? `${Number(p.ocrAmount)}€` : '—'}, προμηθευτής ${p.ocrSupplier ?? '—'}, αρ. ${p.ocrNumber ?? '—'}`
    : 'AI ανάγνωση παραστατικού: δεν έχει γίνει.'
  const facts = [
    `Εγκεκριμένη δαπάνη: «${r.description}»`,
    `Εγκεκριμένο ποσό: ${approvedAmount}€`,
    supplierName ? `Προμηθευτής (εγκεκριμένος): ${supplierName}${r.supplier?.AFM ?? r.vendorAfm ? ` (ΑΦΜ ${r.supplier?.AFM ?? r.vendorAfm})` : ''}` : 'Προμηθευτής: —',
    p?.paidAmount != null ? `Πραγματικά πληρωμένο ποσό (καταχώριση): ${Number(p.paidAmount)}€` : 'Πραγματικά πληρωμένο ποσό: δεν καταχωρίστηκε',
    p?.invoiceNumber ? `Αρ. παραστατικού (καταχώριση): ${p.invoiceNumber}` : 'Αρ. παραστατικού: —',
    p?.serial ? `Serial: ${p.serial}` : 'Serial: —',
    ocrLine,
    `Έγγραφα που έχουν ανέβει: ${(Object.keys(DOC_FIELDS) as PurchaseDocKind[]).filter(k => docs[k].has).map(k => DOC_FIELDS[k].label).join(', ') || 'κανένα'}`,
    `Έγγραφα που λείπουν: ${missing.join(', ') || 'κανένα'}`,
  ].join('\n')

  const messages = [
    { role: 'system' as const, content: 'Είσαι έμπειρος σύμβουλος αποπληρωμής ΕΣΠΑ. Έλεγξε αν μια πραγματική αγορά αντιστοιχεί στην εγκεκριμένη δαπάνη και αν είναι πλήρης για αίτημα αποπληρωμής. Δώσε ΕΜΦΑΣΗ στη σύγκριση της AI ανάγνωσης του παραστατικού (τι διαβάστηκε από το ίδιο το αρχείο) με την εγκεκριμένη δαπάνη: αν το ποσό/προμηθευτής του παραστατικού διαφέρει από το εγκεκριμένο, είναι σοβαρό εύρημα. Κανόνες: το ποσό του παραστατικού/πληρωμής δεν πρέπει να ξεπερνά το εγκεκριμένο (μικρή απόκλιση προς τα κάτω επιτρέπεται)· ο προμηθευτής πρέπει να ταιριάζει· χρειάζονται και τα 3 έγγραφα (Παραστατικό, Extrait τράπεζας, Βεβαίωση προμηθευτή). Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"verdict":"OK"|"MISMATCH"|"UNCERTAIN","note":"2-4 προτάσεις στα ελληνικά με τα ευρήματα, αναφέροντας τυχόν διαφορά ποσού/προμηθευτή"}. OK μόνο αν ταιριάζει ποσό+προμηθευτής ΚΑΙ υπάρχουν και τα 3 έγγραφα. MISMATCH αν το ποσό ξεπερνά το εγκεκριμένο, ο προμηθευτής διαφέρει, ή λείπουν έγγραφα. UNCERTAIN αν τα στοιχεία δεν επαρκούν.' },
    { role: 'user' as const, content: facts },
  ]

  let verdict: PurchaseVerdict = 'UNCERTAIN'
  let note = ''
  try {
    const text = await deepseekChat(messages, { model: 'deepseek-chat', maxTokens: 400, scope: 'OTHER', refType: 'purchase-reconcile', refId: expenseId })
    const parsed = parseJsonLoose(text) as { verdict?: unknown; note?: unknown } | null
    const v = typeof parsed?.verdict === 'string' ? parsed.verdict.toUpperCase() : ''
    verdict = v === 'OK' || v === 'MISMATCH' ? v : 'UNCERTAIN'
    note = typeof parsed?.note === 'string' ? parsed.note.trim() : ''
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η διασταύρωση απέτυχε.' }
  }
  if (!note) note = 'Δεν προέκυψε σαφής τεκμηρίωση — έλεγξε χειροκίνητα.'

  const checkedAt = new Date()
  await prisma.expensePurchase.upsert({
    where: { expenseId },
    create: { expenseId, reconVerdict: verdict, reconNote: note, reconCheckedAt: checkedAt },
    update: { reconVerdict: verdict, reconNote: note, reconCheckedAt: checkedAt },
  })
  revalidatePath('/programs')
  return { ok: true, result: { verdict, note } }
}

// ── #2: AI-drafted email αιτήματος εγγράφων που λείπουν ───────────────────────

export type DocRequestDraft = { subject: string; body: string; trdrId: string }

/** Συντάσσει με AI ένα ευγενικό email προς τον πελάτη που ζητά τα έγγραφα
 * αγοράς που λείπουν (extrait/παραστατικό/βεβαίωση) για μια δαπάνη. Επιστρέφει
 * θέμα + σώμα (HTML) — ανοίγει στον composer για έλεγχο & αποστολή. */
export async function draftDocRequestEmail(expenseId: string): Promise<{ ok: true; result: DocRequestDraft } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const r = await prisma.programExpense.findUnique({
    where: { id: expenseId },
    select: {
      description: true,
      supplier: { select: { NAME: true } }, vendor: true,
      application: { select: { trdrId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } } },
      purchase: { select: { invoiceKey: true, bankExtraitKey: true, supplierCertKey: true } },
    },
  })
  if (!r) return { ok: false, message: 'Η δαπάνη δεν βρέθηκε.' }
  const p = r.purchase
  const missing = (Object.keys(DOC_FIELDS) as PurchaseDocKind[]).filter(k => {
    const key = k === 'invoice' ? p?.invoiceKey : k === 'bankExtrait' ? p?.bankExtraitKey : p?.supplierCertKey
    return !key
  }).map(k => DOC_FIELDS[k].label)
  if (missing.length === 0) return { ok: false, message: 'Δεν λείπει κανένα έγγραφο για αυτή τη δαπάνη.' }

  const facts = [
    `Πελάτης: ${r.application.trdr.NAME}`,
    `Πρόγραμμα: ${r.application.program.title}`,
    `Δαπάνη: ${r.description}`,
    r.supplier?.NAME || r.vendor ? `Προμηθευτής: ${r.supplier?.NAME ?? r.vendor}` : null,
    `Έγγραφα που λείπουν: ${missing.join(', ')}`,
  ].filter(Boolean).join('\n')

  const messages = [
    { role: 'system' as const, content: 'Είσαι σύμβουλος ΕΣΠΑ. Σύνταξε ένα σύντομο, ευγενικό, επαγγελματικό email (πληθυντικός ευγενείας) προς τον πελάτη που ζητά τα έγγραφα αγοράς που λείπουν, ώστε να προχωρήσει το αίτημα αποπληρωμής. Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"subject":"σύντομο θέμα","body":"σώμα email σε απλό κείμενο με παραγράφους (χρησιμοποίησε \\n για αλλαγή γραμμής)"}.' },
    { role: 'user' as const, content: facts },
  ]
  try {
    const text = await deepseekChat(messages, { model: 'deepseek-chat', maxTokens: 500, scope: 'OTHER', refType: 'doc-request-email', refId: expenseId })
    const parsed = parseJsonLoose(text) as { subject?: unknown; body?: unknown } | null
    const subject = typeof parsed?.subject === 'string' ? parsed.subject.trim() : `Δικαιολογητικά για τη δαπάνη «${r.description}»`
    const rawBody = typeof parsed?.body === 'string' ? parsed.body.trim() : `Χρειαζόμαστε τα εξής έγγραφα: ${missing.join(', ')}.`
    // Απλό κείμενο → HTML παράγραφοι για τον rich editor.
    const body = rawBody.split(/\n{2,}/).map(par => `<p>${par.split('\n').map(l => l.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]!))).join('<br>')}</p>`).join('')
    return { ok: true, result: { subject, body, trdrId: r.application.trdrId } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η σύνταξη απέτυχε.' }
  }
}
