'use server'

import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { logActivity } from '@/lib/activity/log'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { extractApproval as extract, type ApprovalExpense, type ApprovalExtract } from '@/lib/pm/approval-extract'
import { STAGE_ORDER, type StageStr } from '@/lib/pm/types'
import { overlap, isoDay, numOrNull, originalStart, isAmendmentOf, buildAmendmentPlan, type AmendmentPlan, type ApprovalHistoryEntry } from '@/lib/pm/approval-amend'

/**
 * Εγκριτική απόφαση / «Αποτελέσματα Αξιολόγησης» (ΟΠΣΚΕ): ανάγνωση του PDF με AI → έλεγχος από τον χρήστη →
 * καταχώριση στο έργο: στοιχεία έγκρισης (κωδικός αίτησης, απόφαση/ΑΔΑ, διάρκεια, προϋπολογισμός), εγκεκριμένη
 * υποβολή, στάδιο υλοποίησης και — προαιρετικά — οι εγκεκριμένες δαπάνες ως δαπάνες του έργου με κατηγορία.
 * Για έργα που αναλαμβάνουμε μόνο για project management.
 */

export type { ApprovalExpense, ApprovalIndicator, ApprovalExtract } from '@/lib/pm/approval-extract'
export type { AmendmentPlan, AmendmentRow, AmendmentChange } from '@/lib/pm/approval-amend'

export type ApprovalReview = {
  storageKey: string
  fileName: string
  extract: ApprovalExtract
  /** Πρόταση κατηγορίας δαπάνης του προγράμματος ανά εγκεκριμένη δαπάνη (ίδια σειρά). */
  categoryIds: (string | null)[]
  categories: { id: string; name: string }[]
  existingExpenses: number
  /** ΑΦΜ εγγράφου ≠ ΑΦΜ πελάτη. */
  afmMismatch: boolean
  /** Προτεινόμενη λήξη υλοποίησης (απόφαση + διάρκεια). */
  endsAt: string | null
  /** Νεότερη απόφαση από την καταχωρισμένη → τροποποίηση: διαφορές δαπανών ανά γραμμή. */
  amendment: AmendmentPlan | null
  /** Το έγγραφο είναι ΠΑΛΑΙΟΤΕΡΟ από την καταχωρισμένη απόφαση (δεν πρέπει να την αντικαταστήσει). */
  olderThanCurrent: boolean
}



/** Ανάγνωση εγκριτικού για το «Προς καταχώριση» (χωρίς εγγραφή). */
export async function extractApprovalDoc(applicationId: string, file: { base64: string; mimeType: string }): Promise<ApprovalExtract> {
  const session = await requirePermission('programs.manage')
  return extract(file, { applicationId, userId: session.user.id })
}

