import { prisma } from '@/lib/prisma'
import type { ORTool } from '@/lib/openrouter'
import { STAGE_LABELS, STAGE_ORDER, STATUS_LABELS, LIFECYCLE_LABELS, LIFECYCLE_ORDER, type StageStr, type LifecycleStr, type ObligationStatusStr } from '@/lib/pm/types'
import { setApplicationStage, addObligation, updateObligation } from '@/lib/pm/actions'
import { setApplicationLifecycle } from '@/lib/pm/program-link'
import { assignApplication } from '@/lib/assignments/actions'
import { saveProgramLeads } from '@/lib/prospects/actions'
import { logLeadCommunication, setLeadStatus } from '@/lib/leads/actions'
import { can, type ThanosContext } from './context'

/**
 * (Plain module.) Ενέργειες που κάνει ο Thanos ΓΙΑ ΛΟΓΑΡΙΑΣΜΟ ενός χρήστη της εφαρμογής — ΠΑΝΤΑ με επιβεβαίωση.
 *  • prepare(): μόνο ανάγνωση — λύνει ονόματα σε IDs, ελέγχει δικαίωμα και φτιάχνει περίληψη για την κάρτα.
 *  • execute(): καλεί το ΥΠΑΡΧΟΝ server action της εφαρμογής (με τους δικούς του ελέγχους δικαιωμάτων/πύλες),
 *    μέσα στο request του χρήστη — άρα ό,τι δεν μπορεί να κάνει ο ίδιος, δεν το κάνει ούτε ο Thanos.
 */

export type OperationPayload = { op: string; title: string; details: string[]; args: Record<string, unknown> }
type Prepared = OperationPayload | { error: string }
type OpDef = {
  name: string
  description: string
  properties: Record<string, unknown>
  required: string[]
  /** Αρκεί ΕΝΑ από αυτά (ίδιοι κανόνες με το server action που καλείται). */
  permission: string[]
  prepare: (ctx: ThanosContext, a: Record<string, unknown>) => Promise<Prepared>
  execute: (args: Record<string, unknown>) => Promise<string>
}

const str = (v: unknown) => (typeof v === 'string' ? v.trim() : '')
const list = (v: unknown) => (Array.isArray(v) ? v.map(x => String(x).trim()).filter(Boolean) : [])
const ilike = (q: string) => ({ contains: q, mode: 'insensitive' as const })

async function appHead(applicationId: string) {
  const [app, assignments] = await Promise.all([
    prisma.programApplication.findUnique({
      where: { id: applicationId },
      select: { id: true, stage: true, lifecycle: true, managerId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } },
    }),
    prisma.applicationAssignment.findMany({ where: { applicationId }, select: { userId: true } }),
  ])
  return app ? { ...app, assignments } : null
}
const appLabel = (a: { trdr: { NAME: string }; program: { title: string } }) => `${a.trdr.NAME} — ${a.program.title}`

async function findStaff(name: string) {
  return prisma.user.findMany({
    where: { active: true, role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'SALESMAN'] } }, OR: [{ name: ilike(name) }, { email: ilike(name) }] },
    select: { id: true, name: true }, take: 3,
  })
}

