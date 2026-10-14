'use server'

import crypto from 'node:crypto'
import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { logActivity } from '@/lib/activity/log'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { requireExpenseAccess } from '@/lib/pm/access'
import { summarizePayroll, perEmeCapFrom, samePerson, periodFromText, type PayrollSummary } from '@/lib/pm/payroll-calc'

/**
 * Μισθολογικό κόστος έργου (δαπάνη προσωπικού): μισθοδοτικές καταστάσεις → εργαζόμενοι × μήνες (AI), αναγγελίες
 * πρόσληψης → ποιοι είναι οι νέοι εργαζόμενοι του έργου, πληρωμές μισθοδοσίας → ποιοι μήνες εξοφλήθηκαν. Όριο από το
 * πρόγραμμα (ανά ΕΜΕ) και το εγκεκριμένο ποσό.
 */

export type PayrollDocKind = 'PAYSLIPS' | 'PAYMENT' | 'HIRING' | 'OTHER'
type FileIn = { name: string; base64: string; mimeType: string }

export type PayrollView = {
  expenseId: string
  approved: number
  perEmeCap: number | null
  employees: { id: string; name: string; afm: string | null; hiredAt: string | null; projectHire: boolean; fte: number; months: number; cost: number; cap: number | null; eligible: number; missing: string[] }[]
  /** Πλέγμα: κόστος (μικτά+εργοδοτικές) ανά νέο εργαζόμενο και μήνα. */
  grid: { employeeId: string; period: string; cost: number }[]
  periods: PayrollSummary['periods']
  summary: { cost: number; eligible: number; paidCost: number }
  docs: { id: string; kind: PayrollDocKind; name: string; amount: number | null; paidAt: string | null; period: string | null; note: string | null; readError: string | null; lines: number }[]
}

const n = (v: unknown) => (v == null ? null : Number(v))
const num = (v: unknown) => { const x = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : NaN; return Number.isFinite(x) ? x : null }
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)
const toDate = (s: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)
const period = (v: unknown) => { const s = str(v); return s && /^\d{4}-\d{2}$/.test(s) ? s : null }

export async function getPayroll(expenseId: string): Promise<PayrollView> {
  await requireExpenseAccess(expenseId)
  return loadPayroll(expenseId)
}

async function loadPayroll(expenseId: string): Promise<PayrollView> {
  const e = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    select: {
      amount: true, category: { select: { notes: true } },
      payrollEmployees: { orderBy: [{ projectHire: 'desc' }, { name: 'asc' }], include: { lines: true } },
      payrollDocs: { orderBy: [{ kind: 'asc' }, { period: 'asc' }, { createdAt: 'asc' }], include: { _count: { select: { lines: true } } } },
    },
  })
  const perEmeCap = perEmeCapFrom(e.category?.notes)
  const lines = e.payrollEmployees.flatMap(emp => emp.lines.map(l => ({ employeeId: emp.id, period: l.period, kind: l.kind, gross: Number(l.gross), employerContrib: Number(l.employerContrib), net: n(l.net) })))
  const s = summarizePayroll({
    employees: e.payrollEmployees.map(x => ({ id: x.id, name: x.name, projectHire: x.projectHire, fte: x.fte })),
    lines, payments: e.payrollDocs.filter(d => d.kind === 'PAYMENT').map(d => ({ period: d.period, amount: n(d.amount) })),
    perEmeCap, approved: Number(e.amount),
  })
  const byEmp = new Map(s.employees.map(x => [x.id, x]))
  const grid = new Map<string, number>()
  for (const l of lines) if (byEmp.has(l.employeeId)) grid.set(`${l.employeeId}|${l.period}`, (grid.get(`${l.employeeId}|${l.period}`) ?? 0) + l.gross + l.employerContrib)
  return {
    expenseId, approved: Number(e.amount), perEmeCap,
    employees: e.payrollEmployees.map(x => {
      const own = byEmp.get(x.id)
      const all = lines.filter(l => l.employeeId === x.id)
      return {
        id: x.id, name: x.name, afm: x.afm, hiredAt: x.hiredAt?.toISOString().slice(0, 10) ?? null, projectHire: x.projectHire, fte: x.fte,
        months: own?.months ?? new Set(all.map(l => l.period)).size,
        cost: own?.cost ?? Math.round(all.reduce((a, l) => a + l.gross + l.employerContrib, 0) * 100) / 100,
        cap: own?.cap ?? null, eligible: own?.eligible ?? 0, missing: own?.missing ?? [],
      }
    }),
    grid: [...grid].map(([k, cost]) => { const [employeeId, p] = k.split('|'); return { employeeId, period: p, cost: Math.round(cost * 100) / 100 } }),
    periods: s.periods,
    summary: { cost: s.cost, eligible: s.eligible, paidCost: s.paidCost },
    docs: e.payrollDocs.map(d => ({
      id: d.id, kind: d.kind as PayrollDocKind, name: d.name, amount: n(d.amount), paidAt: d.paidAt?.toISOString().slice(0, 10) ?? null,
      period: d.period, note: d.note, readError: d.readError, lines: d._count.lines,
    })),
  }
}

