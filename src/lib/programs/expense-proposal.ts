'use server'

import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { aadeLookup, AadeLookupError } from '@/lib/aade'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { ensureTrdrCdnFolder } from '@/lib/trdr/cdn-folder'
import { checkBudgetCompliance } from '@/lib/pm/budget-compliance'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import type { ExpenseEligibilityDetail } from './expense-eligibility'

/**
 * Σχεδιασμός προϋπολογισμού υποβολής — προμηθευτές (με ΑΦΜ μέσω ΑΑΔΕ) + ενυπόγραφη
 * προσφορά (αρχείο) ανά δαπάνη + εκκρεμότητα όταν λείπει προσφορά. Χτίζει πάνω
 * στο υπάρχον ProgramExpense (δεν το αντικαθιστά).
 */

const SUPPLIER_SODTYPE = 12

export type SupplierOption = { id: string; name: string; afm: string | null }

// ── Πρόταση προϋπολογισμού (guided) ─────────────────────────────────────────

export type ProposalExpense = {
  lines: { id: string; product: string; description: string | null; quantity: number | null; unit: string | null; unitPrice: number | null; lineTotal: number }[]
  id: string
  description: string
  amount: number
  categoryId: string | null
  supplierName: string | null
  supplierAfm: string | null
  hasQuote: boolean
  quoteName: string | null
  eligibilityVerdict: string | null
  eligibilityNote: string | null
  eligibilityDetail: ExpenseEligibilityDetail | null
}
export type ProposalCategory = {
  id: string
  name: string
  mandatory: boolean
  minAmount: number | null
  maxAmount: number | null
  minPercentage: number | null
  maxPercentage: number | null
  limitLabel: string
  maxEuro: number | null   // δεσμευτικό ανώτατο όριο σε € (min ποσού & ποσοστού×προϋπολογισμού)
  spent: number
  status: 'OK' | 'UNDER' | 'OVER'
  remaining: number | null // maxEuro - spent (null αν δεν υπάρχει όριο σε €)
}
export type BudgetProposal = {
  programTitle: string
  trdrId: string
  trdrName: string
  totalBudget: number | null
  totalSpent: number
  categories: ProposalCategory[]
  expenses: ProposalExpense[]
  missingQuotes: number
}

function limitLabel(c: { minAmount: number | null; maxAmount: number | null; minPercentage: number | null; maxPercentage: number | null }): string {
  const parts: string[] = []
  if (c.minAmount != null && c.maxAmount != null) parts.push(`${c.minAmount}€–${c.maxAmount}€`)
  else if (c.maxAmount != null) parts.push(`≤ ${c.maxAmount}€`)
  else if (c.minAmount != null) parts.push(`≥ ${c.minAmount}€`)
  if (c.maxPercentage != null) parts.push(`≤ ${c.maxPercentage}%`)
  else if (c.minPercentage != null) parts.push(`≥ ${c.minPercentage}%`)
  return parts.join(' · ') || 'χωρίς όριο'
}

/** Δεσμευτικό ανώτατο όριο κατηγορίας σε €: το μικρότερο από (ρητό ποσό) και
 * (ποσοστό × συνολικό προϋπολογισμό). null αν δεν ορίζεται όριο ή λείπει ο
 * προϋπολογισμός για να μετατραπεί το ποσοστό σε €. */
function maxEuroCap(c: { maxAmount: number | null; maxPercentage: number | null }, totalBudget: number | null): number | null {
  const caps: number[] = []
  if (c.maxAmount != null) caps.push(c.maxAmount)
  if (c.maxPercentage != null && totalBudget != null) caps.push((totalBudget * c.maxPercentage) / 100)
  return caps.length ? Math.min(...caps) : null
}

/** Πλήρη δεδομένα «πρότασης προϋπολογισμού» ενός έργου — κατηγορίες με όρια +
 * δαπάνες (με προμηθευτή/προσφορά) + έλεγχος ορίων. Για το guided UI & το PDF. */
