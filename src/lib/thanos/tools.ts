import { prisma } from '@/lib/prisma'
import type { ORTool } from '@/lib/openrouter'
import { computeSinglePair } from '@/lib/prospects/evaluate-pair'
import { buildCompanyProfile } from '@/lib/assessment/company-profile'
import { answerProgramQuestion, checkProposedExpense } from './knowledge'
import { can, type ThanosContext } from './context'
import { searchManual } from './manual'
import { operationTools, prepareOperation, type OperationPayload } from './operations'
import { STAGE_LABELS, STATUS_LABELS, type StageStr, type ObligationStatusStr } from '@/lib/pm/types'

/**
 * Εργαλεία του Thanos ανά ρόλο. Κάθε εργαλείο ελέγχει ΜΟΝΟ ΤΟΥ το scope (ο πελάτης βλέπει μόνο τα δικά του).
 * Τα «prepare_*» ΔΕΝ στέλνουν τίποτα — δημιουργούν ThanosAction (PENDING) που εμφανίζεται ως κάρτα
 * με προεπισκόπηση και κουμπί «Αποστολή» (βλ. actions.ts → executeThanosAction).
 */

export type ToolResult = Record<string, unknown>
export type ToolDef = { tool: ORTool; run: (ctx: ThanosContext, args: Record<string, unknown>) => Promise<ToolResult> }

/** Προεπισκόπηση ενέργειας (ίδιο σχήμα με το payload του ThanosAction). */
export type ActionPayload = {
  trdrId: string
  trdrName: string
  applicationId: string | null
  programId: string | null
  programTitle: string | null
  to: string
  toName: string | null
  subject: string
  message: string
  items: string[]
  expiresInDays: number
}

const OPEN_STATUSES = ['PENDING', 'IN_PROGRESS', 'REJECTED'] as const
const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown, max = 25) => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean).slice(0, max) : [])
const emailOk = (e: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)
const fn = (name: string, description: string, properties: Record<string, unknown> = {}, required: string[] = []): ORTool =>
  ({ type: 'function', function: { name, description, parameters: { type: 'object', properties, required } } })

async function pendingDocs(applicationId: string) {
  const obl = await prisma.applicationObligation.findMany({
    where: { applicationId, kind: 'FORM', status: { in: [...OPEN_STATUSES] } },
    orderBy: { order: 'asc' },
    select: { name: true, status: true, dueDate: true },
  })
  return obl.map(o => ({ name: o.name, status: o.status, dueDate: o.dueDate?.toISOString().slice(0, 10) ?? null }))
}

async function applicationSummary(applicationId: string) {
  const a = await prisma.programApplication.findUniqueOrThrow({
    where: { id: applicationId },
    select: { id: true, stage: true, lifecycle: true, trdrId: true, trdr: { select: { NAME: true } }, program: { select: { id: true, title: true, submissionEnd: true } } },
  })
  return {
    applicationId: a.id, trdrId: a.trdrId, customer: a.trdr.NAME, programId: a.program.id, program: a.program.title, stage: a.stage, lifecycle: a.lifecycle,
    submissionEnd: a.program.submissionEnd?.toISOString().slice(0, 10) ?? null, missingDocuments: await pendingDocs(a.id),
  }
}

async function createAction(ctx: ThanosContext, kind: 'DOC_REQUEST' | 'ACCOUNTANT_LINK', payload: ActionPayload): Promise<ToolResult> {
  const a = await prisma.thanosAction.create({ data: { userId: ctx.userId, mode: ctx.mode, kind, payload: payload as unknown as object }, select: { id: true } })
  return {
    status: 'PREPARED_NOT_SENT',
    actionId: a.id,
    note: 'Ετοιμάστηκε προεπισκόπηση — ΔΕΝ στάλθηκε. Ο χρήστης θα δει κάρτα με κουμπί «Αποστολή». Πες του να την ελέγξει.',
    preview: { to: payload.to, subject: payload.subject, items: payload.items },
  }
}