/** Κατηγορία δαπάνης του προγράμματος για κάθε εγκεκριμένη δαπάνη: ταίριασμα ονομάτων → AI για όσα μένουν. */
async function mapCategories(expenses: ApprovalExpense[], cats: { id: string; name: string; notes: string | null }[]): Promise<(string | null)[]> {
  if (!cats.length) return expenses.map(() => null)
  const out = expenses.map(e => {
    let best: { id: string; s: number } | null = null
    for (const c of cats) {
      const s = Math.max(overlap(e.subcategory ?? '', c.name), overlap(e.title, c.name) * 0.9, overlap(e.category ?? '', c.name) * 0.7)
      if (s >= 0.6 && (!best || s > best.s)) best = { id: c.id, s }
    }
    return best?.id ?? null
  })
  const todo = out.map((v, i) => (v ? -1 : i)).filter(i => i >= 0)
  if (!todo.length) return out
  try {
    const { deepseekChat } = await import('@/lib/deepseek')
    const text = await deepseekChat([
      { role: 'system', content: `Αντιστοίχισε κάθε εγκεκριμένη δαπάνη ΕΣΠΑ σε μία κατηγορία δαπάνης του προγράμματος (id) ή null.\nΚατηγορίες:\n${cats.map(c => `- id=${c.id}: ${c.name}${c.notes ? ` — ${c.notes.slice(0, 120)}` : ''}`).join('\n')}\nΑπάντησε ΑΥΣΤΗΡΑ JSON: {"map":[{"i":αριθμός,"categoryId":"id ή null"}]}` },
      { role: 'user', content: todo.map(i => `${i}. ${[expenses[i].category, expenses[i].subcategory, expenses[i].title].filter(Boolean).join(' › ')}`).join('\n') },
    ], { model: 'deepseek-chat', maxTokens: 600, scope: 'OTHER', refType: 'approval-categories' })
    const p = (parseJsonLoose(text) ?? {}) as { map?: { i?: unknown; categoryId?: unknown }[] }
    const valid = new Set(cats.map(c => c.id))
    for (const m of p.map ?? []) {
      const i = Number(m.i)
      if (todo.includes(i) && typeof m.categoryId === 'string' && valid.has(m.categoryId)) out[i] = m.categoryId
    }
  } catch { /* χωρίς AI: μένουν χωρίς κατηγορία για επιλογή από τον χρήστη */ }
  return out
}

function addMonths(iso: string, months: number): string {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + months)
  return d.toISOString().slice(0, 10)
}

/** Πρόταση για έλεγχο: κατηγορίες, υπάρχουσες δαπάνες, έλεγχος ΑΦΜ, λήξη υλοποίησης. */
export async function prepareApprovalReview(applicationId: string, input: { storageKey: string; fileName: string; extract: ApprovalExtract }): Promise<ApprovalReview> {
  await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: { trdr: { select: { AFM: true } }, program: { select: { expenseCats: { orderBy: { order: 'asc' }, select: { id: true, name: true, notes: true } } } }, _count: { select: { expenses: { where: { status: 'ACTIVE' } } } } },
  })
  const cats = app.program.expenseCats
  const x = input.extract
  const categoryIds = await mapCategories(x.expenses, cats)
  const current = await prisma.applicationApproval.findUnique({ where: { applicationId } })
  const rel = isAmendmentOf(x, current)
  const amendment = rel === 'newer' && current ? await buildAmendmentPlan(applicationId, x, categoryIds, current) : null
  const start = amendment && current ? originalStart(current) : x.decisionDate
  return {
    ...input,
    categoryIds,
    categories: cats.map(c => ({ id: c.id, name: c.name })),
    existingExpenses: app._count.expenses,
    afmMismatch: !!x.beneficiaryAfm && !!app.trdr.AFM && x.beneficiaryAfm !== app.trdr.AFM.replace(/\D/g, ''),
    endsAt: start && x.durationMonths ? addMonths(start, x.durationMonths) : null,
    amendment,
    olderThanCurrent: rel === 'older',
  }
}

/** Ανέβασμα + ανάγνωση εγκριτικού από το έργο (χωρίς καταχώριση — ακολουθεί έλεγχος). */
export async function readApprovalDoc(applicationId: string, file: { name: string; base64: string; mimeType: string }): Promise<{ ok: true; review: ApprovalReview } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  if (file.mimeType !== 'application/pdf' && !file.mimeType.startsWith('image/')) return { ok: false, message: 'Ανεβάστε το εγκριτικό σε PDF.' }
  try {
    const body = Buffer.from(file.base64, 'base64')
    const storageKey = `approvals/${applicationId}/${crypto.randomUUID()}.${file.mimeType === 'application/pdf' ? 'pdf' : 'jpg'}`
    await bunnyUploadPrivate({ key: storageKey, body, contentType: file.mimeType })
    const x = await extract(file, { applicationId, userId: session.user.id })
    if (!x.applicationCode && !x.decisionRef && !x.expenses.length) return { ok: false, message: 'Δεν βρέθηκαν στοιχεία έγκρισης στο αρχείο — είναι το σωστό έγγραφο;' }
    return { ok: true, review: await prepareApprovalReview(applicationId, { storageKey, fileName: file.name, extract: x }) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ανάγνωση απέτυχε.' }
  }
}