export async function getBudgetProposal(applicationId: string): Promise<BudgetProposal | null> {
  await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUnique({
    where: { id: applicationId },
    select: {
      trdrId: true,
      trdr: { select: { NAME: true } },
      program: { select: { title: true, totalBudget: true, expenseCats: { orderBy: { order: 'asc' }, select: { id: true, name: true, mandatory: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true } } } },
    },
  })
  if (!app) return null
  const totalBudget = app.program.totalBudget == null ? null : Number(app.program.totalBudget)

  const rows = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: { id: true, description: true, amount: true, categoryId: true, confirmed: true, quoteStorageKey: true, quoteName: true, supplier: { select: { NAME: true, AFM: true } }, vendor: true, vendorAfm: true, eligibilityVerdict: true, eligibilityNote: true, eligibilityDetail: true, lines: { orderBy: { order: 'asc' }, select: { id: true, product: true, description: true, quantity: true, unit: true, unitPrice: true, lineTotal: true } } },
  })

  const cats = app.program.expenseCats.map(c => ({
    id: c.id, name: c.name, mandatory: c.mandatory,
    minAmount: c.minAmount == null ? null : Number(c.minAmount),
    maxAmount: c.maxAmount == null ? null : Number(c.maxAmount),
    minPercentage: c.minPercentage == null ? null : Number(c.minPercentage),
    maxPercentage: c.maxPercentage == null ? null : Number(c.maxPercentage),
  }))
  const comp = checkBudgetCompliance(
    rows.map(r => ({ amount: Number(r.amount), categoryId: r.categoryId, confirmed: r.confirmed })),
    cats,
    totalBudget,
  )

  const categories: ProposalCategory[] = comp.categories.map(c => {
    const maxEuro = maxEuroCap(c, totalBudget)
    return {
      id: c.id, name: c.name, mandatory: c.mandatory,
      minAmount: c.minAmount, maxAmount: c.maxAmount, minPercentage: c.minPercentage, maxPercentage: c.maxPercentage,
      limitLabel: limitLabel(c),
      maxEuro,
      spent: c.spent, status: c.status,
      remaining: maxEuro != null ? maxEuro - c.spent : null,
    }
  })
  const expenses: ProposalExpense[] = rows.map(r => ({
    id: r.id, description: r.description, amount: Number(r.amount), categoryId: r.categoryId,
    supplierName: r.supplier?.NAME ?? r.vendor ?? null, supplierAfm: r.supplier?.AFM ?? r.vendorAfm ?? null,
    hasQuote: !!r.quoteStorageKey, quoteName: r.quoteName,
    eligibilityVerdict: r.eligibilityVerdict, eligibilityNote: r.eligibilityNote, eligibilityDetail: (r.eligibilityDetail as unknown as ExpenseEligibilityDetail | null) ?? null,
    lines: r.lines.map(l => ({
      id: l.id, product: l.product, description: l.description, unit: l.unit,
      quantity: l.quantity == null ? null : Number(l.quantity),
      unitPrice: l.unitPrice == null ? null : Number(l.unitPrice),
      lineTotal: Number(l.lineTotal),
    })),
  }))

  return {
    programTitle: app.program.title, trdrId: app.trdrId, trdrName: app.trdr.NAME, totalBudget, totalSpent: comp.totalSpent,
    categories, expenses, missingQuotes: expenses.filter(e => !e.hasQuote).length,
  }
}

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

// ── Αξιολόγηση επιλεξιμότητας δαπάνης (AI τεκμηρίωση, DeepSeek) ──────────────

export type ExpenseEligibility = {
  verdict: 'ELIGIBLE' | 'INELIGIBLE' | 'UNCERTAIN'
  note: string
  checkedAt: string
  suggestedCategoryId: string | null
  suggestedCategoryName: string | null
  detail: ExpenseEligibilityDetail
}

/**
 * Αξιολογεί με DeepSeek αν η δαπάνη είναι ΕΠΙΛΕΞΙΜΗ βάσει των κανόνων της
 * αποδελτίωσης (κατηγορίες/όρια/όροι επιλεξιμότητας) και παράγει ΤΕΚΜΗΡΙΩΣΗ.
 * ΒΟΗΘΗΜΑ — ο διαχειριστής αποφασίζει. Αποθηκεύεται στη δαπάνη.
 */
