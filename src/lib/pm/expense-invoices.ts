'use server'

import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { logActivity } from '@/lib/activity/log'
import { requireApplicationAccess, requireExpenseAccess } from '@/lib/pm/access'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { certNeededFor, isPayrollExpense, type MatchVerdict } from '@/lib/pm/invoice-match'
import { summarizePayroll, perEmeCapFrom } from '@/lib/pm/payroll-calc'
import { quotePolicyLabel } from '@/lib/programs/quote-policy'
import { rematchInvoice as rematch, parseMatch } from '@/lib/pm/invoice-rematch'
import { createInvoiceCore, attachPaymentCore, attachCertCore, addAttachmentCore } from '@/lib/pm/impl-core'

/**
 * Υλοποίηση εγκεκριμένου έργου — «Δαπάνες ανά κατηγορία»: κάθε εγκεκριμένη δαπάνη έχει ΠΟΛΛΑ παραστατικά, το καθένα με
 * εξτρέ πληρωμής και βεβαίωση προμηθευτή. Ανέβασμα → αυτόματη ανάγνωση (αριθμός/ημερομηνία/ποσό/προμηθευτής, ποσό &
 * δικαιούχος πληρωμής, παραστατικά της βεβαίωσης) → διασταύρωση (invoice-match.ts).
 */

const MAX_BYTES = 15 * 1024 * 1024
type FileIn = { name: string; base64: string; mimeType: string }

const requireAccess = requireApplicationAccess
const accessByExpense = requireExpenseAccess
async function accessByInvoice(invoiceId: string) {
  const i = await prisma.expenseInvoice.findUnique({ where: { id: invoiceId }, select: { expenseId: true } })
  if (!i) notFound()
  return { ...(await accessByExpense(i.expenseId)), expenseId: i.expenseId }
}

const n = (v: unknown) => (v == null ? null : Number(v))
const day = (d: Date | null) => (d ? d.toISOString().slice(0, 10) : null)
const toDate = (s: string | null | undefined) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)

// ── Τύποι για το UI ──────────────────────────────────────────────────────────────────────────────

export type BoardInvoice = {
  id: string
  number: string | null
  date: string | null
  supplier: string | null
  supplierAfm: string | null
  totalAmount: number | null
  netAmount: number | null
  invoiceName: string
  /** Πληρωμές (δόσεις) — καθεμία με αποδεικτικό ή/και εξτρέ. */
  payments: BoardPayment[]
  /** Άθροισμα πληρωμών (με ΦΠΑ). */
  paidAmount: number
  /** Συνοδευτικά: λογιστικές εγγραφές, φωτογραφίες εξοπλισμού, λοιπά. */
  attachments: { id: string; kind: 'ACCOUNTING' | 'PHOTO' | 'OTHER'; name: string }[]
  hasCert: boolean
  certName: string | null
  /** Ψηφιακή βεβαίωση (σύνταξη/αποστολή/υπογραφή) του παραστατικού. */
  certStatus: 'NEW' | 'DRAFT' | 'SENT' | 'SIGNED'
  matchVerdict: MatchVerdict | null
  checks: { ok: boolean; text: string }[]
  readError: string | null
}
export type BoardPayment = { id: string; amount: number | null; paidAt: string | null; payee: string | null; docs: { name: string; idx: number }[]; readError: string | null }
export type BoardExpense = {
  id: string; description: string; approved: number; invoices: BoardInvoice[]; invoiced: number; paid: number; certNeeded: boolean
  /** Μισθολογικό κόστος: μισθοδοσία αντί για παραστατικά. */
  kind: 'invoices' | 'payroll'
  payroll: { hires: number; months: number; cost: number; eligible: number; paidCost: number; unpaidMonths: number; perEmeCap: number | null } | null
}
export type BoardCategory = { id: string | null; name: string; approved: number; invoiced: number; paid: number; expenses: BoardExpense[]; issues: number }
export type ImplementationBoard = {
  categories: BoardCategory[]
  totals: { approved: number; invoiced: number; paid: number; invoices: number; issues: number }
  quotePolicy: 'REQUIRED' | 'OPTIONAL' | 'CONDITIONAL' | null
  quotePolicyLabel: string
  quotePolicyNote: string | null
  programId: string
  /** Αρχεία στο «Προς καταχώριση» που περιμένουν (εκτός εγκριτικών). */
  inboxPending: number
}