const OPS: OpDef[] = [
  {
    name: 'set_application_stage',
    description: 'Αλλαγή σταδίου έργου (Αξιολόγηση→Δικαιολογητικά→Δαπάνες & Παραδοτέα→Υποβολή ΟΠΣΚΕ→Δελτία ελέγχου→Παρακολούθηση). Οι πύλες της εφαρμογής ισχύουν κανονικά.',
    properties: { applicationId: { type: 'string' }, stage: { type: 'string', enum: STAGE_ORDER } },
    required: ['applicationId', 'stage'], permission: ['pm.work', 'pm.manage'],
    async prepare(_ctx, a) {
      const app = await appHead(str(a.applicationId))
      const stage = str(a.stage) as StageStr
      if (!app) return { error: 'Το έργο δεν βρέθηκε.' }
      if (!STAGE_ORDER.includes(stage)) return { error: 'Άγνωστο στάδιο.' }
      if (app.stage === stage) return { error: `Το έργο είναι ήδη στο στάδιο «${STAGE_LABELS[stage]}».` }
      return { op: this.name, title: 'Αλλαγή σταδίου έργου', details: [appLabel(app), `${STAGE_LABELS[app.stage as StageStr]} → ${STAGE_LABELS[stage]}`], args: { applicationId: app.id, stage } }
    },
    async execute(a) {
      const r = await setApplicationStage(str(a.applicationId), str(a.stage) as StageStr)
      if (!r.ok) throw new Error(r.message ?? 'Η αλλαγή σταδίου μπλοκαρίστηκε.')
      return 'Το στάδιο άλλαξε.'
    },
  },
  {
    name: 'set_application_lifecycle',
    description: 'Αλλαγή κύκλου ζωής συμμετοχής πελάτη (Δυνητικός / Υποβαλλόμενος / Υλοποίηση / Τροποποιήσεις / Αποπληρωμή).',
    properties: { applicationId: { type: 'string' }, lifecycle: { type: 'string', enum: LIFECYCLE_ORDER } },
    required: ['applicationId', 'lifecycle'], permission: ['programs.manage'],
    async prepare(_ctx, a) {
      const app = await appHead(str(a.applicationId))
      const lc = str(a.lifecycle) as LifecycleStr
      if (!app) return { error: 'Το έργο δεν βρέθηκε.' }
      if (!LIFECYCLE_ORDER.includes(lc)) return { error: 'Άγνωστη κατάσταση.' }
      return { op: this.name, title: 'Αλλαγή κύκλου ζωής', details: [appLabel(app), `${LIFECYCLE_LABELS[app.lifecycle as LifecycleStr]} → ${LIFECYCLE_LABELS[lc]}`], args: { applicationId: app.id, lifecycle: lc } }
    },
    async execute(a) { await setApplicationLifecycle(str(a.applicationId), str(a.lifecycle) as LifecycleStr); return 'Ο κύκλος ζωής άλλαξε.' },
  },
  {
    name: 'add_application_item',
    description: 'Προσθήκη δικαιολογητικού (FORM) ή εργασίας (TASK) σε έργο. Χωρίς στάδιο: δικαιολογητικό → «Δικαιολογητικά», εργασία → τρέχον στάδιο.',
    properties: { applicationId: { type: 'string' }, name: { type: 'string' }, kind: { type: 'string', enum: ['FORM', 'TASK'] }, stage: { type: 'string', enum: STAGE_ORDER }, mandatory: { type: 'boolean' } },
    required: ['applicationId', 'name'], permission: ['pm.work', 'pm.manage'],
    async prepare(_ctx, a) {
      const app = await appHead(str(a.applicationId))
      if (!app) return { error: 'Το έργο δεν βρέθηκε.' }
      const name = str(a.name)
      if (!name) return { error: 'Λείπει το όνομα.' }
      const kind = str(a.kind) === 'TASK' ? 'TASK' : 'FORM'
      const stage = (STAGE_ORDER.includes(str(a.stage) as StageStr) ? str(a.stage) : kind === 'FORM' ? 'DOCUMENTS' : app.stage) as StageStr
      const mandatory = a.mandatory !== false
      return { op: this.name, title: kind === 'FORM' ? 'Νέο δικαιολογητικό στο έργο' : 'Νέα εργασία στο έργο', details: [appLabel(app), `«${name}» · στάδιο ${STAGE_LABELS[stage]}${mandatory ? ' · υποχρεωτικό' : ''}`], args: { applicationId: app.id, name, kind, stage, mandatory } }
    },
    async execute(a) {
      await addObligation(str(a.applicationId), { name: str(a.name), kind: str(a.kind) as 'FORM' | 'TASK', stage: str(a.stage) as StageStr, mandatory: a.mandatory !== false })
      return 'Προστέθηκε.'
    },
  },
  {
    name: 'update_application_item',
    description: 'Ενημέρωση δικαιολογητικού/εργασίας ενός έργου (βρίσκεται με το όνομά του): κατάσταση, προθεσμία (YYYY-MM-DD), σημειώσεις. Για «απαλλαγή» δώσε status WAIVED.',
    properties: { applicationId: { type: 'string' }, itemName: { type: 'string' }, status: { type: 'string', enum: Object.keys(STATUS_LABELS) }, dueDate: { type: 'string' }, notes: { type: 'string' } },
    required: ['applicationId', 'itemName'], permission: ['pm.work', 'pm.manage'],
    async prepare(_ctx, a) {
      const app = await appHead(str(a.applicationId))
      if (!app) return { error: 'Το έργο δεν βρέθηκε.' }
      const rows = await prisma.applicationObligation.findMany({ where: { applicationId: app.id, name: ilike(str(a.itemName)) }, select: { id: true, name: true, status: true }, take: 4 })
      if (!rows.length) return { error: `Δεν βρέθηκε «${str(a.itemName)}» στο έργο.` }
      if (rows.length > 1) return { error: `Ταιριάζουν πολλά: ${rows.map(r => r.name).join(' · ')} — διευκρίνισε.` }
      const o = rows[0]
      const status = str(a.status) as ObligationStatusStr
      const due = str(a.dueDate)
      if (due && !/^\d{4}-\d{2}-\d{2}$/.test(due)) return { error: 'Η προθεσμία θέλει μορφή YYYY-MM-DD.' }
      const details = [appLabel(app), `«${o.name}»`]
      if (status && STATUS_LABELS[status]) details.push(`Κατάσταση: ${STATUS_LABELS[o.status as ObligationStatusStr]} → ${STATUS_LABELS[status]}`)
      if (due) details.push(`Προθεσμία: ${due.split('-').reverse().join('/')}`)
      if (str(a.notes)) details.push(`Σημείωση: ${str(a.notes)}`)
      if (details.length === 2) return { error: 'Δεν δόθηκε τι να αλλάξει.' }
      return { op: this.name, title: 'Ενημέρωση στοιχείου έργου', details, args: { obligationId: o.id, status: STATUS_LABELS[status] ? status : undefined, dueDate: due || undefined, notes: str(a.notes) || undefined } }
    },
    async execute(a) {
      await updateObligation(str(a.obligationId), { status: (str(a.status) || undefined) as ObligationStatusStr | undefined, dueDate: str(a.dueDate) || undefined, notes: str(a.notes) || undefined })
      return 'Ενημερώθηκε.'
    },
  },
  {
    name: 'assign_application',
    description: 'Ανάθεση έργου σε υπεύθυνο (manager) και/ή εκτελεστές, με ονόματα χρηστών. Οι υπάρχοντες εκτελεστές διατηρούνται εκτός αν replace=true.',
    properties: { applicationId: { type: 'string' }, managerName: { type: 'string' }, employeeNames: { type: 'array', items: { type: 'string' } }, replace: { type: 'boolean' } },
    required: ['applicationId'], permission: ['application.assign'],
    async prepare(_ctx, a) {
      const app = await appHead(str(a.applicationId))
      if (!app) return { error: 'Το έργο δεν βρέθηκε.' }
      let managerId = app.managerId
      const details = [appLabel(app)]
      if (str(a.managerName)) {
        const m = await findStaff(str(a.managerName))
        if (m.length !== 1) return { error: m.length ? `Πολλοί χρήστες ταιριάζουν: ${m.map(x => x.name).join(', ')}` : `Δεν βρέθηκε χρήστης «${str(a.managerName)}».` }
        managerId = m[0].id
        details.push(`Υπεύθυνος: ${m[0].name}`)
      }
      const emp = new Set(a.replace === true ? [] : app.assignments.map(x => x.userId))
      for (const n of list(a.employeeNames)) {
        const u = await findStaff(n)
        if (u.length !== 1) return { error: u.length ? `Πολλοί χρήστες ταιριάζουν στο «${n}»: ${u.map(x => x.name).join(', ')}` : `Δεν βρέθηκε χρήστης «${n}».` }
        emp.add(u[0].id)
      }
      const names = await prisma.user.findMany({ where: { id: { in: [...emp] } }, select: { name: true } })
      details.push(`Εκτελεστές: ${names.map(n => n.name).join(', ') || '—'}`)
      return { op: this.name, title: 'Ανάθεση έργου', details, args: { applicationId: app.id, managerId, employeeIds: [...emp] } }
    },
    async execute(a) {
      const r = await assignApplication({ applicationId: str(a.applicationId), managerId: str(a.managerId) || null, employeeIds: list(a.employeeIds) })
      if (!r.ok) throw new Error(r.error ?? 'Η ανάθεση απέτυχε.')
      return 'Η ανάθεση έγινε.'
    },
  },
  {
    name: 'add_program_potentials',
    description: 'Καταχώριση πελατών ως δυνητικών σε ένα πρόγραμμα (δημιουργεί συμμετοχή «Δυνητικός»). trdrIds από find_customer.',
    properties: { programId: { type: 'string' }, trdrIds: { type: 'array', items: { type: 'string' } } },
    required: ['programId', 'trdrIds'], permission: ['programs.manage'],
    async prepare(_ctx, a) {
      const p = await prisma.program.findUnique({ where: { id: str(a.programId) }, select: { id: true, title: true } })
      if (!p) return { error: 'Το πρόγραμμα δεν βρέθηκε.' }
      const ts = await prisma.trdr.findMany({ where: { id: { in: list(a.trdrIds) } }, select: { id: true, NAME: true }, take: 50 })
      if (!ts.length) return { error: 'Δεν βρέθηκαν πελάτες.' }
      return { op: this.name, title: 'Δυνητικοί πελάτες σε πρόγραμμα', details: [`Πρόγραμμα: ${p.title}`, ...ts.map(t => `• ${t.NAME}`)], args: { programId: p.id, trdrIds: ts.map(t => t.id) } }
    },
    async execute(a) { const r = await saveProgramLeads(str(a.programId), list(a.trdrIds)); return `Καταχωρίστηκαν ${r.saved}.` },
  },
  {
    name: 'log_lead_contact',
    description: 'Καταγραφή επικοινωνίας με ενδιαφερόμενο (lead) — αναζήτηση με επωνυμία/email/ΑΦΜ. medium: PHONE/EMAIL/SMS/MEETING/OTHER.',
    properties: { lead: { type: 'string' }, medium: { type: 'string' }, note: { type: 'string' } },
    required: ['lead', 'note'], permission: ['lead.view'],
    async prepare(_ctx, a) {
      const q = str(a.lead)
      const leads = await prisma.lead.findMany({ where: { OR: [{ companyName: ilike(q) }, { email: ilike(q) }, { afm: { contains: q } }] }, select: { id: true, companyName: true, email: true }, take: 3 })
      if (leads.length !== 1) return { error: leads.length ? `Πολλά leads ταιριάζουν: ${leads.map(l => l.companyName ?? l.email).join(', ')}` : `Δεν βρέθηκε lead «${q}».` }
      const medium = ['PHONE', 'EMAIL', 'SMS', 'MEETING', 'OTHER'].includes(str(a.medium).toUpperCase()) ? str(a.medium).toUpperCase() : 'PHONE'
      return { op: this.name, title: 'Καταγραφή επικοινωνίας με lead', details: [leads[0].companyName ?? leads[0].email, `Μέσο: ${medium}`, str(a.note)], args: { leadId: leads[0].id, medium, note: str(a.note) } }
    },
    async execute(a) {
      const r = await logLeadCommunication(str(a.leadId), { medium: str(a.medium) as 'PHONE', note: str(a.note) })
      if (!r.ok) throw new Error(r.error ?? 'Απέτυχε.')
      return 'Καταγράφηκε.'
    },
  },
  {
    name: 'set_lead_status',
    description: 'Αλλαγή κατάστασης lead (NEW/ASSIGNED/IN_PROGRESS/NOT_INTERESTED).',
    properties: { lead: { type: 'string' }, status: { type: 'string', enum: ['NEW', 'ASSIGNED', 'IN_PROGRESS', 'NOT_INTERESTED'] } },
    required: ['lead', 'status'], permission: ['lead.view'],
    async prepare(_ctx, a) {
      const q = str(a.lead)
      const leads = await prisma.lead.findMany({ where: { OR: [{ companyName: ilike(q) }, { email: ilike(q) }, { afm: { contains: q } }] }, select: { id: true, companyName: true, email: true, status: true }, take: 3 })
      if (leads.length !== 1) return { error: leads.length ? `Πολλά leads ταιριάζουν: ${leads.map(l => l.companyName ?? l.email).join(', ')}` : `Δεν βρέθηκε lead «${q}».` }
      return { op: this.name, title: 'Κατάσταση lead', details: [leads[0].companyName ?? leads[0].email, `${leads[0].status} → ${str(a.status)}`], args: { leadId: leads[0].id, status: str(a.status) } }
    },
    async execute(a) {
      const r = await setLeadStatus(str(a.leadId), str(a.status) as 'NEW')
      if (!r.ok) throw new Error(r.error ?? 'Απέτυχε.')
      return 'Η κατάσταση άλλαξε.'
    },
  },
]

