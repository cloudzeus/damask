import { prisma } from '@/lib/prisma'

/**
 * (Plain module.) «Επισκόπηση» εγκεκριμένου έργου (υλοποίηση): ΜΙΑ λίστα «τι να κάνετε τώρα» από όλες τις πηγές του έργου, με
 * σειρά προτεραιότητας — πρώτα όσα περιμένουν ΔΙΚΟ ΣΑΣ έλεγχο, μετά όσα λείπουν από τον πελάτη, μετά οργάνωση.
 * Κάθε στοιχείο δείχνει σε ποια καρτέλα γίνεται η δουλειά (καμία ενέργεια δεν επαναλαμβάνεται σε δύο σημεία).
 */

export type ImplTab = 'overview' | 'expenses' | 'documents' | 'folder' | 'payments' | 'tasks' | 'comm'
export type NextAction = { key: string; label: string; detail: string; count: number; tab: ImplTab; tone: 'review' | 'missing' | 'info' }

export type ImplOverview = {
  approved: { total: number; documented: number; pct: number }
  endsAt: string | null
  daysLeft: number | null
  installments: { paid: number; total: number; inProgress: number }
  actions: NextAction[]
}

const r2 = (v: number) => Math.round(v * 100) / 100

export async function computeImplOverview(applicationId: string): Promise<ImplOverview> {
  const [obligations, inbox, fileItems, delivTasks, payments, approval] = await Promise.all([
    prisma.applicationObligation.findMany({ where: { applicationId }, select: { kind: true, status: true, mandatory: true, dueDate: true } }),
    prisma.applicationInboxDoc.findMany({ where: { applicationId, status: 'PENDING' }, select: { fileName: true, relPath: true, mimeType: true, kind: true, role: true, extracted: true } }),
    prisma.fileRequestItem.count({ where: { status: 'UPLOADED', fileRequest: { applicationId } } }),
    prisma.expenseDeliverableTask.groupBy({ by: ['status'], where: { deliverable: { applicationId } }, _count: true }),
    prisma.paymentRequest.findMany({ where: { applicationId }, select: { status: true } }),
    prisma.applicationApproval.findUnique({ where: { applicationId }, select: { endsAt: true } }),
  ])
  const { implStatusFor } = await import('@/lib/pm/impl-status')
  const status = await implStatusFor(applicationId)
  const expenses = await prisma.programExpense.findMany({ where: { applicationId, status: 'ACTIVE' }, select: { id: true, amount: true } })
  const total = r2(expenses.reduce((a, e) => a + Number(e.amount), 0))
  const documented = r2([...status.values()].reduce((a, s) => a + s.documented, 0))
  const needAttention = [...status.values()].filter(s => s.hasDocs && !s.complete).length
  const noDocs = [...status.values()].filter(s => !s.hasDocs && s.kind !== 'indirect').length

  // «Προς καταχώριση»: μόνο όσα θέλουν ενέργεια (όχι «δεν χρειάζονται καταχώριση» / ήδη καταχωρισμένα εγκριτικά) —
  // ίδια αναγνώριση ρόλου με τη λίστα (κανόνες + μνήμη).
  const { classifyWithMemory } = await import('@/lib/pm/file-role-memory')
  let inboxActionable = 0
  for (const r of inbox) {
    if (r.kind === 'APPROVAL') continue
    const x = r.kind === 'INVOICE' ? (r.extracted as { docType?: string; issuer?: { name?: string; afm?: string }; totals?: { gross?: number } } | null) : null
    const role = r.role ?? (await classifyWithMemory({ fileName: r.fileName, relPath: r.relPath, mimeType: r.mimeType, docType: x?.docType, issuerName: x?.issuer?.name, issuerAfm: x?.issuer?.afm, gross: x?.totals?.gross, inboxKind: r.kind })).role
    if (role !== 'OTHER') inboxActionable++
  }
  const forms = obligations.filter(o => o.kind === 'FORM')
  const formsToReview = forms.filter(o => o.status === 'SUBMITTED').length
  const formsMissing = forms.filter(o => o.mandatory && (o.status === 'PENDING' || o.status === 'IN_PROGRESS' || o.status === 'REJECTED')).length
  const tasksOpen = obligations.filter(o => o.kind !== 'FORM' && o.kind !== 'DELIVERABLE' && o.kind !== 'CRITERION' && (o.status === 'PENDING' || o.status === 'IN_PROGRESS')).length
  const today = new Date()
  const tasksOverdue = obligations.filter(o => o.kind !== 'FORM' && o.kind !== 'CRITERION' && o.kind !== 'DELIVERABLE' && o.dueDate && o.dueDate < today && o.status !== 'APPROVED' && o.status !== 'WAIVED').length
  const dt = (s: string) => delivTasks.find(d => d.status === s)?._count ?? 0

  const actions: NextAction[] = []
  const push = (a: NextAction) => { if (a.count > 0) actions.push(a) }
  // 1. Περιμένουν ΔΙΚΟ ΣΑΣ έλεγχο.
  push({ key: 'forms-review', label: 'Δικαιολογητικά για αποδοχή', detail: 'Υπάρχει έγγραφο — ελέγξτε και πατήστε «Αποδοχή».', count: formsToReview + fileItems, tab: 'documents', tone: 'review' })
  push({ key: 'inbox', label: 'Αρχεία του πελάτη προς καταχώριση', detail: 'Ανέβηκαν αρχεία για το έργο — ελέγξτε πού μπαίνουν (στην ενότητα «Προς καταχώριση»).', count: inboxActionable, tab: 'expenses', tone: 'review' })
  push({ key: 'folder-review', label: 'Έγγραφα φακέλου για αποδοχή', detail: 'Ανέβηκαν έγγραφα στον φάκελο πιστοποίησης.', count: dt('UPLOADED'), tab: 'folder', tone: 'review' })
  push({ key: 'invoices', label: 'Δαπάνες με εκκρεμότητα', detail: 'Λείπει πληρωμή/εξτρέ ή βεβαίωση προμηθευτή.', count: needAttention, tab: 'expenses', tone: 'review' })
  // 2. Λείπουν από τον πελάτη.
  push({ key: 'forms-missing', label: 'Υποχρεωτικά δικαιολογητικά που λείπουν', detail: 'Ανεβάστε τα ή ζητήστε τα από τον πελάτη.', count: formsMissing, tab: 'documents', tone: 'missing' })
  push({ key: 'no-invoices', label: 'Δαπάνες χωρίς παραστατικά', detail: 'Ανεβάστε τιμολόγια — η εφαρμογή τα ταιριάζει με τις δαπάνες.', count: noDocs, tab: 'expenses', tone: 'missing' })
  push({ key: 'folder-missing', label: 'Έγγραφα φακέλου που λείπουν', detail: 'Υποχρεωτικά έγγραφα πιστοποίησης χωρίς αρχείο.', count: dt('PENDING') + dt('REJECTED'), tab: 'folder', tone: 'missing' })
  // 3. Οργάνωση.
  push({ key: 'tasks-overdue', label: 'Εκπρόθεσμες εργασίες', detail: 'Πέρασε η προθεσμία τους.', count: tasksOverdue, tab: 'tasks', tone: 'missing' })
  push({ key: 'tasks', label: 'Ανοιχτές εργασίες', detail: 'Εργασίες του έργου σε εξέλιξη.', count: tasksOpen - tasksOverdue, tab: 'tasks', tone: 'info' })

  const endsAt = approval?.endsAt ?? null
  return {
    approved: { total, documented, pct: total > 0 ? Math.min(100, Math.round((documented / total) * 100)) : 0 },
    endsAt: endsAt?.toISOString() ?? null,
    daysLeft: endsAt ? Math.ceil((endsAt.getTime() - Date.now()) / 86_400_000) : null,
    installments: {
      paid: payments.filter(p => p.status === 'PAID').length,
      total: payments.filter(p => p.status !== 'REJECTED').length,
      inProgress: payments.filter(p => p.status === 'SUBMITTED' || p.status === 'APPROVED').length,
    },
    actions,
  }
}