const INV_INCLUDE = { certificate: { select: { status: true } }, payments: { orderBy: [{ paidAt: 'asc' as const }, { createdAt: 'asc' as const }] }, attachments: { select: { id: true, kind: true, name: true }, orderBy: { createdAt: 'asc' as const } } } satisfies Prisma.ExpenseInvoiceInclude
type PayDoc = { key: string; name: string; mime?: string | null }
const docsOf = (v: unknown): PayDoc[] => (Array.isArray(v) ? (v as PayDoc[]) : [])

function toBoardInvoice(r: Prisma.ExpenseInvoiceGetPayload<{ include: typeof INV_INCLUDE }>): BoardInvoice {
  const m = parseMatch(r.matchNote)
  const payments = r.payments.map(p => ({ id: p.id, amount: n(p.amount), paidAt: day(p.paidAt), payee: p.payee, docs: docsOf(p.docs).map((d, idx) => ({ name: d.name, idx })), readError: p.readError }))
  return {
    id: r.id, number: r.number, date: day(r.date), supplier: r.supplier, supplierAfm: r.supplierAfm,
    totalAmount: n(r.totalAmount), netAmount: n(r.netAmount), invoiceName: r.invoiceName,
    payments, paidAmount: payments.reduce((a, p) => a + (p.amount ?? 0), 0),
    attachments: r.attachments.map(a => ({ id: a.id, kind: a.kind as 'ACCOUNTING' | 'PHOTO' | 'OTHER', name: a.name })),
    hasCert: !!r.supplierCertKey, certName: r.supplierCertName, certStatus: (r.certificate?.status as BoardInvoice['certStatus'] | undefined) ?? 'NEW',
    matchVerdict: (r.matchVerdict as MatchVerdict | null) ?? null, checks: m.checks ?? [], readError: r.readError,
  }
}

export async function getImplementationBoard(applicationId: string): Promise<ImplementationBoard> {
  const { app } = await requireAccess(applicationId)
  const [program, cats, expenses] = await Promise.all([
    prisma.program.findUnique({ where: { id: app.programId }, select: { quotePolicy: true, quotePolicyNote: true, quotePolicyRule: true } }),
    prisma.programExpenseCategory.findMany({ where: { programId: app.programId }, orderBy: { order: 'asc' }, select: { id: true, name: true } }),
    prisma.programExpense.findMany({
      where: { applicationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: { id: true, description: true, amount: true, categoryId: true, category: { select: { name: true, notes: true } }, payrollEmployees: { include: { lines: true } }, payrollDocs: { where: { kind: 'PAYMENT' }, select: { period: true, amount: true } }, invoices: { orderBy: [{ date: 'asc' }, { createdAt: 'asc' }], include: INV_INCLUDE } },
    }),
  ])
  const byCat = new Map<string | null, BoardExpense[]>()
  for (const e of expenses) {
    const invoices = e.invoices.map(toBoardInvoice)
    const be: BoardExpense = {
      id: e.id, description: e.description, approved: Number(e.amount), invoices, certNeeded: certNeededFor(e.category?.name ?? null, e.description), kind: 'invoices', payroll: null,
      invoiced: invoices.reduce((a, i) => a + (i.netAmount ?? i.totalAmount ?? 0), 0),
      // Πληρωμένο σε καθαρή αξία (ίδια βάση με τα εγκεκριμένα, που είναι χωρίς ΦΠΑ): αναλογία πληρωμής × καθαρό.
      paid: invoices.reduce((a, i) => {
        const net = i.netAmount ?? i.totalAmount ?? 0
        const tot = i.totalAmount ?? i.netAmount ?? 0
        return a + (tot > 0 ? net * Math.min(1, i.paidAmount / tot) : 0)
      }, 0),
    }
    if (isPayrollExpense(e.category?.name ?? null, e.description)) {
      const perEmeCap = perEmeCapFrom(e.category?.notes)
      const s = summarizePayroll({
        employees: e.payrollEmployees.map(x => ({ id: x.id, name: x.name, projectHire: x.projectHire, fte: x.fte })),
        lines: e.payrollEmployees.flatMap(x => x.lines.map(l => ({ employeeId: x.id, period: l.period, kind: l.kind, gross: Number(l.gross), employerContrib: Number(l.employerContrib), net: n(l.net) }))),
        payments: e.payrollDocs.map(d => ({ period: d.period, amount: n(d.amount) })), perEmeCap, approved: be.approved,
      })
      be.kind = 'payroll'
      be.certNeeded = false
      be.invoiced = s.eligible
      be.paid = s.paidCost
      be.payroll = { hires: s.employees.length, months: s.periods.length, cost: s.cost, eligible: s.eligible, paidCost: s.paidCost, unpaidMonths: s.periods.filter(p => p.status !== 'PAID').length, perEmeCap }
    }
    const k = e.categoryId && cats.some(c => c.id === e.categoryId) ? e.categoryId : null
    byCat.set(k, [...(byCat.get(k) ?? []), be])
  }
  const mk = (id: string | null, name: string): BoardCategory | null => {
    const ex = byCat.get(id)
    if (!ex?.length) return null
    return {
      id, name, expenses: ex,
      approved: ex.reduce((a, e) => a + e.approved, 0), invoiced: ex.reduce((a, e) => a + e.invoiced, 0), paid: ex.reduce((a, e) => a + e.paid, 0),
      issues: ex.reduce((a, e) => a + (e.kind === 'payroll' ? (e.payroll?.unpaidMonths ?? 0) + (e.payroll && !e.payroll.hires ? 1 : 0) : e.invoices.filter(i => i.matchVerdict !== 'OK').length), 0),
    }
  }
  const categories = [...cats.map(c => mk(c.id, c.name)), mk(null, 'Χωρίς κατηγορία')].filter((c): c is BoardCategory => !!c)
  return {
    categories,
    totals: {
      approved: categories.reduce((a, c) => a + c.approved, 0), invoiced: categories.reduce((a, c) => a + c.invoiced, 0), paid: categories.reduce((a, c) => a + c.paid, 0),
      invoices: categories.reduce((a, c) => a + c.expenses.reduce((b, e) => b + e.invoices.length, 0), 0), issues: categories.reduce((a, c) => a + c.issues, 0),
    },
    quotePolicy: (program?.quotePolicy as ImplementationBoard['quotePolicy']) ?? null,
    quotePolicyLabel: quotePolicyLabel(program?.quotePolicy, program?.quotePolicyRule, new Map(cats.map((c, i) => [c.id, `${i + 1}`]))),
    quotePolicyNote: program?.quotePolicyNote ?? null,
    programId: app.programId,
    inboxPending: await prisma.applicationInboxDoc.count({ where: { applicationId, status: 'PENDING', kind: { not: 'APPROVAL' } } }),
  }
}

// ── Ανάγνωση (AI) ────────────────────────────────────────────────────────────────────────────────


const num = (v: unknown) => { const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : NaN; return Number.isFinite(x) ? x : null }
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)