const allowed = (ctx: ThanosContext, op: OpDef) => op.permission.some(p => can(ctx, p))
const BY_NAME = new Map(OPS.map(o => [o.name, o]))

/** Εργαλεία «prepare_op_*» για το μοντέλο — όσα επιτρέπει ο ρόλος του χρήστη. */
export function operationTools(ctx: ThanosContext): { tool: ORTool; op: OpDef }[] {
  if (ctx.mode !== 'STAFF') return []
  return OPS.filter(o => allowed(ctx, o)).map(op => ({
    op,
    tool: {
      type: 'function',
      function: {
        name: `prepare_op_${op.name}`,
        description: `${op.description} ΔΕΝ εκτελεί — ετοιμάζει κάρτα επιβεβαίωσης («Εκτέλεση»).`,
        parameters: { type: 'object', properties: op.properties, required: op.required },
      },
    },
  }))
}

export async function prepareOperation(ctx: ThanosContext, name: string, args: Record<string, unknown>): Promise<Prepared> {
  const op = BY_NAME.get(name)
  if (!op || !allowed(ctx, op)) return { error: 'Δεν επιτρέπεται αυτή η ενέργεια.' }
  return op.prepare(ctx, args)
}

export async function executeOperation(ctx: ThanosContext, payload: OperationPayload): Promise<string> {
  const op = BY_NAME.get(payload.op)
  if (!op || !allowed(ctx, op)) throw new Error('Δεν επιτρέπεται αυτή η ενέργεια.')
  return op.execute(payload.args)
}