export async function evaluateExpenseEligibility(expenseId: string, opts: { userId?: string | null } = {}): Promise<{ ok: true; result: ExpenseEligibility } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const exp = await prisma.programExpense.findUnique({
    where: { id: expenseId },
    select: { categoryId: true, application: { select: { program: { select: { expenseCats: { select: { id: true, name: true } } } } } } },
  })
  if (!exp) return { ok: false, message: 'Η δαπάνη δεν βρέθηκε.' }

  let detail: ExpenseEligibilityDetail
  try {
    const { assessExpenseEligibility } = await import('./expense-eligibility')
    detail = await assessExpenseEligibility(expenseId, { userId: opts.userId ?? session.user.id })
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η αξιολόγηση απέτυχε.' }
  }

  // Προτεινόμενη κατηγορία → κατηγορία του προγράμματος (normalized), μόνο αν διαφέρει από την τρέχουσα.
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω]+/gi, ' ').trim()
  let suggestedCategoryId: string | null = null
  let suggestedCategoryName: string | null = null
  if (detail.suggestedCategory) {
    const hit = exp.application.program.expenseCats.find(c => norm(c.name) === norm(detail.suggestedCategory!))
    if (hit && hit.id !== exp.categoryId) { suggestedCategoryId = hit.id; suggestedCategoryName = hit.name }
  }

  const checkedAt = new Date(detail.checkedAt)
  await prisma.programExpense.update({
    where: { id: expenseId },
    data: { eligibilityVerdict: detail.verdict, eligibilityNote: detail.summary, eligibilityCheckedAt: checkedAt, eligibilityDetail: detail as unknown as object },
  })
  revalidatePath('/programs')
  return { ok: true, result: { verdict: detail.verdict, note: detail.summary, checkedAt: detail.checkedAt, suggestedCategoryId, suggestedCategoryName, detail } }
}

// ── Β3: AI έλεγχος σχεδίου δαπανών (budget sanity) ────────────────────────────

export type BudgetSanity = { status: 'READY' | 'RISKS'; findings: string[] }

/** AI έλεγχος όλου του σχεδίου δαπανών: υπερβάσεις ορίων, υποχρεωτικές κενές
 * κατηγορίες, δαπάνες χωρίς προσφορά, μη-επιλέξιμες δαπάνες → λίστα ευρημάτων
 * σε φυσική γλώσσα. Πατά πάνω στο getBudgetProposal (καμία νέα άντληση). */
export async function budgetSanityCheck(applicationId: string): Promise<{ ok: true; result: BudgetSanity } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const bp = await getBudgetProposal(applicationId)
  if (!bp) return { ok: false, message: 'Δεν βρέθηκε το έργο.' }

  const eur = (n: number | null) => n == null ? '—' : `${n}€`
  const catLines = bp.categories.map(c => `- ${c.name}${c.mandatory ? ' (ΥΠΟΧΡΕΩΤΙΚΗ)' : ''}: σχέδιο ${c.spent}€ / όριο ${eur(c.maxEuro)} [${c.status}]`).join('\n')
  const ineligible = bp.expenses.filter(e => e.eligibilityVerdict === 'INELIGIBLE').map(e => e.description)
  const facts = [
    `Προϋπολογισμός προγράμματος: ${eur(bp.totalBudget)}`,
    `Σύνολο σχεδίου: ${bp.totalSpent}€`,
    `Δαπάνες χωρίς ενυπόγραφη προσφορά: ${bp.missingQuotes}`,
    ineligible.length ? `Δαπάνες που το AI έκρινε ΜΗ επιλέξιμες: ${ineligible.join(', ')}` : 'Καμία δαπάνη δεν έχει σημανθεί ΜΗ επιλέξιμη.',
    `Κατηγορίες (status OK/OVER/UNDER):\n${catLines}`,
  ].join('\n')

  const messages = [
    { role: 'system' as const, content: 'Είσαι έμπειρος σύμβουλος ΕΣΠΑ. Έλεγξε ένα σχέδιο δαπανών για κινδύνους πριν την υποβολή. Εντόπισε: υπερβάσεις ορίων (OVER), υποχρεωτικές κατηγορίες χωρίς δαπάνη, δαπάνες χωρίς προσφορά, μη-επιλέξιμες δαπάνες, κατηγορίες κάτω από ελάχιστο (UNDER). Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"status":"READY"|"RISKS","findings":["σύντομες προτάσεις στα ελληνικά, μία ανά εύρημα, με το τι πρέπει να διορθωθεί"]}. status=READY μόνο αν δεν υπάρχει κανένας ουσιαστικός κίνδυνος· αλλιώς RISKS με τα ευρήματα ταξινομημένα κατά σοβαρότητα.' },
    { role: 'user' as const, content: facts },
  ]
  try {
    const text = await deepseekChat(messages, { model: 'deepseek-chat', maxTokens: 600, scope: 'OTHER', refType: 'budget-sanity', refId: applicationId })
    const p = parseJsonLoose(text) as { status?: unknown; findings?: unknown } | null
    const status = typeof p?.status === 'string' && p.status.toUpperCase() === 'READY' ? 'READY' : 'RISKS'
    const findings = Array.isArray(p?.findings) ? p.findings.filter((x): x is string => typeof x === 'string' && x.trim().length > 0).map(x => x.trim()) : []
    return { ok: true, result: { status, findings } }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Ο έλεγχος απέτυχε.' }
  }
}