async function createOperation(ctx: ThanosContext, payload: OperationPayload): Promise<ToolResult> {
  const a = await prisma.thanosAction.create({ data: { userId: ctx.userId, mode: ctx.mode, kind: 'OPERATION', payload: payload as unknown as object }, select: { id: true } })
  return {
    status: 'PREPARED_NOT_EXECUTED',
    actionId: a.id,
    note: 'Ετοιμάστηκε κάρτα επιβεβαίωσης — ΔΕΝ εκτελέστηκε. Ο χρήστης πρέπει να πατήσει «Εκτέλεση».',
    preview: { title: payload.title, details: payload.details },
  }
}

// ── Κοινά ───────────────────────────────────────────────────────────────

const programQuestion: ToolDef = {
  tool: fn('program_question', 'Απάντηση σε ερώτηση για ΕΝΑ πρόγραμμα από τον επίσημο οδηγό του και τις συμπληρωματικές πηγές (επιλεξιμότητα, δαπάνες, προθεσμίες, δικαιολογητικά, βαθμολόγηση). Χρειάζεται programId (από list_open_programs / my_programs).',
    { programId: { type: 'string' }, question: { type: 'string' } }, ['programId', 'question']),
  async run(ctx, a) {
    const r = await answerProgramQuestion(str(a.programId), str(a.question), { audience: ctx.mode, userId: ctx.userId })
    return { answer: r.answer, basedOnGuide: r.usedGuide }
  },
}

const expenseCheck: ToolDef = {
  tool: fn('check_expense', 'Έλεγχος αν μια δαπάνη που θέλει να κάνει μια επιχείρηση είναι επιλέξιμη σε ένα πρόγραμμα (κατηγορία, όρια, προϋποθέσεις, παραπομπές στον οδηγό).',
    { programId: { type: 'string' }, description: { type: 'string', description: 'Τι θέλει να αγοράσει/πληρώσει' }, amount: { type: 'number', description: 'Ποσό σε € (αν είναι γνωστό)' } }, ['programId', 'description']),
  async run(ctx, a) {
    const r = await checkProposedExpense(str(a.programId), { description: str(a.description), amount: typeof a.amount === 'number' ? a.amount : null, companyNote: ctx.mode === 'CUSTOMER' ? ctx.companyName : null }, { userId: ctx.userId })
    return r as unknown as ToolResult
  },
}

const listOpenPrograms: ToolDef = {
  tool: fn('list_open_programs', 'Λίστα των ενεργών προγραμμάτων (programId, τίτλος, προθεσμία, επιδότηση). Για πελάτη δείχνει και αν η επιχείρησή του πληροί τα βασικά κριτήρια.'),
  async run(ctx) {
    const ps = await prisma.program.findMany({ where: { status: 'ACTIVE' }, orderBy: { submissionEnd: 'asc' }, select: { id: true, title: true, submissionEnd: true, fundingRate: true, summary: true } })
    const out = []
    for (const p of ps.slice(0, 20)) {
      const fit = ctx.mode === 'CUSTOMER' ? await computeSinglePair(ctx.trdrId, p.id).catch(() => null) : null
      out.push({
        programId: p.id, title: p.title, submissionEnd: p.submissionEnd?.toISOString().slice(0, 10) ?? null,
        fundingRate: p.fundingRate == null ? null : Number(p.fundingRate), summary: p.summary?.slice(0, 300) ?? null,
        ...(fit ? { basicCriteriaMet: fit.eligible, failed: fit.failed, unknown: fit.unknown } : {}),
      })
    }
    return { programs: out }
  },
}

// ── Πελάτης ─────────────────────────────────────────────────────────────