// ── Ενέργειες ────────────────────────────────────────────────────────────────────────────────────

async function store(prefix: string, file: FileIn, trdrId: string, label: string, ref: string) {
  const body = Buffer.from(file.base64, 'base64')
  if (body.length > MAX_BYTES) throw new Error('Το αρχείο είναι πάνω από 15 MB.')
  const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `${prefix}/${crypto.randomUUID()}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: file.mimeType || 'application/octet-stream' })
  const { recordFileHash } = await import('@/lib/import/existing')
  await recordFileHash({ key, body, trdrId, kind: 'purchase', label, ref })
  return key
}

/** Νέο παραστατικό σε εγκεκριμένη δαπάνη — ανέβασμα + ανάγνωση. */
export async function addExpenseInvoice(expenseId: string, file: FileIn): Promise<{ ok: true; invoice: BoardInvoice } | { ok: false; message: string }> {
  const { session, app } = await accessByExpense(expenseId)
  try {
    const key = await store(`expense-invoices/${expenseId}`, file, app.trdrId, `Παραστατικό: ${file.name}`, expenseId)
    const id = await createInvoiceCore({ expenseId, file: { key, name: file.name, mime: file.mimeType, base64: file.base64 }, userId: session.user.id })
    await logActivity('expense.invoice', { entityType: 'expense', entityId: expenseId, userId: session.user.id, meta: { invoiceId: id } })
    return { ok: true, invoice: toBoardInvoice(await prisma.expenseInvoice.findUniqueOrThrow({ where: { id }, include: INV_INCLUDE })) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.' }
  }
}

/**
 * Πληρωμή (αποδεικτικό ή εξτρέ), βεβαίωση προμηθευτή ή συνοδευτικό (λογιστική εγγραφή/φωτογραφία) για ένα παραστατικό.
 * Πληρωμή με ίδιο ποσό & ημερομηνία με υπάρχουσα (αποδεικτικό + εξτρέ της ίδιας δόσης) ενώνεται — δεν μετρά διπλά.
 */
export async function attachInvoiceDoc(invoiceId: string, kind: 'payment' | 'cert' | 'accounting' | 'photo', file: FileIn): Promise<{ ok: true; invoice: BoardInvoice } | { ok: false; message: string }> {
  const { session, app, expenseId } = await accessByInvoice(invoiceId)
  try {
    const label = { payment: 'Πληρωμή', cert: 'Βεβαίωση', accounting: 'Λογιστική εγγραφή', photo: 'Φωτογραφία' }[kind]
    const key = await store(`expense-invoices/${expenseId}/${kind}`, file, app.trdrId, `${label}: ${file.name}`, expenseId)
    const f = { key, name: file.name, mime: file.mimeType, base64: file.base64 }
    if (kind === 'payment') await attachPaymentCore({ invoiceId, file: f, userId: session.user.id })
    else if (kind === 'cert') await attachCertCore({ invoiceId, file: f, userId: session.user.id })
    else await addAttachmentCore({ invoiceId, kind: kind === 'accounting' ? 'ACCOUNTING' : 'PHOTO', file: f })
    return { ok: true, invoice: toBoardInvoice(await prisma.expenseInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: INV_INCLUDE })) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.' }
  }
}

/** Διόρθωση στοιχείων (ό,τι δεν διάβασε σωστά το σύστημα) → νέα διασταύρωση. */
export async function updateExpenseInvoice(invoiceId: string, input: {
  number?: string | null; date?: string | null; supplier?: string | null; supplierAfm?: string | null; netAmount?: number | null; totalAmount?: number | null
}): Promise<{ ok: true; invoice: BoardInvoice }> {
  await accessByInvoice(invoiceId)
  const data: Prisma.ExpenseInvoiceUpdateInput = {}
  if (input.number !== undefined) data.number = input.number?.trim() || null
  if (input.date !== undefined) data.date = toDate(input.date)
  if (input.supplier !== undefined) data.supplier = input.supplier?.trim() || null
  if (input.supplierAfm !== undefined) data.supplierAfm = input.supplierAfm?.replace(/\D/g, '') || null
  if (input.netAmount !== undefined) data.netAmount = input.netAmount
  if (input.totalAmount !== undefined) data.totalAmount = input.totalAmount
  await prisma.expenseInvoice.update({ where: { id: invoiceId }, data: { ...data, readError: null } })
  await rematch(invoiceId)
  return { ok: true, invoice: toBoardInvoice(await prisma.expenseInvoice.findUniqueOrThrow({ where: { id: invoiceId }, include: INV_INCLUDE })) }
}

/** Αφαίρεση βεβαίωσης, μιας πληρωμής ή ολόκληρου του παραστατικού. */
export async function removeInvoiceDoc(invoiceId: string, what: 'cert' | 'invoice' | { paymentId: string }): Promise<{ ok: true }> {
  const { session, expenseId } = await accessByInvoice(invoiceId)
  if (what === 'invoice') {
    await prisma.expenseInvoice.delete({ where: { id: invoiceId } })
    await logActivity('expense.invoice.delete', { entityType: 'expense', entityId: expenseId, userId: session.user.id, meta: { invoiceId } })
    return { ok: true }
  }
  if (what === 'cert') {
    await prisma.expenseInvoice.update({ where: { id: invoiceId }, data: { supplierCertKey: null, supplierCertName: null, supplierCertMime: null } })
    await rematch(invoiceId, null)
    return { ok: true }
  }
  await prisma.expenseInvoicePayment.deleteMany({ where: { id: what.paymentId, invoiceId } })
  await rematch(invoiceId)
  return { ok: true }
}

/** Διόρθωση μιας πληρωμής (ποσό/ημερομηνία/δικαιούχος) → νέα διασταύρωση. */
export async function updateInvoicePayment(paymentId: string, input: { amount: number | null; paidAt: string | null; payee: string | null }): Promise<{ ok: true }> {
  const p = await prisma.expenseInvoicePayment.findUnique({ where: { id: paymentId }, select: { invoiceId: true } })
  if (!p) notFound()
  await accessByInvoice(p.invoiceId)
  await prisma.expenseInvoicePayment.update({ where: { id: paymentId }, data: { amount: input.amount, paidAt: toDate(input.paidAt), payee: input.payee?.trim() || null, readError: null } })
  await rematch(p.invoiceId)
  return { ok: true }
}

// ── Κανόνας προσφοράς προγράμματος ───────────────────────────────────────────────────────────────

/** Χειροκίνητη ρύθμιση: απαιτείται ή όχι προσφορά ανά δαπάνη σε αυτό το πρόγραμμα. */
export async function setQuotePolicy(applicationId: string, policy: 'REQUIRED' | 'OPTIONAL'): Promise<{ ok: true }> {
  const { app, session } = await requireAccess(applicationId)
  await prisma.program.update({ where: { id: app.programId }, data: { quotePolicy: policy, quotePolicyRule: Prisma.DbNull, quotePolicyNote: `Ορίστηκε χειροκίνητα (${new Date().toLocaleDateString('el-GR')}).` } })
  await logActivity('program.quotePolicy', { entityType: 'program', entityId: app.programId, userId: session.user.id, meta: { policy } })
  return { ok: true }
}

/** Ανίχνευση από τον οδηγό (αποδελτίωση προκήρυξης + γνωσιακή μνήμη): απαιτούνται προσφορές, πότε; */
export async function detectQuotePolicy(applicationId: string): Promise<{ ok: true; policy: 'REQUIRED' | 'OPTIONAL' | 'CONDITIONAL' | null; note: string } | { ok: false; message: string }> {
  const { app } = await requireAccess(applicationId)
  const program = await prisma.program.findUniqueOrThrow({ where: { id: app.programId }, select: { extractedData: true, expenseCats: { orderBy: { order: 'asc' }, select: { id: true, name: true } } } })
  // Από την αποδελτίωση: ό,τι αναφέρει προσφορές (απαιτούμενα έγγραφα/όροι) — εκεί βρίσκεται συνήθως ο κανόνας.
  const extracted = JSON.stringify(program.extractedData ?? {})
  const hits = [...extracted.matchAll(/\{[^{}]*προσφορ[^{}]*\}/gi)].map(m => m[0]).slice(0, 12).join('\n')
  const { getProgramKnowledge } = await import('@/lib/programs/references')
  const knowledge = await getProgramKnowledge(app.programId, 16_000)
  if (!hits && !knowledge.trim()) return { ok: false, message: 'Δεν υπάρχει αποδελτίωση ή οδηγός για το πρόγραμμα — ορίστε τον κανόνα χειροκίνητα.' }
  const cats = program.expenseCats
  const { deepseekChat } = await import('@/lib/deepseek')
  const text = await deepseekChat([
    { role: 'system', content: [
      'Είσαι σύμβουλος ΕΣΠΑ. Από τα στοιχεία του προγράμματος βρες αν για τις δαπάνες ΑΠΑΙΤΟΥΝΤΑΙ προσφορές προμηθευτών και πότε.',
      `Κατηγορίες δαπανών του προγράμματος (αρίθμηση όπως στον οδηγό):\n${cats.map((c, i) => `${i + 1}. ${c.name}`).join('\n')}`,
      'Απάντησε ΑΥΣΤΗΡΑ JSON: {"policy":"REQUIRED"|"OPTIONAL"|"CONDITIONAL"|null,"count":πόσες προσφορές ή null,"minAmount":ποσό-όριο σε € (δαπάνη ΑΝΩ αυτού) ή null,"categories":[αριθμοί κατηγοριών όπου ισχύει] ή [],"note":"μία πρόταση με τον κανόνα όπως τον λέει ο οδηγός"}.',
      'CONDITIONAL = μόνο σε ορισμένες κατηγορίες ή/και πάνω από ποσό. null αν δεν αναφέρεται πουθενά.',
    ].join('\n') },
    { role: 'user', content: [hits ? `Από την αποδελτίωση της προκήρυξης:\n${hits}` : '', knowledge ? `Γνωσιακή μνήμη:\n${knowledge.slice(0, 16_000)}` : ''].filter(Boolean).join('\n\n') },
  ], { model: 'deepseek-chat', maxTokens: 400, scope: 'OTHER', refType: 'quote-policy' })
  const p = (parseJsonLoose(text) ?? {}) as { policy?: unknown; count?: unknown; minAmount?: unknown; categories?: unknown; note?: unknown }
  const policy = p.policy === 'REQUIRED' || p.policy === 'OPTIONAL' || p.policy === 'CONDITIONAL' ? p.policy : null
  const note = str(p.note) ?? 'Ο οδηγός δεν αναφέρει ρητά.'
  if (policy) {
    const categoryIds = Array.isArray(p.categories) ? p.categories.map(Number).filter(i => i >= 1 && i <= cats.length).map(i => cats[i - 1].id) : []
    const rule = policy === 'CONDITIONAL' ? { count: num(p.count), minAmount: num(p.minAmount), categoryIds } : null
    await prisma.program.update({
      where: { id: app.programId },
      data: { quotePolicy: policy, quotePolicyRule: rule ?? Prisma.DbNull, quotePolicyNote: `Από τον οδηγό: ${note}` },
    })
  }
  return { ok: true, policy, note }
}
