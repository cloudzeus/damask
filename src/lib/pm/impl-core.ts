import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { parseJsonLoose } from '@/lib/ocr/extract'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import { rematchInvoice } from '@/lib/pm/invoice-rematch'

/**
 * (Plain module — actions & αυτόματη καταχώριση.) Καταχώριση εγγράφων υλοποίησης σε ΗΔΗ αποθηκευμένο αρχείο (key):
 * παραστατικό → εγκεκριμένη δαπάνη, πληρωμή/εξτρέ & βεβαίωση & συνοδευτικά → παραστατικό. Η πρόσβαση ελέγχεται από τον καλούντα.
 */

export type StoredFile = { key: string; name: string; mime: string; base64?: string | null }

const n = (v: unknown) => (v == null ? null : Number(v))
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const toDate = (s: string | null | undefined) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)
export const readable = (mime: string) => mime === 'application/pdf' || mime.startsWith('image/')
export const num = (v: unknown) => { const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : NaN; return Number.isFinite(x) ? x : null }
export const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)
type PayDoc = { key: string; name: string; mime?: string | null }
const docsOf = (v: unknown): PayDoc[] => (Array.isArray(v) ? (v as PayDoc[]) : [])

/** Περιεχόμενο αρχείου (base64) — από το ίδιο το αίτημα ή από το Bunny. */
export async function contentOf(f: StoredFile): Promise<string> {
  if (f.base64) return f.base64
  const { bunnyDownload } = await import('@/lib/bunny-storage')
  return (await bunnyDownload(f.key)).toString('base64')
}

export async function aiReadDoc<T>(f: StoredFile, system: string, userId: string | null, refId: string, refType = 'expense-invoice', maxOutputTokens?: number): Promise<T | null> {
  if (!readable(f.mime)) return null
  const { geminiGenerate } = await import('@/lib/gemini')
  const r = await geminiGenerate({
    parts: [{ inlineData: { data: await contentOf(f), mimeType: f.mime } }, { text: `Αρχείο: ${f.name}. Διάβασε το έγγραφο σύμφωνα με τις οδηγίες.` }],
    systemInstruction: system, json: true, scope: 'OCR_VISION', refType, refId, userId, maxOutputTokens,
  })
  return (parseJsonLoose(r.text) ?? null) as T | null
}

/** Νέο παραστατικό σε εγκεκριμένη δαπάνη. `extracted` (από τη μαζική εισαγωγή) → χωρίς νέα ανάγνωση. */
export async function createInvoiceCore(input: { expenseId: string; file: StoredFile; userId: string | null; extracted?: ExtractedDocument | null }): Promise<string> {
  const { expenseId, file } = input
  let data: Prisma.ExpenseInvoiceUncheckedCreateInput = { expenseId, invoiceKey: file.key, invoiceName: file.name.slice(0, 250), invoiceMime: file.mime, createdById: input.userId }
  try {
    let x = input.extracted ?? null
    if (!x && readable(file.mime)) {
      const { extractDocument } = await import('@/lib/ocr/extract')
      x = (await extractDocument({ images: [{ base64: await contentOf(file), mimeType: file.mime as 'image/png' }], docType: 'invoice', refId: expenseId, userId: input.userId })).data
    }
    if (x) {
      data = {
        ...data, number: x.documentNumber, date: toDate(x.date), supplier: x.issuer?.name ?? null, supplierAfm: x.issuer?.afm ?? null,
        netAmount: x.totals?.net ?? null, vatAmount: x.totals?.vat ?? null,
        totalAmount: x.totals?.gross ?? (x.totals?.net != null ? x.totals.net + (x.totals.vat ?? 0) : null),
        lines: (x.lines ?? []) as unknown as Prisma.InputJsonValue,
      }
    } else data.readError = 'Μόνο PDF ή εικόνες διαβάζονται αυτόματα — συμπληρώστε τα στοιχεία.'
  } catch (err) { data.readError = err instanceof Error ? err.message.slice(0, 300) : 'Η ανάγνωση απέτυχε.' }
  const row = await prisma.expenseInvoice.create({ data })
  await rematchInvoice(row.id)
  return row.id
}

function invoiceCtx(inv: { number: string | null; date: Date | null; supplier: string | null; supplierAfm: string | null; totalAmount: unknown }) {
  return `Παραστατικό: αρ. ${inv.number ?? '—'}, ημ. ${day(inv.date) ?? '—'}, προμηθευτής ${inv.supplier ?? '—'} (ΑΦΜ ${inv.supplierAfm ?? '—'}), σύνολο ${n(inv.totalAmount) ?? '—'} €.`
}

