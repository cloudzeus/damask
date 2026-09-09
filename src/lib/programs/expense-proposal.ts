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

/**
 * Σχεδιασμός προϋπολογισμού υποβολής — προμηθευτές (με ΑΦΜ μέσω ΑΑΔΕ) + ενυπόγραφη
 * προσφορά (αρχείο) ανά δαπάνη + εκκρεμότητα όταν λείπει προσφορά. Χτίζει πάνω
 * στο υπάρχον ProgramExpense (δεν το αντικαθιστά).
 */

const SUPPLIER_SODTYPE = 12

export type SupplierOption = { id: string; name: string; afm: string | null }

// ── Πρόταση προϋπολογισμού (guided) ─────────────────────────────────────────

export type ProposalExpense = {
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
    select: { id: true, description: true, amount: true, categoryId: true, confirmed: true, quoteStorageKey: true, quoteName: true, supplier: { select: { NAME: true, AFM: true } }, vendor: true, vendorAfm: true, eligibilityVerdict: true, eligibilityNote: true },
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
    eligibilityVerdict: r.eligibilityVerdict, eligibilityNote: r.eligibilityNote,
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
}

/**
 * Αξιολογεί με DeepSeek αν η δαπάνη είναι ΕΠΙΛΕΞΙΜΗ βάσει των κανόνων της
 * αποδελτίωσης (κατηγορίες/όρια/όροι επιλεξιμότητας) και παράγει ΤΕΚΜΗΡΙΩΣΗ.
 * ΒΟΗΘΗΜΑ — ο διαχειριστής αποφασίζει. Αποθηκεύεται στη δαπάνη.
 */
export async function evaluateExpenseEligibility(expenseId: string, opts: { userId?: string | null } = {}): Promise<{ ok: true; result: ExpenseEligibility } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const exp = await prisma.programExpense.findUnique({
    where: { id: expenseId },
    select: {
      description: true, amount: true,
      categoryId: true,
      category: { select: { name: true, minAmount: true, maxAmount: true, minPercentage: true, maxPercentage: true } },
      application: { select: { program: { select: { title: true, eligibilityNote: true, expenseCats: { select: { id: true, name: true } } } } } },
    },
  })
  if (!exp) return { ok: false, message: 'Η δαπάνη δεν βρέθηκε.' }
  const prog = exp.application.program

  const rules = [
    `Πρόγραμμα: ${prog.title}`,
    prog.eligibilityNote ? `Όροι επιλεξιμότητας: ${prog.eligibilityNote}` : null,
    `Επιλέξιμες κατηγορίες δαπανών: ${prog.expenseCats.map(c => c.name).join(', ') || '—'}`,
    exp.category ? `Η δαπάνη έχει καταχωριστεί στην κατηγορία «${exp.category.name}»${exp.category.maxAmount ? ` (όριο ${Number(exp.category.maxAmount)}€)` : ''}.` : 'Η δαπάνη δεν έχει κατηγορία.',
  ].filter(Boolean).join('\n')

  const messages = [
    { role: 'system' as const, content: 'Είσαι έμπειρος σύμβουλος ΕΣΠΑ. Αξιολόγησε αν μια δαπάνη είναι ΕΠΙΛΕΞΙΜΗ για χρηματοδότηση βάσει ΜΟΝΟ των κανόνων του προγράμματος που δίνονται. Πρότεινε ΚΑΙ την καταλληλότερη κατηγορία από τη λίστα (ακριβές όνομα ή null). Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"verdict":"ELIGIBLE"|"INELIGIBLE"|"UNCERTAIN","justification":"2-4 προτάσεις στα ελληνικά με αναφορά στους κανόνες","suggestedCategory":"ακριβές όνομα κατηγορίας από τη λίστα ή null"}. Αν τα στοιχεία δεν επαρκούν, verdict=UNCERTAIN.' },
    { role: 'user' as const, content: `${rules}\n\nΔΑΠΑΝΗ ΠΡΟΣ ΑΞΙΟΛΟΓΗΣΗ:\n- Περιγραφή: ${exp.description}\n- Ποσό: ${Number(exp.amount)}€` },
  ]

  let verdict: ExpenseEligibility['verdict'] = 'UNCERTAIN'
  let note = ''
  let suggestedName: string | null = null
  try {
    const text = await deepseekChat(messages, { model: 'deepseek-chat', maxTokens: 500, scope: 'OTHER', refType: 'expense-eligibility', refId: expenseId, userId: opts.userId })
    const p = parseJsonLoose(text) as { verdict?: unknown; justification?: unknown; suggestedCategory?: unknown } | null
    const v = typeof p?.verdict === 'string' ? p.verdict.toUpperCase() : ''
    verdict = v === 'ELIGIBLE' || v === 'INELIGIBLE' ? v : 'UNCERTAIN'
    note = typeof p?.justification === 'string' ? p.justification.trim() : ''
    suggestedName = typeof p?.suggestedCategory === 'string' ? p.suggestedCategory.trim() : null
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η αξιολόγηση απέτυχε.' }
  }
  if (!note) note = 'Δεν προέκυψε σαφής τεκμηρίωση — έλεγξε χειροκίνητα.'

  // Αντιστοίχιση προτεινόμενου ονόματος → κατηγορία του προγράμματος (normalized).
  const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω]+/gi, ' ').trim()
  let suggestedCategoryId: string | null = null
  let suggestedCategoryName: string | null = null
  if (suggestedName) {
    const hit = prog.expenseCats.find(c => norm(c.name) === norm(suggestedName!))
    // Πρότεινε μόνο αν διαφέρει από την τρέχουσα κατηγορία.
    if (hit && hit.id !== exp.categoryId) { suggestedCategoryId = hit.id; suggestedCategoryName = hit.name }
  }

  const checkedAt = new Date()
  await prisma.programExpense.update({ where: { id: expenseId }, data: { eligibilityVerdict: verdict, eligibilityNote: note, eligibilityCheckedAt: checkedAt } })
  revalidatePath('/programs')
  return { ok: true, result: { verdict, note, checkedAt: checkedAt.toISOString(), suggestedCategoryId, suggestedCategoryName } }
}