const PAYSLIP_PROMPT = [
  'Διαβάζεις ελληνικές ΜΙΣΘΟΔΟΤΙΚΕΣ ΚΑΤΑΣΤΑΣΕΙΣ (μπορεί πολλοί μήνες/εργαζόμενοι). Για ΚΑΘΕ εργαζόμενο και ΚΑΘΕ μήνα επέστρεψε μία γραμμή — κανέναν μην παραλείψεις.',
  'Ξεχωριστές γραμμές για τακτικές αποδοχές, δώρο Χριστουγέννων, δώρο Πάσχα, επίδομα αδείας (ίδιος μήνας, άλλο είδος).',
  'Γράψε το ονοματεπώνυμο ακριβώς όπως αναγράφεται (ΕΠΩΝΥΜΟ ΟΝΟΜΑ) και ΑΦΜ/ΑΜΚΑ αν φαίνονται.',
  'Απάντησε ΑΥΣΤΗΡΑ JSON: {"rows":[{"name":"ΕΠΩΝΥΜΟ ΟΝΟΜΑ","afm":"","amka":"","period":"YYYY-MM","kind":"τακτικές|δώρο Χριστουγέννων|δώρο Πάσχα|επίδομα αδείας|άλλο","days":αριθμός|null,"gross":μικτές αποδοχές,"employeeContrib":εισφορές εργαζομένου,"employerContrib":εισφορές εργοδότη,"tax":φόρος,"net":καθαρές πληρωτέες}]}',
].join('\n')
const PAGES_PER_CHUNK = 6

/**
 * Μισθοδοτικές: μεγάλα PDF (π.χ. 12 μήνες × πολλοί εργαζόμενοι, 60+ σελίδες) διαβάζονται σε κομμάτια σελίδων —
 * αλλιώς η απάντηση του AI κόβεται και χάνονται εργαζόμενοι/μήνες.
 */
