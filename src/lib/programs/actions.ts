'use server'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { revalidatePath } from 'next/cache'
import { extractProgramFromText } from '@/lib/programs/extract'
import { persistExtractedProgram } from '@/lib/programs/persist'
import { suggestCategory } from '@/lib/programs/categorize'
import { expenseCatInput } from '@/lib/programs/expense-prep'
import { buildOcrCostViewForSession, type OcrCostView } from '@/lib/ingestion/ocr-cost'

/**
 * Server orchestration για τη διαχείριση Προγραμμάτων Χρηματοδότησης
 * (Task 10): list/create/update/delete Program + upload του πηγαίου PDF
 * στο ιδιωτικό BunnyCDN + AI εξαγωγή δομημένων δεδομένων (extractProgram).
 * Κάθε exported action ΞΕΚΙΝΑΕΙ με requirePermission('programs.manage')
 * (ΠΟΤΕ render-time gating — δες node_modules/next/dist/docs/01-app/02-guides/
 * server-actions.md#security).
 *
 * Task 11 (applications/expenses/AI category suggestion) προστίθεται στο
 * τέλος αυτού του ίδιου module.
 */

export type ProgramListItem = {
  id: string
  title: string
  referenceCode: string | null
  totalBudget: number | null
  fundingRate: number | null
  submissionEnd: string | null
  status: string
  extractStatus: string
}

export async function listPrograms(): Promise<ProgramListItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.program.findMany({ orderBy: { updatedAt: 'desc' } })
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    referenceCode: r.referenceCode,
    totalBudget: r.totalBudget != null ? Number(r.totalBudget) : null,
    fundingRate: r.fundingRate != null ? Number(r.fundingRate) : null,
    submissionEnd: r.submissionEnd ? r.submissionEnd.toISOString() : null,
    status: r.status,
    extractStatus: r.extractStatus,
  }))
}

export async function createProgram(input: {
  title: string
  sourceFileName?: string
  pdfBase64?: string
  mimeType?: string
}): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const id = crypto.randomUUID()

  let storageKey: string | null = null
  let mimeType: string | null = null
  let size: number | null = null

  if (input.pdfBase64) {
    const body = Buffer.from(input.pdfBase64, 'base64')
    mimeType = input.mimeType ?? 'application/pdf'
    storageKey = `programs/${id}/source.pdf`
    await bunnyUploadPrivate({ key: storageKey, body, contentType: mimeType })
    size = body.length
  }

  await prisma.program.create({
    data: {
      id,
      title: input.title.trim(),
      sourceFileName: input.sourceFileName ?? null,
      storageKey,
      mimeType,
      size,
      status: 'DRAFT',
      extractStatus: 'PENDING',
      createdById: session.user.id,
    },
  })
  revalidatePath('/programs')
  return { id }
}

function parseDateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function updateProgramMeta(
  id: string,
  input: {
    title?: string
    summary?: string | null
    referenceCode?: string | null
    totalBudget?: number | null
    fundingRate?: number | null
    durationMonths?: number | null
    submissionStart?: string | null
    submissionEnd?: string | null
    publicationDate?: string | null
    minEmployeesFte?: number | null
    minOperationalYears?: number | null
    eligibilityNote?: string | null
    status?: 'DRAFT' | 'ACTIVE' | 'CLOSED'
    notes?: string | null
  },
): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.program.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.referenceCode !== undefined ? { referenceCode: input.referenceCode } : {}),
      ...(input.totalBudget !== undefined ? { totalBudget: input.totalBudget } : {}),
      ...(input.fundingRate !== undefined ? { fundingRate: input.fundingRate } : {}),
      ...(input.durationMonths !== undefined ? { durationMonths: input.durationMonths } : {}),
      ...(input.submissionStart !== undefined ? { submissionStart: parseDateOrNull(input.submissionStart) } : {}),
      ...(input.submissionEnd !== undefined ? { submissionEnd: parseDateOrNull(input.submissionEnd) } : {}),
      ...(input.publicationDate !== undefined ? { publicationDate: parseDateOrNull(input.publicationDate) } : {}),
      ...(input.minEmployeesFte !== undefined ? { minEmployeesFte: input.minEmployeesFte } : {}),
      ...(input.minOperationalYears !== undefined ? { minOperationalYears: input.minOperationalYears } : {}),
      ...(input.eligibilityNote !== undefined ? { eligibilityNote: input.eligibilityNote } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  })
  revalidatePath(`/programs/${id}`)
}

export async function deleteProgram(id: string): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.program.delete({ where: { id } })
  revalidatePath('/programs')
}