export type ApplyApprovalInput = {
  storageKey: string
  fileName: string
  extract: ApprovalExtract
  endsAt: string | null
  /** Εγκεκριμένες δαπάνες → δαπάνες του έργου (μόνο οι επιλεγμένες, με την κατηγορία τους). */
  expenses: { index: number; categoryId: string | null }[]
  inboxId?: string | null
  /** Καταχώριση ως τροποποίηση της ήδη καταχωρισμένης απόφασης (ο server ξαναϋπολογίζει τις διαφορές). */
  amendment?: boolean
}

export type ApplyApprovalResult =
  | { ok: true; createdExpenses: number; stage: StageStr; updatedExpenses?: number; removedExpenses?: number; keptBlocked?: number }
  | { ok: false; message: string }

/** Καταχώριση εγκριτικού στο έργο. */
export async function applyApproval(applicationId: string, input: ApplyApprovalInput): Promise<ApplyApprovalResult> {
  const session = await requirePermission('programs.manage')
  if (input.amendment) return applyAmendment(applicationId, input, session.user.id)
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { stage: true, onboardedAt: true, programId: true, trdrId: true } })
  if (!app) return { ok: false, message: 'Το έργο δεν βρέθηκε.' }
  const x = input.extract
  const d = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)
  const decisionDate = d(x.decisionDate) ?? new Date()
  const data = {
    applicationCode: x.applicationCode, beneficiaryCode: x.beneficiaryCode, submittedAt: d(x.submittedAt), decisionRef: x.decisionRef, ada: x.ada,
    decisionDate: d(x.decisionDate), resultStatus: x.resultStatus, projectTitle: x.projectTitle, durationMonths: x.durationMonths, endsAt: d(input.endsAt),
    regionCategory: x.regionCategory, score: x.score, totalBudget: x.totalBudget, publicAmount: x.publicAmount, privateAmount: x.privateAmount, aidPct: x.aidPct,
    expenses: x.expenses as unknown as Prisma.InputJsonValue, indicators: x.indicators as unknown as Prisma.InputJsonValue,
    extra: { beneficiaryAfm: x.beneficiaryAfm, beneficiaryName: x.beneficiaryName } as Prisma.InputJsonValue,
    docKey: input.storageKey, docName: input.fileName,
  }
  await prisma.applicationApproval.upsert({ where: { applicationId }, create: { applicationId, createdById: session.user.id, ...data }, update: data })

  // Εγκεκριμένη υποβολή (ίδια λογική με το «Έργο σε εξέλιξη»).
  const note = ['Εγκριτική απόφαση', x.decisionRef, x.ada ? `ΑΔΑ ${x.ada}` : null, x.publicAmount != null ? `δημόσια δαπάνη ${x.publicAmount.toLocaleString('el-GR', { minimumFractionDigits: 2 })} €` : null].filter(Boolean).join(' · ')
  const approved = await prisma.proposalSubmission.findFirst({ where: { applicationId, status: 'APPROVED' }, orderBy: { version: 'desc' }, select: { id: true } })
  if (approved) {
    await prisma.proposalSubmission.update({ where: { id: approved.id }, data: { opskeRef: x.applicationCode ?? undefined, totalAmount: x.totalBudget ?? undefined, decidedAt: decisionDate, note } })
  } else {
    const last = await prisma.proposalSubmission.findFirst({ where: { applicationId }, orderBy: { version: 'desc' }, select: { version: true } })
    await prisma.proposalSubmission.create({
      data: {
        applicationId, version: (last?.version ?? 0) + 1, status: 'APPROVED', opskeRef: x.applicationCode, totalAmount: x.totalBudget,
        submittedAt: d(x.submittedAt) ?? decisionDate, decidedAt: decisionDate, decidedById: session.user.id, createdById: session.user.id, note,
      },
    })
  }

  // Εγκεκριμένες δαπάνες → δαπάνες έργου.
  const { createExpense } = await import('@/lib/programs/actions')
  let createdExpenses = 0
  for (const sel of input.expenses) {
    const e = x.expenses[sel.index]
    if (!e) continue
    const { id } = await createExpense(applicationId, {
      description: (e.title || e.subcategory || 'Δαπάνη').slice(0, 480),
      lines: [{ product: e.title.slice(0, 300), description: e.description && e.description !== e.title ? e.description.slice(0, 1000) : null, quantity: e.quantity, unit: e.unit, unitPrice: e.unitPrice, vatPct: e.vat != null && e.net ? Math.round((e.vat / e.net) * 100) : null, lineTotal: e.net }],
      amount: e.net, vatAmount: e.vat, date: x.decisionDate, categoryId: sel.categoryId,
    })
    await prisma.programExpense.update({ where: { id }, data: { confirmed: true } })
    createdExpenses++
  }

  const { waivePreApprovalSteps } = await import('@/lib/pm/onboard-core')
  await waivePreApprovalSteps(applicationId)
  // Στάδιο: μόνο προς τα εμπρός — υλοποίηση (η έγκριση έχει ήδη δοθεί· τυχόν εκκρεμή δικαιολογητικά δεν μπλοκάρουν).
  const target: StageStr = 'INSPECTION'
  const stage = STAGE_ORDER.indexOf(target) > STAGE_ORDER.indexOf(app.stage as StageStr) ? target : (app.stage as StageStr)
  await prisma.programApplication.update({
    where: { id: applicationId },
    data: {
      stage, lifecycle: 'IMPLEMENTATION', assessmentVerdict: 'ELIGIBLE', onboardedAt: app.onboardedAt ?? decisionDate,
      opskeRef: x.applicationCode ?? undefined, opskeStatus: 'Εγκρίθηκε', opskeSubmittedAt: d(x.submittedAt) ?? undefined,
    },
  })
  // Το ίδιο το έγγραφο στα έγγραφα του έργου.
  await prisma.applicationDocument.create({ data: { applicationId, name: `Εγκριτική απόφαση${x.decisionRef ? ` — ${x.decisionRef}` : ''}`.slice(0, 250), storageKey: input.storageKey, mimeType: 'application/pdf', uploadedById: session.user.id } })
  if (input.inboxId) {
    await prisma.applicationInboxDoc.updateMany({ where: { id: input.inboxId, status: 'PENDING' }, data: { status: 'DONE', processedAt: new Date(), resultNote: `Καταχωρίστηκε εγκριτική (${createdExpenses} δαπάνες)` } })
  }
  await logActivity('application.approval', { entityType: 'application', entityId: applicationId, userId: session.user.id, meta: { decisionRef: x.decisionRef, createdExpenses } })
  revalidatePath(`/programs/${app.programId}/applications/${applicationId}`)
  revalidatePath(`/partners/${app.trdrId}`)
  return { ok: true, createdExpenses, stage }
}