/** Ποσό από όνομα αρχείου («Πληρωμή (2) - 10.000.pdf», «… - 10.502,76.pdf») — εφεδρεία όταν δεν διαβάστηκε. */
export function amountFromName(name: string): number | null {
  const m = name.replace(/\.[a-z0-9]{2,4}$/i, '').match(/(?:^|[\s-])(\d{1,3}(?:\.\d{3})+(?:,\d{1,2})?|\d+,\d{1,2}|\d{3,})\s*(?:€|ευρω)?\s*\)?$/i)
  if (!m) return null
  const v = Number(m[1].replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(v) && v > 0 ? v : null
}
const isStatement = (name: string) => /extrait|εξτρ[εέ]|κινησεις λογαριασμ|statement/i.test(name.normalize('NFD').replace(/[\u0300-\u036f]/g, ''))

/**
 * Πληρωμή παραστατικού.
 *  · Αποδεικτικό (μία κίνηση): ποσό/ημερομηνία/δικαιούχος· ίδιο ποσό & ημέρα με υπάρχουσα → ενώνεται.
 *  · ΕΞΤΡΕ (πολλές κινήσεις): ΟΛΕΣ οι χρεώσεις προς τον προμηθευτή → κάθε μία ενώνεται με την υπάρχουσα πληρωμή ίδιου
 *    ποσού (±5 ημέρες)· νέα πληρωμή μόνο αν ο δικαιούχος είναι ο προμηθευτής. Κινήσεις προς τρίτους ΔΕΝ μετρούν ποτέ.
 */
export async function attachPaymentCore(input: { invoiceId: string; file: StoredFile; userId: string | null }): Promise<void> {
  const inv = await prisma.expenseInvoice.findUniqueOrThrow({ where: { id: input.invoiceId }, include: { payments: true } })
  const doc: PayDoc = { key: input.file.key, name: input.file.name.slice(0, 250), mime: input.file.mime }
  const addDoc = async (paymentId: string, docs: unknown, payee?: string | null) =>
    prisma.expenseInvoicePayment.update({ where: { id: paymentId }, data: { docs: [...docsOf(docs), doc] as unknown as Prisma.InputJsonValue, ...(payee ? { payee } : {}) } })
  const { matchInvoice } = await import('@/lib/pm/invoice-match')
  const supplierOk = (payee: string | null) => !payee || !inv.supplier || matchInvoice({ invoice: { total: null, date: null, supplier: inv.supplier, supplierAfm: null, number: null }, payments: [{ amount: null, date: null, payee }], cert: null }).verdict !== 'MISMATCH'

  if (isStatement(input.file.name)) {
    let tx: { payments?: { amount?: unknown; date?: unknown; payee?: unknown }[] } | null = null
    try {
      tx = await aiReadDoc(input.file, [
        'Διαβάζεις ελληνικό ΕΞΤΡΕ / κινήσεις τραπεζικού λογαριασμού της επιχείρησης-αγοραστή.',
        `Βρες ΟΛΕΣ τις ΧΡΕΩΣΕΙΣ (εξερχόμενες πληρωμές) προς τον προμηθευτή του παραστατικού: ${invoiceCtx(inv)}`,
        'ΜΗΝ επιστρέψεις πιστώσεις/εισερχόμενα ή πληρωμές σε άλλους δικαιούχους.',
        'Απάντησε ΑΥΣΤΗΡΑ JSON: {"payments":[{"amount": ποσό (αριθμός), "date":"YYYY-MM-DD", "payee":"δικαιούχος όπως γράφεται"}]} — κενή λίστα αν δεν υπάρχει.',
      ].join('\n'), input.userId, input.invoiceId)
    } catch { /* χωρίς ανάγνωση: μένει ως έγγραφο */ }
    const found = (tx?.payments ?? []).map(p => ({ amount: num(p.amount), date: toDate(str(p.date)), payee: str(p.payee) })).filter(p => p.amount != null && supplierOk(p.payee))
    // Πληρωμές ΑΛΛΩΝ παραστατικών του ίδιου έργου (ίδιο εξτρέ μπορεί να έχει πληρωμές για πολλά παραστατικά του προμηθευτή).
    const others = await prisma.expenseInvoicePayment.findMany({ where: { invoice: { expenseId: inv.expenseId, id: { not: inv.id } } }, select: { amount: true, paidAt: true } })
    const near = (a: { amount: unknown; paidAt: Date | null }, p: { amount: number | null; date: Date | null }) =>
      n(a.amount) != null && Math.abs(n(a.amount)! - p.amount!) <= 0.01 && (!a.paidAt || !p.date || Math.abs(a.paidAt.getTime() - p.date.getTime()) <= 5 * 864e5)
    let linked = false
    // Νέες πληρωμές από εξτρέ ΜΟΝΟ όταν το παραστατικό δεν έχει καμία (αλλιώς τα αποδεικτικά είναι η πηγή) και ως το υπόλοιπο.
    let room = inv.payments.length ? 0 : (n(inv.totalAmount) ?? Infinity)
    for (const p of found.sort((a, b) => (a.date?.getTime() ?? 0) - (b.date?.getTime() ?? 0))) {
      const same = inv.payments.find(e => near(e, p))
      if (same) { await addDoc(same.id, same.docs, same.payee ? null : p.payee); linked = true; continue }
      if (others.some(o => near(o, p)) || p.amount! > room + 0.01) continue
      room -= p.amount!
      await prisma.expenseInvoicePayment.create({ data: { invoiceId: input.invoiceId, amount: p.amount, paidAt: p.date, payee: p.payee, docs: [doc] as unknown as Prisma.InputJsonValue, createdById: input.userId } })
      linked = true
    }
    // Καμία σχετική κίνηση: το εξτρέ μένει ως συνοδευτικό (τεκμηρίωση), χωρίς να αλλάζει τα ποσά.
    if (!linked) await prisma.expenseInvoiceAttachment.create({ data: { invoiceId: input.invoiceId, kind: 'OTHER', key: doc.key, name: doc.name, mime: doc.mime } })
    await rematchInvoice(input.invoiceId)
    return
  }

  const already = inv.payments.map(p => `${n(p.amount)}€ στις ${day(p.paidAt) ?? '—'}`).join(', ')
  let paid: { amount?: unknown; date?: unknown; payee?: unknown } | null = null
  let readError: string | null = null
  try {
    paid = await aiReadDoc(input.file, [
      'Διαβάζεις ελληνικό τραπεζικό ΑΠΟΔΕΙΚΤΙΚΟ ΠΛΗΡΩΜΗΣ (μεταφορά/έμβασμα) προς προμηθευτή.',
      `Αφορά (πιθανότατα) το παραστατικό: ${invoiceCtx(inv)}`,
      already ? `Έχουν ήδη καταχωριστεί οι πληρωμές: ${already}.` : '',
      'Απάντησε ΑΥΣΤΗΡΑ JSON: {"amount": ποσό χρέωσης σε ευρώ (αριθμός), "date": "YYYY-MM-DD", "payee": "δικαιούχος/αποδέκτης της πληρωμής"} — null όπου δεν φαίνεται.',
    ].filter(Boolean).join('\n'), input.userId, input.invoiceId)
    if (!paid) readError = 'Μόνο PDF ή εικόνες διαβάζονται αυτόματα — συμπληρώστε το ποσό.'
  } catch (err) { readError = err instanceof Error ? err.message.slice(0, 300) : 'Η ανάγνωση απέτυχε.' }
  const amount = num(paid?.amount) ?? amountFromName(input.file.name)
  const paidAt = toDate(str(paid?.date))
  if (amount != null && readError) readError = null
  const same = amount != null ? inv.payments.find(p => n(p.amount) === amount && (!paidAt || !p.paidAt || day(p.paidAt) === day(paidAt))) : undefined
  if (same) await addDoc(same.id, same.docs, same.payee ? null : str(paid?.payee))
  else await prisma.expenseInvoicePayment.create({ data: { invoiceId: input.invoiceId, amount, paidAt, payee: str(paid?.payee), docs: [doc] as unknown as Prisma.InputJsonValue, readError, createdById: input.userId } })
  await rematchInvoice(input.invoiceId)
}