export async function extractProgram(programId: string, text: string): Promise<{ ok: boolean; cost: OcrCostView | null; error?: string }> {
  const session = await requirePermission('programs.manage')
  await prisma.program.update({ where: { id: programId }, data: { extractStatus: 'RUNNING' } })

  try {
    const r = await extractProgramFromText(text, { refId: programId, userId: session.user.id })
    await persistExtractedProgram(programId, r.data)
    await prisma.program.update({
      where: { id: programId },
      data: { model: r.model, extractedData: r.data as Prisma.InputJsonValue },
    })
    const cost = await buildOcrCostViewForSession(session.user.role, r.model, r.tokensUsed)
    revalidatePath(`/programs/${programId}`)
    return { ok: true, cost }
  } catch (err) {
    console.error(`extractProgram: αποτυχία εξαγωγής για program ${programId}`, err)
    const message = 'Η αποδελτίωση απέτυχε. Δοκίμασε ξανά ή έλεγξε το PDF.'
    await prisma.program.update({
      where: { id: programId },
      data: { extractStatus: 'FAILED', errorMessage: message },
    })
    revalidatePath(`/programs/${programId}`)
    return { ok: false, cost: null, error: message }
  }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Task 11 — applications + expenses + AI category suggest/confirm.
 * ═══════════════════════════════════════════════════════════════════════ */

export async function createApplication(input: { trdrId: string; programId: string }): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const app = await prisma.programApplication.upsert({
    where: { trdrId_programId: { trdrId: input.trdrId, programId: input.programId } },
    create: { trdrId: input.trdrId, programId: input.programId, createdById: session.user.id },
    update: {},
  })

  // C2e: materialize per-stage task templates onto the new/linked application.
  // Generation failure must NOT roll back enrollment — the manager can re-run
  // via «Ανανέωση βημάτων».
  try {
    const { generateObligations } = await import('@/lib/pm/actions')
    await generateObligations(app.id)
  } catch (err) {
    console.error('[createApplication] task generation failed', err)
  }

  // C2g (Task 4): materialize APPLICATION-level deliverable groups right
  // away (e.g. ASSESSMENT-phase tasks) — EXPENSE-level groups materialize
  // per-expense once createExpense/replaceExpense runs below. Non-fatal,
  // same idiom as generateObligations above — enrollment must never roll
  // back because deliverable generation failed.
  try {
    const { generateExpenseDeliverables } = await import('@/lib/pm/actions')
    await generateExpenseDeliverables(app.id)
  } catch (err) {
    console.error('[createApplication] deliverable generation failed', err)
  }

  return { id: app.id }
}

export type ProgramExpenseItem = {
  id: string
  description: string
  amount: number
  vatAmount: number | null
  date: string | null
  vendor: string | null
  docNumber: string | null
  suggestedCategoryId: string | null
  suggestionReason: string | null
  suggestionConfidence: number | null
  categoryId: string | null
  confirmed: boolean
  status: 'ACTIVE' | 'REPLACED'
  replacesExpenseId: string | null
}