/**
 * Τροποποίηση εγκεκριμένου έργου (νεότερη απόφαση): τα οικονομικά/διάρκεια παίρνουν τις νέες τιμές, η προηγούμενη απόφαση
 * μπαίνει στο ιστορικό, οι δαπάνες ευθυγραμμίζονται — αλλαγή ποσού στις ίδιες, νέες όσες προστίθενται, «καταργημένες»
 * (REPLACED, όχι διαγραφή) όσες φεύγουν· όσες έχουν ήδη αγορά/πιστοποίηση/αποπληρωμή ΔΕΝ αγγίζονται.
 */
async function applyAmendment(applicationId: string, input: ApplyApprovalInput, userId: string): Promise<ApplyApprovalResult> {
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { stage: true, programId: true, trdrId: true } })
  const current = await prisma.applicationApproval.findUnique({ where: { applicationId } })
  if (!app || !current) return { ok: false, message: 'Δεν υπάρχει καταχωρισμένη εγκριτική για τροποποίηση.' }
  const x = input.extract
  if (isAmendmentOf(x, current) !== 'newer') return { ok: false, message: 'Το έγγραφο δεν είναι νεότερη απόφαση από την καταχωρισμένη.' }
  const catOf = new Map(input.expenses.map(e => [e.index, e.categoryId]))
  const plan = await buildAmendmentPlan(applicationId, x, x.expenses.map((_, i) => catOf.get(i) ?? null), current)
  const d = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)

  // Ιστορικό: η απόφαση που αντικαθίσταται.
  const extra = (current.extra ?? {}) as { history?: ApprovalHistoryEntry[] } & Record<string, unknown>
  const history: ApprovalHistoryEntry[] = [...(extra.history ?? []), {
    decisionRef: current.decisionRef, decisionDate: isoDay(current.decisionDate), ada: current.ada, totalBudget: numOrNull(current.totalBudget),
    publicAmount: numOrNull(current.publicAmount), aidPct: current.aidPct, durationMonths: current.durationMonths, endsAt: isoDay(current.endsAt),
    docKey: current.docKey, docName: current.docName, expenses: current.expenses,
  }]
  await prisma.applicationApproval.update({
    where: { applicationId },
    data: {
      decisionRef: x.decisionRef ?? current.decisionRef, decisionDate: d(x.decisionDate) ?? current.decisionDate, ada: x.ada ?? null,
      resultStatus: x.resultStatus ?? current.resultStatus, durationMonths: x.durationMonths ?? current.durationMonths, endsAt: d(input.endsAt) ?? current.endsAt,
      totalBudget: x.totalBudget ?? undefined, publicAmount: x.publicAmount ?? undefined, privateAmount: x.privateAmount ?? undefined, aidPct: x.aidPct ?? current.aidPct,
      expenses: x.expenses as unknown as Prisma.InputJsonValue,
      indicators: x.indicators?.length ? (x.indicators as unknown as Prisma.InputJsonValue) : undefined,
      docKey: input.storageKey, docName: input.fileName,
      extra: { ...extra, history } as unknown as Prisma.InputJsonValue,
    },
  })

  let updatedExpenses = 0, createdExpenses = 0, removedExpenses = 0, keptBlocked = 0
  const { createExpense } = await import('@/lib/programs/actions')
  for (const r of plan.rows) {
    if (r.change === 'changed' && r.expenseId && r.index != null) {
      const e = x.expenses[r.index]
      await prisma.programExpense.update({ where: { id: r.expenseId }, data: { amount: e.net, vatAmount: e.vat } })
      const lines = await prisma.programExpenseLine.findMany({ where: { expenseId: r.expenseId }, select: { id: true } })
      if (lines.length === 1) await prisma.programExpenseLine.update({ where: { id: lines[0].id }, data: { unitPrice: e.unitPrice, quantity: e.quantity, lineTotal: e.net, vatPct: e.vat != null && e.net ? Math.round((e.vat / e.net) * 100) : null } })
      updatedExpenses++
    } else if (r.change === 'new' && r.index != null) {
      const e = x.expenses[r.index]
      const { id } = await createExpense(applicationId, {
        description: (e.title || e.subcategory || 'Δαπάνη').slice(0, 480),
        lines: [{ product: e.title.slice(0, 300), description: e.description && e.description !== e.title ? e.description.slice(0, 1000) : null, quantity: e.quantity, unit: e.unit, unitPrice: e.unitPrice, vatPct: e.vat != null && e.net ? Math.round((e.vat / e.net) * 100) : null, lineTotal: e.net }],
        amount: e.net, vatAmount: e.vat, date: x.decisionDate, categoryId: catOf.get(r.index) ?? null,
      })
      await prisma.programExpense.update({ where: { id }, data: { confirmed: true } })
      createdExpenses++
    } else if (r.change === 'removed' && r.expenseId) {
      if (r.blocked) { keptBlocked++; continue }
      await prisma.programExpense.update({ where: { id: r.expenseId }, data: { status: 'REPLACED' } })
      removedExpenses++
    }
  }

  const note = ['Τροποποίηση', x.decisionRef, x.publicAmount != null ? `δημόσια δαπάνη ${x.publicAmount.toLocaleString('el-GR', { minimumFractionDigits: 2 })} €` : null].filter(Boolean).join(' · ')
  const approved = await prisma.proposalSubmission.findFirst({ where: { applicationId, status: 'APPROVED' }, orderBy: { version: 'desc' }, select: { id: true } })
  if (approved) await prisma.proposalSubmission.update({ where: { id: approved.id }, data: { totalAmount: x.totalBudget ?? undefined, note } })
  await prisma.applicationDocument.create({ data: { applicationId, name: `Τροποποίηση έγκρισης${x.decisionRef ? ` — ${x.decisionRef}` : ''}`.slice(0, 250), storageKey: input.storageKey, mimeType: 'application/pdf', uploadedById: userId } })
  if (input.inboxId) {
    await prisma.applicationInboxDoc.updateMany({ where: { id: input.inboxId, status: 'PENDING' }, data: { status: 'DONE', processedAt: new Date(), resultNote: `Καταχωρίστηκε τροποποίηση (${updatedExpenses} αλλαγές, ${createdExpenses} νέες, ${removedExpenses} καταργήθηκαν)` } })
  }
  await logActivity('application.approval', { entityType: 'application', entityId: applicationId, userId, meta: { decisionRef: x.decisionRef, amendment: true, updatedExpenses, createdExpenses, removedExpenses, keptBlocked } })
  revalidatePath(`/programs/${app.programId}/applications/${applicationId}`)
  revalidatePath(`/partners/${app.trdrId}`)
  return { ok: true, createdExpenses, updatedExpenses, removedExpenses, keptBlocked, stage: app.stage as StageStr }
}