/** Βεβαίωση προμηθευτή (ανάγνωση: ποια παραστατικά/ποσό αναφέρει). */
export async function attachCertCore(input: { invoiceId: string; file: StoredFile; userId: string | null }): Promise<void> {
  const inv = await prisma.expenseInvoice.findUniqueOrThrow({ where: { id: input.invoiceId } })
  let cert: { invoiceNumbers?: unknown; amount?: unknown } | null = null
  try {
    cert = await aiReadDoc(input.file, [
      'Διαβάζεις ελληνική ΒΕΒΑΙΩΣΗ ΠΡΟΜΗΘΕΥΤΗ (εξόφλησης/παράδοσης) για επενδυτικό σχέδιο ΕΣΠΑ.',
      `Αφορά (πιθανότατα) το παραστατικό: ${invoiceCtx(inv)}`,
      'Απάντησε ΑΥΣΤΗΡΑ JSON: {"invoiceNumbers": ["αριθμοί παραστατικών που αναφέρει"], "amount": συνολικό ποσό που βεβαιώνει (αριθμός ή null)}.',
    ].join('\n'), input.userId, input.invoiceId)
  } catch { /* μετρά ως «υπάρχει» και χωρίς ανάγνωση */ }
  const nums = Array.isArray(cert?.invoiceNumbers) ? cert.invoiceNumbers.map(String).filter(Boolean) : []
  await prisma.expenseInvoice.update({ where: { id: input.invoiceId }, data: { supplierCertKey: input.file.key, supplierCertName: input.file.name.slice(0, 250), supplierCertMime: input.file.mime } })
  await rematchInvoice(input.invoiceId, { invoiceNumbers: nums, amount: num(cert?.amount) })
}

/** Συνοδευτικό (λογιστική εγγραφή / φωτογραφία / λοιπό). */
export async function addAttachmentCore(input: { invoiceId: string; kind: 'ACCOUNTING' | 'PHOTO' | 'OTHER'; file: StoredFile }): Promise<void> {
  await prisma.expenseInvoiceAttachment.create({ data: { invoiceId: input.invoiceId, kind: input.kind, key: input.file.key, name: input.file.name.slice(0, 250), mime: input.file.mime } })
}