export async function listApplicationExpenses(applicationId: string): Promise<ProgramExpenseItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programExpense.findMany({
    where: { applicationId },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(r => ({
    id: r.id,
    description: r.description,
    amount: Number(r.amount),
    vatAmount: r.vatAmount != null ? Number(r.vatAmount) : null,
    date: r.date ? r.date.toISOString() : null,
    vendor: r.vendor,
    docNumber: r.docNumber,
    suggestedCategoryId: r.suggestedCategoryId,
    suggestionReason: r.suggestionReason,
    suggestionConfidence: r.suggestionConfidence,
    categoryId: r.categoryId,
    confirmed: r.confirmed,
    status: r.status,
    replacesExpenseId: r.replacesExpenseId,
  }))
}

export async function createExpense(
  applicationId: string,
  input: {
    description: string
    amount: number
    vatAmount?: number | null
    date?: string | null
    vendor?: string | null
    vendorAfm?: string | null
    docNumber?: string | null
  },
): Promise<{ id: string }> {
  await requirePermission('programs.manage')
  const row = await prisma.programExpense.create({
    data: {
      applicationId,
      description: input.description.trim(),
      amount: input.amount,
      vatAmount: input.vatAmount ?? null,
      date: parseDateOrNull(input.date) ?? null,
      vendor: input.vendor ?? null,
      vendorAfm: input.vendorAfm ?? null,
      docNumber: input.docNumber ?? null,
    },
  })

  // C2g (Task 4): materialize per-expense deliverable groups onto the new
  // expense. Non-fatal — mirrors the generateObligations idiom in
  // createApplication: the expense must exist even if deliverable
  // generation fails; the manager can retry via the UI.
  try {
    const { generateExpenseDeliverables } = await import('@/lib/pm/actions')
    await generateExpenseDeliverables(applicationId)
  } catch (err) {
    console.error('[createExpense] deliverable generation failed', err)
  }

  return { id: row.id }
}

/**
 * Φορτώνει τη δαπάνη → application → program (με τις eligible expense
 * categories του), τη μετατρέπει σε CatInput (expenseCatInput — Decimal→
 * Number ΕΔΩ, πριν φύγει προς το prompt) και ζητά AI πρόταση κατηγορίας.
 * Δεν θέτει confirmed=true — αυτό γίνεται ρητά από τον χρήστη μέσω
 * confirmExpenseCategory.
 */
export async function suggestExpenseCategory(expenseId: string) {
  const session = await requirePermission('programs.manage')
  const expense = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    include: { application: { include: { program: { include: { expenseCats: true } } } } },
  })

  const catInput = expenseCatInput(
    {
      expenseCats: expense.application.program.expenseCats.map(c => ({
        id: c.id,
        name: c.name,
        minPercentage: c.minPercentage != null ? Number(c.minPercentage) : null,
        maxPercentage: c.maxPercentage != null ? Number(c.maxPercentage) : null,
        mandatory: c.mandatory,
        notes: c.notes,
      })),
    },
    {
      description: expense.description,
      amount: Number(expense.amount),
      vendor: expense.vendor,
    },
  )

  const s = await suggestCategory(catInput, { refId: expenseId, userId: session.user.id })

  await prisma.programExpense.update({
    where: { id: expenseId },
    data: {
      suggestedCategoryId: s.categoryId,
      suggestionReason: s.reason,
      suggestionConfidence: s.confidence,
      suggestionSource: 'AI',
    },
  })

  return s
}

export async function confirmExpenseCategory(expenseId: string, categoryId: string): Promise<{ ok: boolean }> {
  await requirePermission('programs.manage')
  await prisma.programExpense.update({
    where: { id: expenseId },
    data: { categoryId, confirmed: true },
  })
  return { ok: true }
}

/** Τρέχει suggestExpenseCategory σε σειρά για κάθε ΜΗ-επιβεβαιωμένη δαπάνη
 * της αίτησης (τα ήδη confirmed δεν ξαναπροτείνονται — ο χρήστης έχει ήδη
 * κλειδώσει την κατηγορία τους). Κάθε δαπάνη είναι απομονωμένη — μία
 * αποτυχία (π.χ. DeepSeek error) δεν σταματά το batch, μετριέται ως failed
 * και το loop συνεχίζει στην επόμενη δαπάνη. */
export async function suggestAllExpenses(applicationId: string): Promise<{ suggested: number; failed: number }> {
  await requirePermission('programs.manage')
  const pending = await prisma.programExpense.findMany({
    where: { applicationId, confirmed: false },
    select: { id: true },
  })
  let suggested = 0
  let failed = 0
  for (const e of pending) {
    try {
      await suggestExpenseCategory(e.id)
      suggested += 1
    } catch (err) {
      console.error(`suggestAllExpenses: αποτυχία πρότασης για expense ${e.id}`, err)
      failed += 1
    }
  }
  return { suggested, failed }
}

/* ═══════════════════════════════════════════════════════════════════════
 * Task 15 — read helpers για το UI (Σύνδεση εταιρείας / λίστα εφαρμογών /
 * confirm <select> επιλογές κατηγορίας). Μικρά, gated read actions —
 * καμία απαιτεί side-effect πέρα από query.
 * ═══════════════════════════════════════════════════════════════════════ */

export type ProgramApplicationItem = {
  id: string
  trdrId: string
  trdrName: string
  status: string
  expenseCount: number
  confirmedCount: number
}

/** Οι αιτήσεις (συνδεδεμένες εταιρείες) ενός προγράμματος, με μετρητές
 * δαπανών/επιβεβαιωμένων ώστε το ApplicationsPanel να δείχνει πρόοδο χωρίς
 * να χρειάζεται ξεχωριστό round-trip ανά γραμμή. */
export async function listApplications(programId: string): Promise<ProgramApplicationItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programApplication.findMany({
    where: { programId },
    include: { trdr: { select: { NAME: true } }, expenses: { select: { confirmed: true } } },
    orderBy: { createdAt: 'desc' },
  })
  return rows.map(r => ({
    id: r.id,
    trdrId: r.trdrId,
    trdrName: r.trdr.NAME,
    status: r.status,
    expenseCount: r.expenses.length,
    confirmedCount: r.expenses.filter(e => e.confirmed).length,
  }))
}