const myPrograms: ToolDef = {
  tool: fn('my_programs', 'Τα προγράμματα/έργα της επιχείρησης του πελάτη: στάδιο, κατάσταση και ποια δικαιολογητικά λείπουν.'),
  async run(ctx) {
    if (ctx.mode !== 'CUSTOMER') return { error: 'Μόνο για πελάτες.' }
    return { company: ctx.companyName, applications: await Promise.all(ctx.applicationIds.map(applicationSummary)) }
  },
}

const prepareAccountantLink: ToolDef = {
  tool: fn('prepare_accountant_link', 'Ετοιμάζει (ΔΕΝ στέλνει) email στον λογιστή του πελάτη με ασφαλή σύνδεσμο για να ανεβάσει δικαιολογητικά. Αν δεν δοθούν έγγραφα, παίρνει όσα λείπουν από το έργο. Ο πελάτης βλέπει προεπισκόπηση και πατά «Αποστολή».',
    {
      applicationId: { type: 'string' },
      accountantEmail: { type: 'string', description: 'Email λογιστή (αν λείπει: το email λογιστηρίου της καρτέλας)' },
      accountantName: { type: 'string' },
      documents: { type: 'array', items: { type: 'string' }, description: 'Ονόματα δικαιολογητικών (π.χ. «Ε3 2024»)' },
      message: { type: 'string', description: 'Σύντομο μήνυμα προς τον λογιστή' },
    }, ['applicationId']),
  async run(ctx, a) {
    if (ctx.mode !== 'CUSTOMER') return { error: 'Για χρήστες της εφαρμογής χρησιμοποίησε prepare_document_request.' }
    const applicationId = str(a.applicationId)
    if (!ctx.applicationIds.includes(applicationId)) return { error: 'Δεν έχετε πρόσβαση σε αυτό το έργο.' }
    const app = await applicationSummary(applicationId)
    const trdr = await prisma.trdr.findUnique({ where: { id: ctx.trdrId }, select: { EMAILACC: true } })
    const to = str(a.accountantEmail) || trdr?.EMAILACC?.trim() || ''
    if (!emailOk(to)) return { error: 'Χρειάζομαι το email του λογιστή (δεν υπάρχει καταχωρημένο).' }
    const items = list(a.documents).length ? list(a.documents) : app.missingDocuments.map(d => d.name)
    if (!items.length) return { error: 'Δεν υπάρχουν εκκρεμή δικαιολογητικά — πες ποια έγγραφα χρειάζονται.' }
    return createAction(ctx, 'ACCOUNTANT_LINK', {
      trdrId: ctx.trdrId, trdrName: ctx.companyName, applicationId, programId: app.programId, programTitle: app.program,
      to, toName: str(a.accountantName) || null,
      subject: `Δικαιολογητικά για «${app.program}» — ${ctx.companyName}`,
      message: str(a.message) || `Παρακαλώ ανεβάστε τα παρακάτω έγγραφα για το πρόγραμμα «${app.program}» μέσω του ασφαλούς συνδέσμου. Ευχαριστώ, ${ctx.name}.`,
      items, expiresInDays: 14,
    })
  },
}

// ── Χρήστες εφαρμογής ───────────────────────────────────────────────────

const findCustomer: ToolDef = {
  tool: fn('find_customer', 'Αναζήτηση πελάτη με επωνυμία ή ΑΦΜ → trdrId.', { query: { type: 'string' } }, ['query']),
  async run(ctx, a) {
    if (!can(ctx, 'customer.view')) return { error: 'Δεν έχεις δικαίωμα.' }
    const q = str(a.query)
    const rows = await prisma.trdr.findMany({
      where: { SODTYPE: 13, OR: [{ NAME: { contains: q, mode: 'insensitive' } }, { AFM: { contains: q.replace(/\D/g, '') || q } }] },
      take: 8, select: { id: true, NAME: true, AFM: true, CITY: true },
    })
    return { customers: rows.map(r => ({ trdrId: r.id, name: r.NAME, afm: r.AFM, city: r.CITY })) }
  },
}