// ── C4: Κύκλωμα προσφορών — σάρωση → προμηθευτής → γραμμές → δαπάνες ─────────

export type QuoteLine = {
  /** προϊόν/υπηρεσία (σύντομο όνομα ή κωδικός/μοντέλο) */
  product: string
  /** αναλυτική περιγραφή αν υπάρχει */
  description: string
  quantity: number | null
  unit?: string | null
  unitPrice: number | null
  vatPct: number | null
  /** καθαρό ποσό γραμμής (χωρίς ΦΠΑ) */
  total: number
  categoryId: string | null
  categoryReason: string | null
}
export type QuoteScan = {
  supplier: { afm: string | null; name: string | null; existing: SupplierOption | null }
  docNumber: string | null
  date: string | null
  lines: QuoteLine[]
  totals: { net: number | null; vat: number | null; gross: number | null }
}

const amountOf = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[€\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

/**
 * Διαβάζει προσφορά (PDF/εικόνα) με Gemini και σε ΜΙΑ κλήση: προμηθευτής (ΑΦΜ/επωνυμία),
 * αριθμός/ημερομηνία, ΟΛΕΣ οι γραμμές (περιγραφή, ποσότητα, τιμή μονάδας, ΦΠΑ, καθαρό σύνολο)
 * και πρόταση κατηγορίας δαπάνης του προγράμματος για κάθε γραμμή.
 */
export async function scanQuoteForApplication(
  applicationId: string,
  file: { base64: string; mimeType: string },
): Promise<{ ok: true; scan: QuoteScan } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUnique({
    where: { id: applicationId },
    select: { program: { select: { title: true, expenseCats: { orderBy: { order: 'asc' }, select: { id: true, name: true, notes: true } } } } },
  })
  if (!app) return { ok: false, message: 'Το έργο δεν βρέθηκε.' }
  const cats = app.program.expenseCats
  const catList = cats.map(c => `- id=${c.id}: ${c.name}${c.notes ? ` — ${c.notes.slice(0, 160)}` : ''}`).join('\n') || '(το πρόγραμμα δεν έχει κατηγορίες)'
  const { geminiGenerate } = await import('@/lib/gemini')
  const system = [
    'Διαβάζεις ελληνική ΠΡΟΣΦΟΡΑ προμηθευτή (οικονομική προσφορά/τιμολόγιο προφόρμα) για επενδυτικό σχέδιο ΕΣΠΑ.',
    'Εξήγαγε: ΑΦΜ και επωνυμία του ΠΡΟΜΗΘΕΥΤΗ (εκδότη — όχι του πελάτη), αριθμό & ημερομηνία προσφοράς,',
    'και ΚΑΘΕ γραμμή προϊόντος/υπηρεσίας: product = όνομα προϊόντος/υπηρεσίας (σύντομο, με κωδικό/μοντέλο αν υπάρχει), description = αναλυτική περιγραφή/προδιαγραφές αν υπάρχουν (αλλιώς null), ποσότητα, μονάδα, τιμή μονάδας, ΦΠΑ %, καθαρό μερικό σύνολο γραμμής ΧΩΡΙΣ ΦΠΑ.',
    'Μην ενώνεις γραμμές και μην παραλείπεις καμία· αγνόησε γραμμές συνόλων/εκπτώσεων εκτός αν είναι ξεχωριστό είδος.',
    `Για κάθε γραμμή πρότεινε την πιο κατάλληλη ΚΑΤΗΓΟΡΙΑ ΔΑΠΑΝΗΣ του προγράμματος «${app.program.title}» (id από τη λίστα ή null):\n${catList}`,
    'Ποσά με τελεία δεκαδικών. ΑΥΣΤΗΡΑ JSON: {"supplierAfm":"...","supplierName":"...","docNumber":"...","date":"YYYY-MM-DD",',
    '"lines":[{"product":"...","description":"..."|null,"quantity":n,"unit":"τεμ."|null,"unitPrice":n,"vatPct":n,"total":n,"categoryId":"..."|null,"categoryReason":"σύντομα"}],',
    '"totals":{"net":n,"vat":n,"gross":n}}',
  ].join(' ')
  try {
    const res = await geminiGenerate({
      parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: 'Εξήγαγε την προσφορά.' }],
      systemInstruction: system,
      json: true,
      scope: 'OCR_VISION',
      refType: 'quote-scan',
      refId: applicationId,
      userId: session.user.id,
    })
    const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
    const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
    const validCat = new Set(cats.map(c => c.id))
    const lines: QuoteLine[] = (Array.isArray(p.lines) ? (p.lines as Record<string, unknown>[]) : [])
      .map(l => {
        const quantity = amountOf(l.quantity)
        const unitPrice = amountOf(l.unitPrice)
        const total = amountOf(l.total) ?? (quantity != null && unitPrice != null ? Math.round(quantity * unitPrice * 100) / 100 : null)
        const cid = s(l.categoryId)
        return {
          product: s(l.product) ?? s(l.description) ?? '',
          description: s(l.product) ? (s(l.description) ?? '') : '',
          unit: s(l.unit),
          quantity, unitPrice, vatPct: amountOf(l.vatPct),
          total: total ?? 0,
          categoryId: cid && validCat.has(cid) ? cid : null,
          categoryReason: s(l.categoryReason),
        }
      })
      .filter(l => l.product && l.total > 0)
    const t = (p.totals ?? {}) as Record<string, unknown>
    const afm = s(p.supplierAfm)?.replace(/\D/g, '').slice(0, 9) || null
    const existing = afm
      ? await prisma.trdr.findFirst({ where: { AFM: afm, SODTYPE: SUPPLIER_SODTYPE }, select: { id: true, NAME: true, AFM: true } })
      : null
    return {
      ok: true,
      scan: {
        supplier: { afm, name: s(p.supplierName), existing: existing ? { id: existing.id, name: existing.NAME, afm: existing.AFM } : null },
        docNumber: s(p.docNumber),
        date: s(p.date) && /^\d{4}-\d{2}-\d{2}$/.test(s(p.date)!) ? s(p.date) : null,
        lines,
        totals: { net: amountOf(t.net), vat: amountOf(t.vat), gross: amountOf(t.gross) },
      },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ανάγνωση της προσφοράς απέτυχε.' }
  }
}