async function readPayslips(file: FileIn, userId: string, refId: string): Promise<{ rows: Record<string, unknown>[] }> {
  if (file.mimeType !== 'application/pdf') return (await aiRead<{ rows?: Record<string, unknown>[] }>(file, PAYSLIP_PROMPT, userId, refId, 30_000).then(x => ({ rows: x?.rows ?? [] })))
  const { PDFDocument } = await import('pdf-lib')
  const src = await PDFDocument.load(Buffer.from(file.base64, 'base64'), { ignoreEncryption: true })
  const total = src.getPageCount()
  if (total <= PAGES_PER_CHUNK) return aiRead<{ rows?: Record<string, unknown>[] }>(file, PAYSLIP_PROMPT, userId, refId, 30_000).then(x => ({ rows: x?.rows ?? [] }))
  const chunks: number[][] = []
  for (let i = 0; i < total; i += PAGES_PER_CHUNK) chunks.push(Array.from({ length: Math.min(PAGES_PER_CHUNK, total - i) }, (_, k) => i + k))
  const out: Record<string, unknown>[][] = new Array(chunks.length)
  // Ανάγνωση εύρους σελίδων· άκυρη/κενή απάντηση → 2η προσπάθεια → αλλιώς χωρίζεται στα δύο (ως 1 σελίδα).
  const readRange = async (pages: number[]): Promise<Record<string, unknown>[]> => {
    const part = await PDFDocument.create()
    for (const pg of await part.copyPages(src, pages)) part.addPage(pg)
    const doc = { name: `${file.name} (σελ. ${pages[0] + 1}-${pages[pages.length - 1] + 1})`, base64: Buffer.from(await part.save()).toString('base64'), mimeType: 'application/pdf' }
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        const rows = (await aiRead<{ rows?: Record<string, unknown>[] }>(doc, PAYSLIP_PROMPT, userId, refId, 24_000))?.rows
        if (Array.isArray(rows) && rows.length) return rows
      } catch (err) { if (attempt && pages.length === 1) throw err }
    }
    if (pages.length === 1) return []
    const mid = Math.ceil(pages.length / 2)
    return [...(await readRange(pages.slice(0, mid))), ...(await readRange(pages.slice(mid)))]
  }
  let next = 0
  const worker = async () => {
    while (next < chunks.length) {
      const idx = next++
      out[idx] = await readRange(chunks[idx])
    }
  }
  await Promise.all([worker(), worker(), worker()])
  return { rows: out.flat() }
}

async function aiRead<T>(file: FileIn, system: string, userId: string, refId: string, maxOutputTokens?: number): Promise<T | null> {
  if (file.mimeType !== 'application/pdf' && !file.mimeType.startsWith('image/')) return null
  const { geminiGenerate } = await import('@/lib/gemini')
  const r = await geminiGenerate({
    parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: `Αρχείο: ${file.name}. Διάβασε το έγγραφο σύμφωνα με τις οδηγίες.` }],
    systemInstruction: system, json: true, maxOutputTokens, scope: 'OCR_VISION', refType: 'payroll', refId, userId,
  })
  return (parseJsonLoose(r.text) ?? null) as T | null
}

type Emp = { id: string; name: string; afm: string | null }
async function findOrCreateEmployee(expenseId: string, cache: Emp[], who: { name: string; afm?: string | null; amka?: string | null; hiredAt?: Date | null; projectHire?: boolean }): Promise<Emp> {
  const hit = cache.find(e => samePerson(e, who))
  if (hit) {
    const data: { afm?: string; amka?: string; hiredAt?: Date; projectHire?: boolean } = {}
    if (!hit.afm && who.afm) data.afm = who.afm
    if (who.amka) data.amka = who.amka
    if (who.hiredAt) data.hiredAt = who.hiredAt
    if (who.projectHire) data.projectHire = true
    if (Object.keys(data).length) await prisma.payrollEmployee.update({ where: { id: hit.id }, data })
    return hit
  }
  const row = await prisma.payrollEmployee.create({ data: { expenseId, name: who.name.slice(0, 200), afm: who.afm ?? null, amka: who.amka ?? null, hiredAt: who.hiredAt ?? null, projectHire: !!who.projectHire } })
  const emp = { id: row.id, name: row.name, afm: row.afm }
  cache.push(emp)
  return emp
}