export type ApprovalSummary = {
  applicationCode: string | null
  decisionRef: string | null
  ada: string | null
  decisionDate: string | null
  endsAt: string | null
  durationMonths: number | null
  totalBudget: number | null
  publicAmount: number | null
  aidPct: number | null
  expenses: number
  docUrl: string | null
  /** Προηγούμενες αποφάσεις (η αρχική εγκριτική κ.λπ.) όταν η τρέχουσα είναι τροποποίηση. */
  history: { decisionRef: string | null; decisionDate: string | null }[]
}

export async function getApproval(applicationId: string): Promise<ApprovalSummary | null> {
  await requirePermission('programs.manage')
  const a = await prisma.applicationApproval.findUnique({ where: { applicationId } })
  if (!a) return null
  return {
    applicationCode: a.applicationCode, decisionRef: a.decisionRef, ada: a.ada,
    decisionDate: a.decisionDate?.toISOString() ?? null, endsAt: a.endsAt?.toISOString() ?? null, durationMonths: a.durationMonths,
    totalBudget: a.totalBudget != null ? Number(a.totalBudget) : null, publicAmount: a.publicAmount != null ? Number(a.publicAmount) : null, aidPct: a.aidPct,
    expenses: Array.isArray(a.expenses) ? a.expenses.length : 0,
    docUrl: a.docKey ? `/approval-doc/${applicationId}` : null,
    history: (((a.extra as { history?: ApprovalHistoryEntry[] } | null)?.history) ?? []).map(h => ({ decisionRef: h.decisionRef, decisionDate: h.decisionDate })),
  }
}