/**
 * Δημιουργεί δαπάνες από προσφορά: εύρεση/δημιουργία προμηθευτή (ΑΦΜ → ΑΑΔΕ), μία δαπάνη ανά
 * γραμμή ή ομαδοποιημένες ανά κατηγορία, με το ΙΔΙΟ αρχείο προσφοράς συνημμένο σε όλες
 * (ένα upload). Ο προμηθευτής «συνδέεται» με τον πελάτη μέσω των δαπανών του έργου.
 */
export async function createExpensesFromQuote(
  applicationId: string,
  input: {
    supplierAfm: string | null
    supplierTrdrId?: string | null
    docNumber?: string | null
    date?: string | null
    groupBy: 'line' | 'category'
    lines: QuoteLine[]
    quote: { name: string; base64: string; mimeType: string; ext: string } | null
  },
): Promise<{ ok: true; created: number; supplier: SupplierOption | null; supplierCreated: boolean } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const lines = input.lines.filter(l => l.product.trim() && l.total > 0)
  if (lines.length === 0) return { ok: false, message: 'Δεν επιλέχθηκε καμία γραμμή.' }

  // 1. Προμηθευτής
  let supplier: SupplierOption | null = null
  let supplierCreated = false
  if (input.supplierTrdrId) {
    const s = await prisma.trdr.findUnique({ where: { id: input.supplierTrdrId }, select: { id: true, NAME: true, AFM: true } })
    if (s) supplier = { id: s.id, name: s.NAME, afm: s.AFM }
  } else if (input.supplierAfm) {
    const r = await findOrCreateSupplierByAfm(input.supplierAfm)
    if (!r.ok) return { ok: false, message: r.message ?? 'Αδυναμία εύρεσης προμηθευτή.' }
    supplier = r.supplier ?? null
    supplierCreated = !!r.created
  }

  // 2. Ομαδοποίηση
  type Group = { description: string; amount: number; vat: number; categoryId: string | null; lines: QuoteLine[] }
  const fmt = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const lineDesc = (l: QuoteLine) =>
    l.quantity != null && l.unitPrice != null && l.quantity !== 1 ? `${l.product} — ${l.quantity} × ${fmt(l.unitPrice)} €` : l.product
  const vatOf = (l: QuoteLine) => (l.vatPct != null ? Math.round(l.total * l.vatPct) / 100 : 0)
  let groups: Group[]
  if (input.groupBy === 'category') {
    const by = new Map<string, Group & { items: string[] }>()
    for (const l of lines) {
      const k = l.categoryId ?? '__none__'
      const g = by.get(k) ?? { description: '', amount: 0, vat: 0, categoryId: l.categoryId, items: [], lines: [] }
      g.lines.push(l)
      g.amount += l.total
      g.vat += vatOf(l)
      g.items.push(lineDesc(l))
      by.set(k, g)
    }
    groups = [...by.values()].map(g => ({
      ...g,
      description: (g.items.length === 1 ? g.items[0] : `${g.items.slice(0, 3).join('· ')}${g.items.length > 3 ? ` κ.ά. (${g.items.length} είδη)` : ''}`).slice(0, 480),
    }))
  } else {
    groups = lines.map(l => ({ description: lineDesc(l).slice(0, 480), amount: l.total, vat: vatOf(l), categoryId: l.categoryId, lines: [l] }))
  }

  // 3. Ένα upload προσφοράς — κοινό σε όλες τις δαπάνες.
  let quoteKey: string | null = null
  if (input.quote) {
    const ext = (input.quote.ext || 'pdf').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'pdf'
    quoteKey = `expense-quotes/app-${applicationId}/${crypto.randomUUID()}.${ext}`
    await bunnyUploadPrivate({ key: quoteKey, body: Buffer.from(input.quote.base64, 'base64'), contentType: input.quote.mimeType })
  }

  // 4. Δαπάνες
  const { createExpense } = await import('@/lib/programs/actions')
  let created = 0
  for (const g of groups) {
    const { id } = await createExpense(applicationId, {
      description: g.description,
      lines: g.lines.map(l => ({ product: l.product, description: l.description || null, quantity: l.quantity, unit: l.unit ?? null, unitPrice: l.unitPrice, vatPct: l.vatPct, lineTotal: l.total })),
      amount: Math.round(g.amount * 100) / 100,
      vatAmount: g.vat ? Math.round(g.vat * 100) / 100 : null,
      date: input.date ?? null,
      docNumber: input.docNumber ?? null,
      categoryId: g.categoryId,
      supplierTrdrId: supplier?.id ?? null,
    })
    if (quoteKey && input.quote) {
      await prisma.programExpense.update({ where: { id }, data: { quoteStorageKey: quoteKey, quoteName: input.quote.name.trim() || 'Προσφορά', quoteMimeType: input.quote.mimeType } })
      await syncQuoteObligation(id)
    }
    created++
  }
  revalidatePath('/programs')
  return { ok: true, created, supplier, supplierCreated }
}