/** Ανέβασμα εγγράφου μισθοδοσίας + ανάγνωση ανάλογα με το είδος. */
export async function uploadPayrollDoc(expenseId: string, kind: PayrollDocKind, file: FileIn): Promise<{ ok: true; note: string; view: PayrollView } | { ok: false; message: string }> {
  const { session, app } = await requireExpenseAccess(expenseId)
  try {
    const body = Buffer.from(file.base64, 'base64')
    const ext = (file.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
    const key = `payroll/${expenseId}/${crypto.randomUUID()}.${ext}`
    await bunnyUploadPrivate({ key, body, contentType: file.mimeType || 'application/octet-stream' })
    const { recordFileHash } = await import('@/lib/import/existing')
    await recordFileHash({ key, body, trdrId: app.trdrId, kind: 'purchase', label: `Μισθοδοσία: ${file.name}`, ref: expenseId })
    const doc = await prisma.payrollDoc.create({ data: { expenseId, kind, key, name: file.name.slice(0, 250), mime: file.mimeType, createdById: session.user.id } })
    const cache: Emp[] = (await prisma.payrollEmployee.findMany({ where: { expenseId }, select: { id: true, name: true, afm: true } }))
    let note = 'Καταχωρίστηκε.'
    try {
      if (kind === 'PAYSLIPS') {
        const x = await readPayslips(file, session.user.id, expenseId)
        let count = 0
        for (const r of x?.rows ?? []) {
          const name = str(r.name), p = period(r.period), gross = num(r.gross)
          if (!name || !p || gross == null || gross <= 0) continue
          const emp = await findOrCreateEmployee(expenseId, cache, { name, afm: str(r.afm)?.replace(/\D/g, '') || null, amka: str(r.amka) })
          const kindL = str(r.kind) ?? 'τακτικές'
          const data = { docId: doc.id, days: num(r.days), gross, employeeContrib: num(r.employeeContrib), employerContrib: num(r.employerContrib) ?? 0, tax: num(r.tax), net: num(r.net) }
          await prisma.payrollLine.upsert({ where: { employeeId_period_kind: { employeeId: emp.id, period: p, kind: kindL } }, create: { employeeId: emp.id, period: p, kind: kindL, ...data }, update: data })
          count++
        }
        const periods = [...new Set((x?.rows ?? []).map(r => period(r.period)).filter(Boolean))].sort()
        note = count ? `Διαβάστηκαν ${count} γραμμές μισθοδοσίας${periods.length ? ` (${periods[0]} έως ${periods[periods.length - 1]})` : ''}.` : 'Δεν βρέθηκαν γραμμές μισθοδοσίας.'
      } else if (kind === 'PAYMENT') {
        const x = await aiRead<{ amount?: unknown; date?: unknown; period?: unknown; kind?: unknown }>(file, [
          'Διαβάζεις ελληνικό αποδεικτικό ΠΛΗΡΩΜΗΣ ΜΙΣΘΟΔΟΣΙΑΣ (μαζική πληρωμή μισθών / μεταφορά προς εργαζόμενους) ή εξτρέ.',
          'Απάντησε ΑΥΣΤΗΡΑ JSON: {"amount": συνολικό ποσό χρέωσης (αριθμός), "date":"YYYY-MM-DD", "period":"YYYY-MM του μήνα μισθοδοσίας που αφορά (από αιτιολογία/όνομα αρχείου)", "kind":"προκαταβολή|εξόφληση|εισφορές|άλλο"}.',
        ].join('\n'), session.user.id, expenseId)
        const p = period(x?.period) ?? periodFromText(file.name)
        await prisma.payrollDoc.update({ where: { id: doc.id }, data: { amount: num(x?.amount), paidAt: toDate(str(x?.date)), period: p, note: str(x?.kind) } })
        note = x ? `Πληρωμή ${num(x.amount)?.toLocaleString('el-GR', { minimumFractionDigits: 2 }) ?? '—'} € για ${p ?? 'άγνωστο μήνα'}.` : 'Συμπληρώστε ποσό και μήνα.'
      } else if (kind === 'HIRING') {
        const x = await aiRead<{ employees?: Record<string, unknown>[] }>(file, [
          'Διαβάζεις ελληνική ΑΝΑΓΓΕΛΙΑ ΠΡΟΣΛΗΨΗΣ (ΕΡΓΑΝΗ Ε3) ή σύμβαση εργασίας.',
          'Απάντησε ΑΥΣΤΗΡΑ JSON: {"employees":[{"name":"ΕΠΩΝΥΜΟ ΟΝΟΜΑ","afm":"","amka":"","hiredAt":"YYYY-MM-DD","partTime":true|false,"weeklyHours":αριθμός|null}]}',
        ].join('\n'), session.user.id, expenseId)
        const names: string[] = []
        for (const r of x?.employees ?? []) {
          const name = str(r.name)
          if (!name) continue
          const emp = await findOrCreateEmployee(expenseId, cache, { name, afm: str(r.afm)?.replace(/\D/g, '') || null, amka: str(r.amka), hiredAt: toDate(str(r.hiredAt)), projectHire: true })
          const hours = num(r.weeklyHours)
          if (r.partTime === true && hours && hours < 40) await prisma.payrollEmployee.update({ where: { id: emp.id }, data: { fte: Math.round((hours / 40) * 100) / 100 } })
          names.push(name)
        }
        note = names.length ? `Νέος/οι εργαζόμενος/οι του έργου: ${names.join(', ')}.` : 'Δεν βρέθηκε εργαζόμενος — σημειώστε τον χειροκίνητα.'
      }
    } catch (err) {
      await prisma.payrollDoc.update({ where: { id: doc.id }, data: { readError: err instanceof Error ? err.message.slice(0, 300) : 'Η ανάγνωση απέτυχε.' } })
      note = 'Ανέβηκε, αλλά η ανάγνωση απέτυχε — δοκιμάστε ξανά ή συμπληρώστε χειροκίνητα.'
    }
    await logActivity('expense.payroll', { entityType: 'expense', entityId: expenseId, userId: session.user.id, meta: { kind, docId: doc.id } })
    return { ok: true, note, view: await loadPayroll(expenseId) }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.' }
  }
}

/** Σήμανση νέου εργαζόμενου του έργου / ποσοστό απασχόλησης. */
export async function updatePayrollEmployee(employeeId: string, input: { projectHire?: boolean; fte?: number }): Promise<PayrollView> {
  const emp = await prisma.payrollEmployee.findUnique({ where: { id: employeeId }, select: { expenseId: true } })
  if (!emp) notFound()
  await requireExpenseAccess(emp.expenseId)
  await prisma.payrollEmployee.update({
    where: { id: employeeId },
    data: { ...(input.projectHire !== undefined ? { projectHire: input.projectHire } : {}), ...(input.fte !== undefined ? { fte: Math.min(1, Math.max(0.05, input.fte)) } : {}) },
  })
  return loadPayroll(emp.expenseId)
}

/** Διόρθωση πληρωμής (ποσό/ημερομηνία/μήνας). */
export async function updatePayrollPayment(docId: string, input: { amount: number | null; paidAt: string | null; period: string | null }): Promise<PayrollView> {
  const d = await prisma.payrollDoc.findUnique({ where: { id: docId }, select: { expenseId: true } })
  if (!d) notFound()
  await requireExpenseAccess(d.expenseId)
  await prisma.payrollDoc.update({ where: { id: docId }, data: { amount: input.amount, paidAt: toDate(input.paidAt), period: input.period && /^\d{4}-\d{2}$/.test(input.period) ? input.period : null, readError: null } })
  return loadPayroll(d.expenseId)
}

/** Διαγραφή εγγράφου (και των γραμμών μισθοδοσίας που προήλθαν από αυτό). */
export async function deletePayrollDoc(docId: string): Promise<PayrollView> {
  const d = await prisma.payrollDoc.findUnique({ where: { id: docId }, select: { expenseId: true } })
  if (!d) notFound()
  const { session } = await requireExpenseAccess(d.expenseId)
  await prisma.payrollDoc.delete({ where: { id: docId } })
  // Εργαζόμενοι χωρίς γραμμές που δεν είναι νέοι του έργου → φεύγουν (ήρθαν μόνο από αυτή τη μισθοδοτική).
  await prisma.payrollEmployee.deleteMany({ where: { expenseId: d.expenseId, projectHire: false, lines: { none: {} } } })
  await logActivity('expense.payroll', { entityType: 'expense', entityId: d.expenseId, userId: session.user.id, meta: { deleted: docId } })
  return loadPayroll(d.expenseId)
}
