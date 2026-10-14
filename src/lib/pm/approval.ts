'use server'

import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { logActivity } from '@/lib/activity/log'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { STAGE_ORDER, type StageStr } from '@/lib/pm/types'

/**
 * Εγκριτική απόφαση / «Αποτελέσματα Αξιολόγησης» (ΟΠΣΚΕ): ανάγνωση του PDF με AI → έλεγχος από τον χρήστη →
 * καταχώριση στο έργο: στοιχεία έγκρισης (κωδικός αίτησης, απόφαση/ΑΔΑ, διάρκεια, προϋπολογισμός), εγκεκριμένη
 * υποβολή, στάδιο υλοποίησης και — προαιρετικά — οι εγκεκριμένες δαπάνες ως δαπάνες του έργου με κατηγορία.
 * Για έργα που αναλαμβάνουμε μόνο για project management.
 */

export type ApprovalExpense = {
  categoryCode: string | null
  category: string | null
  subcategoryCode: string | null
  subcategory: string | null
  title: string
  description: string | null
  quantity: number | null
  unit: string | null
  unitPrice: number | null
  net: number
  vat: number | null
  gross: number | null
  eligible: number | null
  publicAmount: number | null
  aidPct: number | null
}
export type ApprovalIndicator = { code: string; description: string; value: string }
export type ApprovalExtract = {
  applicationCode: string | null
  beneficiaryCode: string | null
  beneficiaryAfm: string | null
  beneficiaryName: string | null
  submittedAt: string | null
  decisionRef: string | null
  ada: string | null
  decisionDate: string | null
  resultStatus: string | null
  projectTitle: string | null
  durationMonths: number | null
  regionCategory: string | null
  score: number | null
  totalBudget: number | null
  publicAmount: number | null
  privateAmount: number | null
  aidPct: number | null
  expenses: ApprovalExpense[]
  indicators: ApprovalIndicator[]
}
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
}

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[€%\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown): string | null => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)
/** «21/02/2024» ή «2024-02-21» → «2024-02-21». */
const isoDate = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})/.exec(s)
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : null
}