const customerOverview: ToolDef = {
  tool: fn('customer_overview', 'Πλήρης εικόνα πελάτη: στοιχεία (ΚΑΔ, ΕΜΕ, τζίρος, ίδρυση), έργα με στάδιο, δικαιολογητικά που λείπουν, ληγμένα έγγραφα, κενά στοιχείων.', { trdrId: { type: 'string' } }, ['trdrId']),
  async run(ctx, a) {
    if (!can(ctx, 'customer.view')) return { error: 'Δεν έχεις δικαίωμα.' }
    const trdrId = str(a.trdrId)
    const [profile, apps] = await Promise.all([
      buildCompanyProfile(trdrId),
      prisma.programApplication.findMany({ where: { trdrId }, select: { id: true } }),
    ])
    return {
      company: { name: profile.name, afm: profile.afm, legalForm: profile.legalForm, region: profile.region, kads: profile.kads.slice(0, 6), headline: profile.headline, operationalYears: profile.operationalYears },
      dataGaps: profile.gaps,
      expiredDocuments: profile.documents.filter(d => !d.valid).map(d => ({ type: d.type, expiresAt: d.expiresAt })),
      applications: await Promise.all(apps.map(x => applicationSummary(x.id))),
    }
  },
}

const programGaps: ToolDef = {
  tool: fn('program_gaps', 'Ελλείψεις πελατών σε ένα πρόγραμμα: για κάθε έργο, ποια δικαιολογητικά λείπουν — ταξινομημένα από τα περισσότερα.', { programId: { type: 'string' } }, ['programId']),
  async run(ctx, a) {
    if (!can(ctx, 'customer.view')) return { error: 'Δεν έχεις δικαίωμα.' }
    const apps = await prisma.programApplication.findMany({ where: { programId: str(a.programId) }, select: { id: true } })
    const rows = await Promise.all(apps.map(x => applicationSummary(x.id)))
    return {
      applications: rows
        .map(r => ({ applicationId: r.applicationId, customer: r.customer, trdrId: r.trdrId, stage: r.stage, missing: r.missingDocuments.map(d => d.name) }))
        .sort((x, y) => y.missing.length - x.missing.length),
    }
  },
}

const prepareDocRequest: ToolDef = {
  tool: fn('prepare_document_request', 'Ετοιμάζει (ΔΕΝ στέλνει) email προς πελάτη με σύνδεσμο ανεβάσματος δικαιολογητικών για ένα έργο. Χωρίς λίστα εγγράφων → όσα λείπουν. Αποδέκτης: email που δίνεται, αλλιώς η κύρια επαφή/το email του πελάτη. Για πολλούς πελάτες, κάλεσέ το μία φορά ανά έργο.',
    {
      applicationId: { type: 'string' },
      email: { type: 'string', description: 'Email αποδέκτη (προαιρετικό)' },
      documents: { type: 'array', items: { type: 'string' } },
      message: { type: 'string' },
    }, ['applicationId']),
  async run(ctx, a) {
    if (!can(ctx, 'programs.manage')) return { error: 'Δεν έχεις δικαίωμα αποστολής αιτημάτων.' }
    const app = await applicationSummary(str(a.applicationId))
    const [contact, trdr] = await Promise.all([
      prisma.contact.findFirst({ where: { trdrId: app.trdrId, email: { not: null } }, orderBy: [{ isPrimary: 'desc' }], select: { name: true, email: true } }),
      prisma.trdr.findUnique({ where: { id: app.trdrId }, select: { EMAIL: true } }),
    ])
    const to = str(a.email) || contact?.email?.trim() || trdr?.EMAIL?.trim() || ''
    if (!emailOk(to)) return { error: `Ο πελάτης ${app.customer} δεν έχει email — δώσε το.` }
    const items = list(a.documents).length ? list(a.documents) : app.missingDocuments.map(d => d.name)
    if (!items.length) return { error: `Το έργο του ${app.customer} δεν έχει εκκρεμή δικαιολογητικά.` }
    return createAction(ctx, 'DOC_REQUEST', {
      trdrId: app.trdrId, trdrName: app.customer, applicationId: app.applicationId, programId: app.programId, programTitle: app.program,
      to, toName: !str(a.email) ? contact?.name ?? null : null,
      subject: `Δικαιολογητικά για «${app.program}»`,
      message: str(a.message) || `Για να προχωρήσει ο φάκελός σας στο πρόγραμμα «${app.program}», χρειαζόμαστε τα παρακάτω δικαιολογητικά. Μπορείτε να τα ανεβάσετε με ασφάλεια από τον σύνδεσμο.`,
      items, expiresInDays: 14,
    })
  },
}

