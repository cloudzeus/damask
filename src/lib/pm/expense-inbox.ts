'use server'

import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload, bunnyUploadPrivate } from '@/lib/bunny-storage'
import { logActivity } from '@/lib/activity/log'
import { extractDocument } from '@/lib/ocr/extract'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import { scanQuoteForApplication, createExpensesFromQuote, type QuoteScan, type QuoteLine } from '@/lib/programs/expense-proposal'
import { saveInvoiceOcr } from '@/lib/programs/expense-purchase'
import { extractApprovalDoc, prepareApprovalReview, type ApprovalReview, type ApprovalExtract } from '@/lib/pm/approval'

/**
 * «Προς καταχώριση» (ApplicationInboxDoc): προσφορές και παραστατικά που ήρθαν από τη μαζική εισαγωγή
 * αρχείων του πελάτη και αντιστοιχίστηκαν σε έργο. Διαβάζονται ήδη στο ανέβασμα (προσφορά → προμηθευτής
 * + γραμμές + πρόταση κατηγορίας· παραστατικό → OCR + πρόταση δαπάνης) και ο χρήστης τα καταχωρίζει με
 * ένα κλικ. Τίποτα δεν αλλάζει τον προϋπολογισμό χωρίς τον έλεγχό του.
 */

export type InboxKind = 'QUOTE' | 'INVOICE' | 'APPROVAL'
export type InboxExpenseOption = { id: string; description: string; amount: number; supplierName: string | null; supplierAfm: string | null; hasInvoice: boolean }
export type InboxItem = {
  id: string
  kind: InboxKind
  fileName: string
  relPath: string | null
  size: number
  createdAt: string
  readError: string | null
  quote: QuoteScan | null
  invoice: ExtractedDocument | null
  /** Παραστατικό: η πιο πιθανή δαπάνη (προμηθευτής/ποσό/αρ. παραστατικού). */
  suggestedExpenseId: string | null
  suggestReason: string | null
  /** Παραστατικό που εξέδωσε ο ίδιος ο πελάτης (πώληση) — μάλλον δεν αφορά δαπάνη. */
  ownInvoice: boolean
  approval: ApprovalExtract | null
}

const MAX_BYTES = 11 * 1024 * 1024

function canRead(mime: string) {
  return mime === 'application/pdf' || mime.startsWith('image/')
}

async function readFile(applicationId: string, kind: InboxKind, file: { base64: string; mimeType: string }, userId: string): Promise<{ extracted: Prisma.InputJsonValue | null; readError: string | null }> {
  if (!canRead(file.mimeType)) return { extracted: null, readError: 'Μόνο PDF ή εικόνες διαβάζονται αυτόματα.' }
  try {
    if (kind === 'APPROVAL') {
      const x = await extractApprovalDoc(applicationId, file)
      return { extracted: x as unknown as Prisma.InputJsonValue, readError: null }
    }
    if (kind === 'QUOTE') {
      const r = await scanQuoteForApplication(applicationId, file)
      return r.ok ? { extracted: r.scan as unknown as Prisma.InputJsonValue, readError: null } : { extracted: null, readError: r.message }
    }
    // Το Gemini δέχεται και PDF ως inlineData (όπως στη σάρωση προσφοράς).
    const r = await extractDocument({
      images: [{ base64: file.base64, mimeType: file.mimeType as 'image/png' }],
      docType: 'invoice', refId: applicationId, userId,
    })
    return { extracted: r.data as unknown as Prisma.InputJsonValue, readError: null }
  } catch (err) {
    return { extracted: null, readError: err instanceof Error ? err.message : 'Η ανάγνωση απέτυχε.' }
  }
}