export type ExpenseCategoryOption = { id: string; name: string }

/** id+name λίστα των κατηγοριών δαπανών ενός προγράμματος — για το confirm
 * `<select>` στο ExpenseList (χωρίς τα ποσοστώσεις/όρια που ήδη κρύβονται
 * πίσω από το AI suggestion). */
export async function getProgramExpenseCategories(programId: string): Promise<ExpenseCategoryOption[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programExpenseCategory.findMany({
    where: { programId },
    orderBy: { order: 'asc' },
    select: { id: true, name: true },
  })
  return rows
}

export type TrdrOption = { id: string; name: string; afm: string | null }

/** Ελαφριά αναζήτηση συναλλασσόμενων (μέχρι 20, μόνο ενεργές καρτέλες) για
 * το «Σύνδεση εταιρείας» dialog — δεν υπάρχει ήδη κάποιο γενικό Trdr search
 * action στο /partners (μόνο πλήρης λίστα σε server component), οπότε
 * προστίθεται εδώ, gated ίδια με τα υπόλοιπα programs actions. */
export async function listTrdrOptions(query?: string): Promise<TrdrOption[]> {
  await requirePermission('programs.manage')
  const q = (query ?? '').trim()
  const rows = await prisma.trdr.findMany({
    where: {
      ISACTIVE: 1,
      ...(q ? { OR: [{ NAME: { contains: q, mode: 'insensitive' } }, { AFM: { contains: q, mode: 'insensitive' } }] } : {}),
    },
    orderBy: { NAME: 'asc' },
    take: 20,
    select: { id: true, NAME: true, AFM: true },
  })
  return rows.map(r => ({ id: r.id, name: r.NAME, afm: r.AFM }))
}

/* ═══════════════════════════════════════════════════════════════════════
 * ProgramRequiredForm — «Έντυπα που χρειάζονται» tab: required supporting
 * documents/forms (extracted from the PDF or added manually), each
 * optionally LINKED by the user to a «Οδηγός Εντύπου» (TaxFormTemplate).
 * Extraction never sets templateId (see persist.ts) — linking is a
 * deliberate user action via updateRequiredForm.
 * ═══════════════════════════════════════════════════════════════════════ */

export type ProgramRequiredFormItem = {
  id: string
  name: string
  mandatory: boolean
  notes: string | null
  templateId: string | null
  templateName: string | null
}

export async function listProgramRequiredForms(programId: string): Promise<ProgramRequiredFormItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programRequiredForm.findMany({
    where: { programId },
    orderBy: { order: 'asc' },
    include: { template: { select: { name: true, code: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    mandatory: r.mandatory,
    notes: r.notes,
    templateId: r.templateId,
    templateName: r.template ? `${r.template.name} (${r.template.code})` : null,
  }))
}

export async function addRequiredForm(
  programId: string,
  input: { name: string; mandatory?: boolean; notes?: string | null },
): Promise<{ id: string }> {
  await requirePermission('programs.manage')
  const count = await prisma.programRequiredForm.count({ where: { programId } })
  const row = await prisma.programRequiredForm.create({
    data: {
      programId,
      name: input.name.trim(),
      mandatory: input.mandatory ?? true,
      notes: input.notes ?? null,
      order: count,
    },
  })
  revalidatePath(`/programs/${programId}`)
  return { id: row.id }
}

export async function updateRequiredForm(
  id: string,
  input: { name?: string; mandatory?: boolean; notes?: string | null; templateId?: string | null },
): Promise<void> {
  await requirePermission('programs.manage')
  const row = await prisma.programRequiredForm.update({
    where: { id },
    data: {
      ...(input.name !== undefined ? { name: input.name.trim() } : {}),
      ...(input.mandatory !== undefined ? { mandatory: input.mandatory } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
      ...(input.templateId !== undefined ? { templateId: input.templateId } : {}),
    },
  })
  revalidatePath(`/programs/${row.programId}`)
}

export async function removeRequiredForm(id: string): Promise<void> {
  await requirePermission('programs.manage')
  const row = await prisma.programRequiredForm.delete({ where: { id } })
  revalidatePath(`/programs/${row.programId}`)
}

export type TaxTemplateOption = { id: string; code: string; name: string; year: number | null }

/** id+code+name+year λίστα των «Οδηγών Εντύπων» — για το <select> σύνδεσης
 * στο ProgramRequiredForm (βλ. updateRequiredForm). */
export async function listTaxTemplateOptions(): Promise<TaxTemplateOption[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.taxFormTemplate.findMany({
    orderBy: [{ name: 'asc' }],
    select: { id: true, code: true, name: true, year: true },
  })
  return rows
}