const appHelp: ToolDef = {
  tool: fn('app_help', 'Αναζήτηση στον Οδηγό χρήσης της εφαρμογής WWA (πώς γίνεται κάτι, πού βρίσκεται, τι σημαίνει ένας όρος). Χρησιμοποίησέ το για ερωτήσεις «πώς…/πού…» για την εφαρμογή.',
    { question: { type: 'string' } }, ['question']),
  async run(_ctx, a) {
    const r = await searchManual(str(a.question))
    return r.sections.length ? { sections: r.sections } : { note: 'Δεν βρέθηκε σχετική ενότητα.', contents: r.toc }
  },
}

const applicationDetails: ToolDef = {
  tool: fn('application_details', 'Λεπτομέρειες ενός έργου: στάδιο, υπεύθυνος/εκτελεστές, ΟΛΑ τα δικαιολογητικά/εργασίες με κατάσταση και προθεσμία.', { applicationId: { type: 'string' } }, ['applicationId']),
  async run(ctx, a) {
    if (!can(ctx, 'customer.view') && !can(ctx, 'pm.work') && !can(ctx, 'pm.manage')) return { error: 'Δεν έχεις δικαίωμα.' }
    const app = await prisma.programApplication.findUnique({
      where: { id: str(a.applicationId) },
      select: {
        id: true, stage: true, trdr: { select: { NAME: true } }, programId: true, program: { select: { title: true } }, manager: { select: { name: true } },
        obligations: { orderBy: [{ stage: 'asc' }, { order: 'asc' }], select: { name: true, kind: true, stage: true, status: true, mandatory: true, dueDate: true } },
      },
    })
    if (!app) return { error: 'Το έργο δεν βρέθηκε.' }
    const assigned = await prisma.applicationAssignment.findMany({ where: { applicationId: app.id }, select: { userId: true } })
    const users = await prisma.user.findMany({ where: { id: { in: assigned.map(x => x.userId) } }, select: { name: true } })
    return {
      customer: app.trdr.NAME, program: app.program.title, stage: STAGE_LABELS[app.stage as StageStr], manager: app.manager?.name ?? null,
      employees: users.map(u => u.name), link: `/programs/${app.programId}/applications/${app.id}`,
      items: app.obligations.map(o => ({ name: o.name, kind: o.kind, stage: STAGE_LABELS[o.stage as StageStr], status: STATUS_LABELS[o.status as ObligationStatusStr], mandatory: o.mandatory, due: o.dueDate?.toISOString().slice(0, 10) ?? null })),
    }
  },
}

export function toolsFor(ctx: ThanosContext): ToolDef[] {
  if (ctx.mode === 'CUSTOMER') return [myPrograms, listOpenPrograms, programQuestion, expenseCheck, prepareAccountantLink]
  const ops: ToolDef[] = operationTools(ctx).map(({ tool, op }) => ({
    tool,
    async run(c, a) {
      const r = await prepareOperation(c, op.name, a)
      return 'error' in r ? { error: r.error } : createOperation(c, r)
    },
  }))
  return [appHelp, findCustomer, customerOverview, applicationDetails, programGaps, listOpenPrograms, programQuestion, expenseCheck, prepareDocRequest, ...ops]
}