/** Ανέβασμα + ανάγνωση προσφοράς/παραστατικού και τοποθέτηση στο «Προς καταχώριση» του έργου. */
export async function stageInboxDoc(input: {
  applicationId: string
  kind: InboxKind
  name: string
  base64: string
  mimeType: string
  ext: string
  relPath?: string | null
}): Promise<{ ok: true; id: string; read: boolean; programTitle: string } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUnique({ where: { id: input.applicationId }, select: { trdrId: true, program: { select: { title: true } } } })
  if (!app) return { ok: false, message: 'Το έργο δεν βρέθηκε.' }
  const body = Buffer.from(input.base64, 'base64')
  if (!body.length) return { ok: false, message: 'Κενό αρχείο.' }
  if (body.length > MAX_BYTES) return { ok: false, message: 'Πολύ μεγάλο αρχείο για προσφορά/παραστατικό (έως 11MB).' }
  const ext = (input.ext || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `application-inbox/${input.applicationId}/${crypto.randomUUID()}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: input.mimeType || 'application/octet-stream' })
  const { extracted, readError } = await readFile(input.applicationId, input.kind, { base64: input.base64, mimeType: input.mimeType }, session.user.id)
  const row = await prisma.applicationInboxDoc.create({
    data: {
      applicationId: input.applicationId, trdrId: app.trdrId, kind: input.kind,
      fileName: input.name.slice(0, 250), storageKey: key, mimeType: input.mimeType || 'application/octet-stream', size: body.length,
      relPath: input.relPath?.slice(0, 500) || null, extracted: extracted ?? undefined, readError, createdById: session.user.id,
    },
  })
  await logActivity('expense_inbox.stage', { entityType: 'application', entityId: input.applicationId, userId: session.user.id, meta: { kind: input.kind, file: input.name } })
  return { ok: true, id: row.id, read: !!extracted, programTitle: app.program.title }
}

const norm = (s: string | null | undefined) => (s ?? '').replace(/\D/g, '')

/** Πρόταση δαπάνης για παραστατικό: ίδιος προμηθευτής (ΑΦΜ) + κοντινό ποσό + ίδιος αρ. παραστατικού. */
function suggestExpense(inv: ExtractedDocument, expenses: (InboxExpenseOption & { docNumber: string | null })[]): { id: string; reason: string } | null {
  const afm = norm(inv.issuer.afm)
  const amounts = [inv.totals.net, inv.totals.gross].filter((x): x is number => typeof x === 'number' && x > 0)
  let best: { id: string; score: number; why: string[] } | null = null
  for (const e of expenses) {
    if (e.hasInvoice) continue
    let score = 0
    const why: string[] = []
    if (afm && norm(e.supplierAfm) === afm) { score += 0.6; why.push('ίδιος προμηθευτής') }
    const diff = amounts.length ? Math.min(...amounts.map(a => Math.abs(a - e.amount) / Math.max(1, e.amount))) : 1
    if (diff < 0.02) { score += 0.4; why.push('ίδιο ποσό') } else if (diff < 0.1) { score += 0.2; why.push('κοντινό ποσό') }
    if (inv.documentNumber && e.docNumber && inv.documentNumber.trim() === e.docNumber.trim()) { score += 0.3; why.push('ίδιος αρ. παραστατικού') }
    if (score >= 0.5 && (!best || score > best.score)) best = { id: e.id, score, why }
  }
  return best ? { id: best.id, reason: best.why.join(' · ') } : null
}

async function expenseOptions(applicationId: string) {
  const rows = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, description: true, amount: true, docNumber: true, vendor: true, vendorAfm: true, supplier: { select: { NAME: true, AFM: true } }, purchase: { select: { invoiceKey: true } } },
  })
  return rows.map(r => ({
    id: r.id, description: r.description, amount: Number(r.amount), docNumber: r.docNumber,
    supplierName: r.supplier?.NAME ?? r.vendor ?? null, supplierAfm: r.supplier?.AFM ?? r.vendorAfm ?? null,
    hasInvoice: !!r.purchase?.invoiceKey,
  }))
}

export async function listInboxDocs(applicationId: string): Promise<{ items: InboxItem[]; expenses: InboxExpenseOption[] }> {
  await requirePermission('programs.manage')
  const [rows, expenses, app] = await Promise.all([
    prisma.applicationInboxDoc.findMany({ where: { applicationId, status: 'PENDING' }, orderBy: { createdAt: 'asc' } }),
    expenseOptions(applicationId),
    prisma.programApplication.findUnique({ where: { id: applicationId }, select: { trdr: { select: { AFM: true } } } }),
  ])
  const ownAfm = norm(app?.trdr.AFM)
  const items = rows.map(r => {
    const kind = r.kind as InboxKind
    const invoice = kind === 'INVOICE' && r.extracted ? (r.extracted as unknown as ExtractedDocument) : null
    const sug = invoice ? suggestExpense(invoice, expenses) : null
    return {
      id: r.id, kind, fileName: r.fileName, relPath: r.relPath, size: r.size, createdAt: r.createdAt.toISOString(), readError: r.readError,
      quote: kind === 'QUOTE' && r.extracted ? (r.extracted as unknown as QuoteScan) : null,
      invoice,
      suggestedExpenseId: sug?.id ?? null, suggestReason: sug?.reason ?? null,
      ownInvoice: !!invoice && !!ownAfm && norm(invoice.issuer.afm) === ownAfm,
      approval: kind === 'APPROVAL' && r.extracted ? (r.extracted as unknown as ApprovalExtract) : null,
    }
  })
  return { items, expenses: expenses.map(({ docNumber: _d, ...e }) => { void _d; return e }) }
}

async function getPending(id: string) {
  const row = await prisma.applicationInboxDoc.findUnique({ where: { id } })
  if (!row || row.status !== 'PENDING') throw new Error('Το αρχείο έχει ήδη καταχωριστεί.')
  return row
}

async function finish(id: string, status: 'DONE' | 'DISMISSED', note: string, userId: string, applicationId: string) {
  await prisma.applicationInboxDoc.update({ where: { id }, data: { status, resultNote: note.slice(0, 300), processedAt: new Date() } })
  await logActivity(status === 'DONE' ? 'expense_inbox.done' : 'expense_inbox.dismiss', { entityType: 'application', entityId: applicationId, userId, meta: { inboxId: id, note } })
  revalidatePath('/programs')
}

/** Προσφορά → δαπάνες (με τις γραμμές/κατηγορίες που ενέκρινε ο χρήστης· το ίδιο αρχείο επισυνάπτεται). */
export async function createExpensesFromInbox(id: string, input: {
  supplierAfm: string | null
  supplierTrdrId: string | null
  docNumber: string | null
  date: string | null
  groupBy: 'line' | 'category'
  lines: QuoteLine[]
}): Promise<{ ok: true; created: number; supplierName: string | null; supplierCreated: boolean } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const row = await getPending(id)
  const res = await createExpensesFromQuote(row.applicationId, {
    ...input, quote: null,
    storedQuote: { key: row.storageKey, name: row.fileName.replace(/\.[^.]+$/, ''), mimeType: row.mimeType },
  })
  if (!res.ok) return res
  await finish(id, 'DONE', `Δημιουργήθηκαν ${res.created} δαπάνες`, session.user.id, row.applicationId)
  return { ok: true, created: res.created, supplierName: res.supplier?.name ?? null, supplierCreated: res.supplierCreated }
}

async function attachInvoice(row: { storageKey: string; fileName: string; extracted: Prisma.JsonValue }, expenseId: string) {
  await prisma.expensePurchase.upsert({
    where: { expenseId },
    create: { expenseId, invoiceKey: row.storageKey, invoiceName: row.fileName.replace(/\.[^.]+$/, '') },
    update: { invoiceKey: row.storageKey, invoiceName: row.fileName.replace(/\.[^.]+$/, '') },
  })
  const inv = row.extracted as unknown as ExtractedDocument | null
  if (inv) {
    await saveInvoiceOcr(expenseId, {
      amount: inv.totals.gross ?? inv.totals.net ?? null,
      supplier: inv.issuer.name, docNumber: inv.documentNumber, date: inv.date,
      lines: inv.lines.map(l => ({ description: l.description, code: l.code ?? null, serial: l.serial ?? null, quantity: l.quantity })),
    })
  }
}

/** Παραστατικό → σύνδεση με υπάρχουσα δαπάνη (γίνεται το «Παραστατικό» της αγοράς + OCR στοιχεία). */
export async function linkInboxInvoice(id: string, expenseId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const row = await getPending(id)
  const exp = await prisma.programExpense.findFirst({ where: { id: expenseId, applicationId: row.applicationId }, select: { description: true } })
  if (!exp) return { ok: false, message: 'Η δαπάνη δεν ανήκει σε αυτό το έργο.' }
  await attachInvoice(row, expenseId)
  await finish(id, 'DONE', `Συνδέθηκε με «${exp.description.slice(0, 80)}»`, session.user.id, row.applicationId)
  return { ok: true }
}

/** Παραστατικό χωρίς προηγούμενη δαπάνη → νέα δαπάνη από το παραστατικό (προμηθευτής από ΑΦΜ) + σύνδεση. */
export async function createExpenseFromInboxInvoice(id: string): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const row = await getPending(id)
  const inv = row.extracted as unknown as ExtractedDocument | null
  if (!inv) return { ok: false, message: 'Το παραστατικό δεν διαβάστηκε — δοκίμασε «Νέα ανάγνωση».' }
  try {
    const { processProgramInvoice } = await import('@/lib/invoice-flows/program')
    const r = await processProgramInvoice({ applicationId: row.applicationId, extracted: inv, enrichAade: true })
    await attachInvoice(row, r.expenseId)
    await finish(id, 'DONE', 'Νέα δαπάνη από το παραστατικό', session.user.id, row.applicationId)
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η δημιουργία δαπάνης απέτυχε.' }
  }
}

/** Νέα ανάγνωση (π.χ. μετά από αποτυχία ή αλλαγή τύπου προσφορά ↔ παραστατικό). */
export async function rereadInboxDoc(id: string, kind?: InboxKind): Promise<{ ok: true } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const row = await getPending(id)
  const k = kind ?? (row.kind as InboxKind)
  const buf = await bunnyDownload(row.storageKey)
  const { extracted, readError } = await readFile(row.applicationId, k, { base64: buf.toString('base64'), mimeType: row.mimeType }, session.user.id)
  await prisma.applicationInboxDoc.update({ where: { id }, data: { kind: k, extracted: extracted ?? undefined, readError } })
  return readError ? { ok: false, message: readError } : { ok: true }
}

/** Μεταφορά σε άλλο έργο του ίδιου πελάτη (με νέα ανάγνωση για τις κατηγορίες του προγράμματος). */
export async function moveInboxDoc(id: string, applicationId: string): Promise<{ ok: true } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const row = await getPending(id)
  const target = await prisma.programApplication.findFirst({ where: { id: applicationId, trdrId: row.trdrId }, select: { id: true } })
  if (!target) return { ok: false, message: 'Το έργο δεν ανήκει στον ίδιο πελάτη.' }
  await prisma.applicationInboxDoc.update({ where: { id }, data: { applicationId } })
  if (row.kind === 'QUOTE') return rereadInboxDoc(id)
  return { ok: true }
}

export async function dismissInboxDoc(id: string): Promise<void> {
  const session = await requirePermission('programs.manage')
  const row = await getPending(id)
  await finish(id, 'DISMISSED', 'Απορρίφθηκε', session.user.id, row.applicationId)
}

/** Εγκριτικό από το «Προς καταχώριση» → πρόταση για έλεγχο (κατηγορίες κ.λπ.). */
export async function reviewInboxApproval(id: string): Promise<{ ok: true; review: ApprovalReview } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const row = await getPending(id)
  if (row.kind !== 'APPROVAL' || !row.extracted) return { ok: false, message: 'Το εγκριτικό δεν διαβάστηκε — δοκιμάστε «Νέα ανάγνωση».' }
  return { ok: true, review: await prepareApprovalReview(row.applicationId, { storageKey: row.storageKey, fileName: row.fileName, extract: row.extracted as unknown as ApprovalExtract }) }
}

/** Έργα του πελάτη (για την επιλογή προορισμού στη μαζική εισαγωγή). */
export async function listTrdrApplicationsForInbox(trdrId: string): Promise<{ id: string; programId: string; title: string }[]> {
  await requirePermission('customer.view')
  const apps = await prisma.programApplication.findMany({
    where: { trdrId },
    orderBy: { createdAt: 'desc' },
    select: { id: true, programId: true, program: { select: { title: true } } },
  })
  return apps.map(a => ({ id: a.id, programId: a.programId, title: a.program.title }))
}