async function extract(file: { base64: string; mimeType: string }, ref: { applicationId: string; userId: string }): Promise<ApprovalExtract> {
  const { geminiGenerate } = await import('@/lib/gemini')
  const system = [
    'Διαβάζεις ελληνικό έγγραφο ΕΓΚΡΙΣΗΣ επενδυτικού σχεδίου ΕΣΠΑ («Αποτελέσματα Αξιολόγησης» ΟΠΣΚΕ / εγκριτική απόφαση ένταξης).',
    'Εξήγαγε ΜΟΝΟ ό,τι αναγράφεται (αλλιώς null):',
    'applicationCode = «Κωδικός Αίτησης Χρηματοδότησης» (π.χ. ΑΝΤ05ΠΠΕ-0010621)· beneficiaryCode = «Κωδικός Δικαιούχου»· beneficiaryAfm/beneficiaryName = ΑΦΜ/επωνυμία δικαιούχου·',
    'submittedAt = ημ. υποβολής αίτησης· decisionRef = «Εγκριτική Απόφαση» χωρίς το ΑΔΑ (π.χ. «Α.Π.: 818/21.02.2024»)· ada = ΑΔΑ· decisionDate = ημ. εγκριτικής απόφασης· resultStatus = κατάσταση αποτελέσματος (π.χ. «Έγκριση - Χρηματοδότηση»)·',
    'projectTitle = τίτλος πράξης· durationMonths = χρονοδιάγραμμα υλοποίησης σε μήνες· regionCategory = κωδικός κατηγορίας περιφέρειας· score = συνολική βαθμολογία κριτηρίων·',
    'totalBudget = συνολικός επιλέξιμος/επιχορηγούμενος προϋπολογισμός· publicAmount = δημόσια δαπάνη (επιχορήγηση)· privateAmount = ιδιωτική συμμετοχή· aidPct = ποσοστό ενίσχυσης %.',
    'expenses = ΚΑΘΕ γραμμή του «Αναλυτικού Πίνακα Δαπανών»: categoryCode, category, subcategoryCode, subcategory, title (Τίτλος Δαπάνης), description (Περιγραφή), quantity, unit, unitPrice, net (σύνολο χωρίς ΦΠΑ), vat, gross, eligible (επιλέξιμη), publicAmount (δημόσια δαπάνη), aidPct.',
    'indicators = οι «Δείκτες»: code, description, value (κείμενο).',
    'Ημερομηνίες YYYY-MM-DD, ποσά αριθμοί με τελεία δεκαδικών. ΑΥΣΤΗΡΑ JSON με αυτά τα κλειδιά.',
  ].join(' ')
  const res = await geminiGenerate({
    parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: 'Εξήγαγε τα στοιχεία έγκρισης.' }],
    systemInstruction: system, json: true, scope: 'OCR_VISION', refType: 'approval-read', refId: ref.applicationId, userId: ref.userId,
  })
  const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
  const expenses: ApprovalExpense[] = (Array.isArray(p.expenses) ? (p.expenses as Record<string, unknown>[]) : []).map(e => ({
    categoryCode: str(e.categoryCode), category: str(e.category), subcategoryCode: str(e.subcategoryCode), subcategory: str(e.subcategory),
    title: str(e.title) ?? str(e.subcategory) ?? str(e.description) ?? 'Δαπάνη',
    description: str(e.description), quantity: num(e.quantity), unit: str(e.unit), unitPrice: num(e.unitPrice),
    net: num(e.net) ?? num(e.eligible) ?? 0, vat: num(e.vat), gross: num(e.gross), eligible: num(e.eligible), publicAmount: num(e.publicAmount), aidPct: num(e.aidPct),
  })).filter(e => e.net > 0)
  const indicators: ApprovalIndicator[] = (Array.isArray(p.indicators) ? (p.indicators as Record<string, unknown>[]) : [])
    .map(i => ({ code: str(i.code) ?? '', description: str(i.description) ?? '', value: String(i.value ?? '').trim() }))
    .filter(i => i.code || i.description)
  const dur = num(p.durationMonths)
  return {
    applicationCode: str(p.applicationCode), beneficiaryCode: str(p.beneficiaryCode),
    beneficiaryAfm: str(p.beneficiaryAfm)?.replace(/\D/g, '').slice(0, 9) || null, beneficiaryName: str(p.beneficiaryName),
    submittedAt: isoDate(p.submittedAt), decisionRef: str(p.decisionRef), ada: str(p.ada), decisionDate: isoDate(p.decisionDate),
    resultStatus: str(p.resultStatus), projectTitle: str(p.projectTitle), durationMonths: dur != null ? Math.round(dur) : null,
    regionCategory: str(p.regionCategory), score: num(p.score),
    totalBudget: num(p.totalBudget) ?? (expenses.length ? Math.round(expenses.reduce((a, e) => a + (e.eligible ?? e.net), 0) * 100) / 100 : null),
    publicAmount: num(p.publicAmount), privateAmount: num(p.privateAmount), aidPct: num(p.aidPct),
    expenses, indicators,
  }
}

/** Ανάγνωση εγκριτικού για το «Προς καταχώριση» (χωρίς εγγραφή). */
export async function extractApprovalDoc(applicationId: string, file: { base64: string; mimeType: string }): Promise<ApprovalExtract> {
  const session = await requirePermission('programs.manage')
  return extract(file, { applicationId, userId: session.user.id })
}

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()
}
function overlap(a: string, b: string): number {
  const A = new Set(fold(a).split(' ').filter(w => w.length > 3))
  const B = new Set(fold(b).split(' ').filter(w => w.length > 3))
  if (!A.size || !B.size) return 0
  let hit = 0
  for (const w of A) if (B.has(w)) hit++
  return hit / Math.min(A.size, B.size)
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
  return {
    ...input,
    categoryIds: await mapCategories(x.expenses, cats),
    categories: cats.map(c => ({ id: c.id, name: c.name })),
    existingExpenses: app._count.expenses,
    afmMismatch: !!x.beneficiaryAfm && !!app.trdr.AFM && x.beneficiaryAfm !== app.trdr.AFM.replace(/\D/g, ''),
    endsAt: x.decisionDate && x.durationMonths ? addMonths(x.decisionDate, x.durationMonths) : null,
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
}

/** Καταχώριση εγκριτικού στο έργο. */
export async function applyApproval(applicationId: string, input: ApplyApprovalInput): Promise<{ ok: true; createdExpenses: number; stage: StageStr } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
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
  }
}
