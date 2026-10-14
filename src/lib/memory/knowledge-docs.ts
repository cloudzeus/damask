import { prisma } from '@/lib/prisma'
import { parseGreekNumber } from '@/lib/tax/greek-format'
import { periodLabel } from '@/lib/documents/series'
import { quotePolicyLabel } from '@/lib/programs/quote-policy'
import { perEmeCapFrom } from '@/lib/pm/payroll-calc'
import { isIndirectExpense, indirectRate } from '@/lib/pm/invoice-match'
import { ROLE_LABEL, type ImplDocRole } from '@/lib/pm/impl-doc-classify'
import { stageLabel, type StageStr } from '@/lib/pm/types'

/**
 * (Plain module.) «Μνήμη γραφείου»: εγγραφές ΓΝΩΣΗΣ για το σημασιολογικό ευρετήριο (DocumentSearch), που δεν είναι
 * αρχεία αλλά ό,τι έχει μάθει το γραφείο — προφίλ προγραμμάτων (τι ζητούν), τύποι εγγράφων (ποια προγράμματα τους
 * ζητούν, ποιες τιμές κρατάμε), προφίλ εταιριών με τιμές ανά έτος/περίοδο, εγκριτικά και δαπάνες έργων.
 * Κλειδιά `mem:*`, κατηγορίες `memory-*` — εκτός της αναζήτησης αρχείων, μόνο στη «Μνήμη γραφείου».
 */

export const MEMORY_CATEGORY_LABELS: Record<string, string> = {
  'memory-program': 'Πρόγραμμα',
  'memory-type': 'Τύπος εγγράφου',
  'memory-company': 'Εταιρία',
  'memory-values': 'Τιμές εταιρίας',
  'memory-approval': 'Εγκριτικό έργου',
  'memory-expenses': 'Δαπάνες έργου',
  'memory-impl': 'Υλοποίηση έργου',
  'memory-guide': 'Οδηγός γραφείου',
}

export type KnowledgeDoc = {
  key: string
  title: string
  tags: string[]
  lines: string[]
  category: keyof typeof MEMORY_CATEGORY_LABELS
  trdrId: string | null
  programTitle: string | null
  docType: string | null
  year: number | null
}

const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const eur = (v: unknown) => (v == null ? '—' : `${EUR.format(Number(v))} €`)
const dt = (d: Date | null | undefined) => (d ? d.toLocaleDateString('el-GR') : null)
const PHASE: Record<string, string> = { ASSESSMENT: 'αξιολόγηση', SUBMISSION: 'υποβολή', APPROVAL: 'έγκριση', IMPLEMENTATION: 'υλοποίηση', PAYMENT: 'αποπληρωμή' }
const STATUS: Record<string, string> = { DRAFT: 'πρόχειρο', ACTIVE: 'ενεργό', CLOSED: 'έκλεισε' }
const CAP = 7000

/** Μέσα στο σημασιολογικό ευρετήριο — ένα κείμενο ανά οντότητα. */
export async function buildKnowledgeDocs(): Promise<KnowledgeDoc[]> {
  const [programs, types, companies, values, approvals, apps] = await Promise.all([
    prisma.program.findMany({
      select: {
        id: true, title: true, status: true, referenceCode: true, quotePolicy: true, quotePolicyNote: true, quotePolicyRule: true,
        expenseCats: { orderBy: { order: 'asc' }, select: { id: true, name: true, notes: true, maxPercentage: true, maxAmount: true, minAmount: true } },
        requiredForms: { orderBy: { order: 'asc' }, select: { name: true, mandatory: true, phase: true, notes: true, seriesCount: true, documentType: { select: { name: true } } } },
      },
    }),
    prisma.documentType.findMany({
      where: { active: true },
      select: {
        id: true, name: true, notes: true, expires: true, validityDays: true, seriesKind: true,
        requiredForms: { select: { mandatory: true, program: { select: { title: true, status: true } } } },
        templates: { select: { fields: { orderBy: { order: 'asc' }, select: { label: true } } } },
        _count: { select: { dossierDocs: true } },
      },
    }),
    prisma.trdr.findMany({
      // Κάθε εταιρία με έργο, δικαιολογητικά ή αποθηκευμένες τιμές.
      where: { OR: [{ programApplications: { some: {} } }, { dossierDocs: { some: {} } }, { financialValues: { some: {} } }] },
      select: {
        id: true, NAME: true, AFM: true, CITY: true, appLegalForm: true, appEmployees: true, appEme: true, appEmployeesYear: true, appAnnualRevenue: true, appRevenueYear: true, foundingDate: true,
        programApplications: { select: { stage: true, lifecycle: true, program: { select: { title: true } } } },
        dossierDocs: { select: { name: true, expiresAt: true, period: true, documentType: { select: { name: true } } }, orderBy: { createdAt: 'desc' }, take: 150 },
      },
    }),
    prisma.trdrFinancialValue.findMany({
      select: { trdrId: true, fieldKey: true, year: true, period: true, valueText: true, templateId: true },
      orderBy: [{ year: 'desc' }, { period: 'desc' }],
    }),
    prisma.applicationApproval.findMany({ select: { applicationId: true, decisionRef: true, ada: true, applicationCode: true, decisionDate: true, endsAt: true, durationMonths: true, totalBudget: true, publicAmount: true, aidPct: true, expenses: true, application: { select: { trdrId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } } } } } }),
    prisma.programApplication.findMany({
      where: { expenses: { some: {} } },
      select: {
        id: true, trdrId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } },
        expenses: { where: { status: 'ACTIVE' }, select: { description: true, amount: true, vendor: true, category: { select: { name: true } }, purchase: { select: { invoiceNumber: true, invoiceDate: true } } } },
      },
    }),
  ])
  const out: KnowledgeDoc[] = []

  for (const p of programs) {
    out.push({
      key: `mem:program:${p.id}`, title: p.title, category: 'memory-program', trdrId: null, programTitle: p.title, docType: null, year: null,
      tags: ['πρόγραμμα', STATUS[p.status] ?? p.status, p.referenceCode].filter(Boolean) as string[],
      lines: [
        `Πρόγραμμα ΕΣΠΑ: ${p.title} (${STATUS[p.status] ?? p.status})${p.referenceCode ? ` — κωδ. ${p.referenceCode}` : ''}`,
        p.expenseCats.length ? `Κατηγορίες δαπανών: ${p.expenseCats.map(c => [c.name, c.maxPercentage != null ? `έως ${c.maxPercentage}%` : null, c.maxAmount != null ? `έως ${eur(c.maxAmount)}` : null, c.notes ? `(${c.notes.slice(0, 120)})` : null].filter(Boolean).join(' ')).join('· ')}` : null,
        // Κανόνες υλοποίησης (γνώση γραφείου): προσφορές, μισθολογικό κόστος ανά ΕΜΕ, έμμεσες κατ' αποκοπή.
        p.quotePolicy ? `Προσφορές: ${quotePolicyLabel(p.quotePolicy, p.quotePolicyRule, new Map(p.expenseCats.map((c, i) => [c.id, `${i + 1}. ${c.name}`])))}${p.quotePolicyNote ? ` — ${p.quotePolicyNote.slice(0, 200)}` : ''}` : null,
        ...p.expenseCats.filter(c => perEmeCapFrom(c.notes) != null).map(c => `Μισθολογικό κόστος (${c.name}): έως ${eur(perEmeCapFrom(c.notes))} ανά ΕΜΕ νέου εργαζομένου.`),
        ...p.expenseCats.filter(c => isIndirectExpense(c.name, '')).map(c => `Έμμεσες δαπάνες (${c.name}): κατ' αποκοπή ${Math.round(indirectRate(c.notes, c.name) * 1000) / 10}% επί των επιλέξιμων άμεσων — χωρίς παραστατικά.`),
        p.requiredForms.length ? 'Απαιτούμενα δικαιολογητικά/έγγραφα:' : null,
        ...p.requiredForms.map(f => `- ${f.name}${f.documentType && f.documentType.name !== f.name ? ` [τύπος: ${f.documentType.name}]` : ''}${f.mandatory ? ' (υποχρεωτικό)' : ' (προαιρετικό)'}${f.phase ? `, φάση ${PHASE[f.phase] ?? f.phase}` : ''}${f.seriesCount ? `, ${f.seriesCount} περίοδοι` : ''}${f.notes ? ` — ${f.notes.slice(0, 160)}` : ''}`),
      ].filter(Boolean) as string[],
    })
  }

  for (const t of types) {
    const progs = t.requiredForms.map(r => `${r.program.title}${r.mandatory ? '' : ' (προαιρετικό)'}`)
    const fields = [...new Set(t.templates.flatMap(x => x.fields.map(f => f.label)))]
    out.push({
      key: `mem:type:${t.id}`, title: t.name, category: 'memory-type', trdrId: null, programTitle: null, docType: t.name, year: null,
      tags: ['τύπος εγγράφου', t.expires ? 'λήγει' : null, t.seriesKind ? 'σειρά' : null, progs.length >= 3 ? 'βασικό δικαιολογητικό' : null].filter(Boolean) as string[],
      lines: [
        `Τύπος εγγράφου/δικαιολογητικού: ${t.name}${t.notes ? ` — ${t.notes.slice(0, 200)}` : ''}`,
        t.expires ? `Λήγει${t.validityDays ? ` (ισχύς ${t.validityDays} ημέρες από την έκδοση)` : ''}.` : 'Δεν λήγει.',
        t.seriesKind ? `Ζητείται ως σειρά (${t.seriesKind === 'MONTHLY' ? 'ανά μήνα' : t.seriesKind === 'QUARTERLY' ? 'ανά τρίμηνο' : t.seriesKind === 'YEARLY' ? 'ανά έτος' : 'πολλά αρχεία'}).` : null,
        progs.length ? `Το ζητούν ${progs.length} προγράμματα: ${progs.join('· ')}` : 'Δεν το ζητά κανένα καταχωρισμένο πρόγραμμα.',
        fields.length ? `Τιμές που κρατάμε από αυτό: ${fields.join('· ')}` : null,
        `Υπάρχει σε ${t._count.dossierDocs} δικαιολογητικά πελατών.`,
      ].filter(Boolean) as string[],
    })
  }

  // Τιμές ανά εταιρία: ετικέτες πεδίων από τους Οδηγούς.
  const fieldLabels = new Map<string, string>()
  for (const f of await prisma.taxFormTemplateField.findMany({ select: { fieldKey: true, label: true, templateId: true } })) fieldLabels.set(`${f.templateId}|${f.fieldKey}`, f.label)
  const tplNames = new Map((await prisma.taxFormTemplate.findMany({ select: { id: true, name: true } })).map(t => [t.id, t.name]))
  const byTrdr = new Map<string, typeof values>()
  for (const v of values) byTrdr.set(v.trdrId, [...(byTrdr.get(v.trdrId) ?? []), v])

  for (const c of companies) {
    const now = Date.now()
    const docs = c.dossierDocs.map(d => `${d.documentType.name}${d.period ? ` ${periodLabel(d.period)}` : ''}${d.expiresAt ? (d.expiresAt.getTime() < now ? ` (έληξε ${dt(d.expiresAt)})` : ` (σε ισχύ έως ${dt(d.expiresAt)})`) : ''}`)
    out.push({
      key: `mem:company:${c.id}`, title: c.NAME, category: 'memory-company', trdrId: c.id, programTitle: null, docType: null, year: null,
      tags: ['εταιρία', c.AFM ? `ΑΦΜ ${c.AFM}` : null, c.CITY].filter(Boolean) as string[],
      lines: [
        `Εταιρία: ${c.NAME}${c.AFM ? ` (ΑΦΜ ${c.AFM})` : ''}${c.CITY ? `, ${c.CITY}` : ''}${c.appLegalForm ? `, ${c.appLegalForm}` : ''}${c.foundingDate ? `, ίδρυση ${dt(c.foundingDate)}` : ''}`,
        c.appEmployees != null || c.appEme != null ? `Εργαζόμενοι ${c.appEmployees ?? '—'}, ΕΜΕ ${c.appEme ?? '—'}${c.appEmployeesYear ? ` (${c.appEmployeesYear})` : ''}` : null,
        c.appAnnualRevenue != null ? `Κύκλος εργασιών ${eur(c.appAnnualRevenue)}${c.appRevenueYear ? ` (${c.appRevenueYear})` : ''}` : null,
        c.programApplications.length ? `Προγράμματα: ${c.programApplications.map(a => `${a.program.title} (${a.lifecycle})`).join('· ')}` : null,
        docs.length ? `Δικαιολογητικά στην αποθήκη: ${docs.join('· ')}` : 'Δεν έχει δικαιολογητικά στην αποθήκη.',
      ].filter(Boolean).join('\n').slice(0, CAP).split('\n'),
    })
    // Τιμές: μία εγγραφή ανά Οδηγό × έτος (π.χ. «Φ2 - ΦΠΑ — 2022» με όλους τους μήνες) ώστε να μη κόβονται.
    const groups = new Map<string, { tpl: string; year: number; rows: Map<string, string[]> }>()
    for (const v of byTrdr.get(c.id) ?? []) {
      const tpl = v.templateId ? tplNames.get(v.templateId) ?? 'Τιμές' : 'Τιμές εντύπων'
      const g = groups.get(`${tpl}|${v.year}`) ?? { tpl, year: v.year, rows: new Map<string, string[]>() }
      const when = v.period ? periodLabel(v.period) : String(v.year)
      const label = (v.templateId && fieldLabels.get(`${v.templateId}|${v.fieldKey}`)) || v.fieldKey
      g.rows.set(when, [...(g.rows.get(when) ?? []), `${label}: ${v.valueText ?? '—'}`])
      groups.set(`${tpl}|${v.year}`, g)
    }
    for (const g of groups.values()) {
      const rows = [...g.rows.entries()].sort((a, b) => a[0].localeCompare(b[0]))
      // Σειρές (μήνες): σύνολο έτους ανά ποσό ώστε ερωτήσεις «τζίρος 2022;» να απαντώνται χωρίς πρόσθεση (όχι υπόλοιπα/ημερομηνίες).
      const sums = new Map<string, { sum: number; n: number }>()
      if (rows.length > 1 && rows.every(([when]) => when.includes('/'))) {
        for (const [, items] of rows) for (const it of items) {
          const i = it.indexOf(': ')
          const label = it.slice(0, i), n = parseGreekNumber(it.slice(i + 2))
          if (n == null || /υπόλοιπ|μεταφορ|ημερομην|ημ\/νία/i.test(label)) continue
          const cur = sums.get(label) ?? { sum: 0, n: 0 }
          sums.set(label, { sum: cur.sum + n, n: cur.n + 1 })
        }
      }
      const totalsLine = sums.size ? `Σύνολο ${g.year} (${rows.length} περίοδοι): ${[...sums.entries()].map(([l, x]) => `${l}: ${eur(x.sum)}`).join('; ')}` : null
      out.push({
        key: `mem:values:${c.id}:${(g.tpl + g.year).replace(/[^a-z0-9α-ω]+/gi, '-').slice(0, 60)}`, title: `${g.tpl} ${g.year} — ${c.NAME}`, category: 'memory-values', trdrId: c.id, programTitle: null, docType: g.tpl, year: g.year,
        tags: ['τιμές', g.tpl, String(g.year), c.AFM ? `ΑΦΜ ${c.AFM}` : null].filter(Boolean) as string[],
        lines: [`Αποθηκευμένες τιμές «${g.tpl}» ${g.year} της εταιρίας ${c.NAME}${c.AFM ? ` (ΑΦΜ ${c.AFM})` : ''}:`, ...(totalsLine ? [totalsLine] : []), ...rows.map(([when, a]) => `${when}: ${a.join('; ')}`)].join('\n').slice(0, CAP * 2).split('\n'),
      })
    }
  }

  for (const a of approvals) {
    const ex = Array.isArray(a.expenses) ? (a.expenses as { title?: string; subcategory?: string; net?: number }[]) : []
    out.push({
      key: `mem:approval:${a.applicationId}`, title: `Εγκριτικό — ${a.application.trdr.NAME}`, category: 'memory-approval', trdrId: a.application.trdrId, programTitle: a.application.program.title, docType: 'Εγκριτική απόφαση', year: a.decisionDate?.getFullYear() ?? null,
      tags: ['εγκριτική απόφαση', a.ada ? `ΑΔΑ ${a.ada}` : null, a.applicationCode].filter(Boolean) as string[],
      lines: [
        `Εγκριτική απόφαση ${a.decisionRef ?? ''} ${a.ada ? `(ΑΔΑ ${a.ada})` : ''} — ${a.application.trdr.NAME}, πρόγραμμα ${a.application.program.title}`,
        `Κωδικός αίτησης ${a.applicationCode ?? '—'} · ημ. απόφασης ${dt(a.decisionDate) ?? '—'} · διάρκεια ${a.durationMonths ?? '—'} μήνες · λήξη υλοποίησης ${dt(a.endsAt) ?? '—'}`,
        `Προϋπολογισμός ${eur(a.totalBudget)} · επιχορήγηση ${eur(a.publicAmount)}${a.aidPct != null ? ` (${a.aidPct}%)` : ''}`,
        ex.length ? `Εγκεκριμένες δαπάνες: ${ex.map(e => `${e.title ?? e.subcategory} ${eur(e.net)}`).join('· ')}` : null,
      ].filter(Boolean) as string[],
    })
  }

  for (const a of apps) {
    out.push({
      key: `mem:expenses:${a.id}`, title: `Δαπάνες — ${a.trdr.NAME}`, category: 'memory-expenses', trdrId: a.trdrId, programTitle: a.program.title, docType: null, year: null,
      tags: ['δαπάνες', a.program.title.slice(0, 60)],
      lines: [`Δαπάνες έργου ${a.trdr.NAME} στο πρόγραμμα ${a.program.title}:`, ...a.expenses.map(e => `- ${e.description} — ${eur(e.amount)}${e.category ? ` [${e.category.name}]` : ''}${e.vendor ? `, προμηθευτής ${e.vendor}` : ''}${e.purchase?.invoiceNumber ? `, τιμολόγιο ${e.purchase.invoiceNumber}${e.purchase.invoiceDate ? ` / ${dt(e.purchase.invoiceDate)}` : ''}` : ''}`)].join('\n').slice(0, CAP).split('\n'),
    })
  }
  out.push(...(await implementationDocs()))
  return out
}

/**
 * Υλοποίηση έργων (γνώση για «πού κολλάει το έργο;»): τεκμηριωμένα έναντι εγκεκριμένων ανά δαπάνη, παραστατικά με
 * διασταύρωση, μισθοδοσία, εκκρεμότητες — και ένας «Οδηγός γραφείου» με το πώς οργανώνεται ένας φάκελος υλοποίησης
 * και τι έχει μάθει η μνήμη ρόλων.
 */
async function implementationDocs(): Promise<KnowledgeDoc[]> {
  const out: KnowledgeDoc[] = []
  const { implStatusFor } = await import('@/lib/pm/impl-status')
  const apps = await prisma.programApplication.findMany({
    where: { OR: [{ approval: { isNot: null } }, { expenses: { some: { OR: [{ invoices: { some: {} } }, { payrollDocs: { some: {} } }] } } }] },
    select: {
      id: true, stage: true, trdrId: true, trdr: { select: { NAME: true } }, program: { select: { title: true } },
      _count: { select: { inboxDocs: { where: { status: 'PENDING' } } } },
      expenses: {
        where: { status: 'ACTIVE' },
        select: {
          id: true, description: true, amount: true, category: { select: { name: true } },
          invoices: { select: { number: true, date: true, supplier: true, totalAmount: true, netAmount: true, matchVerdict: true, supplierCertKey: true, payments: { select: { amount: true } } } },
          payrollEmployees: { where: { projectHire: true }, select: { name: true } },
        },
      },
    },
  })
  for (const a of apps) {
    const st = await implStatusFor(a.id)
    const approved = a.expenses.reduce((x, e) => x + Number(e.amount), 0)
    const documented = a.expenses.reduce((x, e) => x + (st.get(e.id)?.documented ?? 0), 0)
    const blockers = a.expenses.map(e => ({ e, s: st.get(e.id) })).filter(x => x.s && !x.s.complete).map(x => `${x.e.description}: ${x.s!.reason ?? 'εκκρεμότητα'}`)
    out.push({
      key: `mem:impl:${a.id}`, title: `Υλοποίηση — ${a.trdr.NAME}`, category: 'memory-impl', trdrId: a.trdrId, programTitle: a.program.title, docType: null, year: null,
      tags: ['υλοποίηση', blockers.length ? 'εκκρεμότητες' : 'πλήρης τεκμηρίωση', a.program.title.slice(0, 60)],
      lines: [
        `Υλοποίηση έργου ${a.trdr.NAME} — πρόγραμμα ${a.program.title} — στάδιο «${stageLabel(a.stage as StageStr)}».`,
        `Τεκμηριωμένα ${eur(documented)} από ${eur(approved)} εγκεκριμένα (${approved ? Math.round((documented / approved) * 100) : 0}%).`,
        blockers.length ? `Πού κολλάει: ${blockers.join(' · ')}` : 'Πλήρης τεκμηρίωση σε όλες τις δαπάνες.',
        a._count.inboxDocs ? `${a._count.inboxDocs} αρχεία περιμένουν στο «Προς καταχώριση».` : null,
        ...a.expenses.flatMap(e => {
          const s = st.get(e.id)
          const head = `- ${e.description} [${e.category?.name ?? '—'}]: εγκεκριμένο ${eur(e.amount)}, τεκμηριωμένο ${eur(s?.documented ?? 0)}${s?.complete ? ' ✓' : ''}`
          if (s?.kind === 'payroll') return [`${head} · νέοι εργαζόμενοι: ${e.payrollEmployees.map(p => p.name).join(', ') || '—'}`]
          if (s?.kind === 'indirect') return [`${head} · κατ' αποκοπή επί των άμεσων`]
          return [head, ...e.invoices.map(i => `   · παραστατικό ${i.number ?? '—'} ${i.supplier ?? ''} ${eur(i.totalAmount)} — ${i.payments.length} πληρωμές, βεβαίωση ${i.supplierCertKey ? 'ναι' : 'όχι'}, ${i.matchVerdict === 'OK' ? 'ταιριάζουν' : i.matchVerdict === 'MISMATCH' ? 'ασυμφωνία' : 'εκκρεμεί'}`)]
        }),
      ].filter(Boolean).join('\n').slice(0, CAP).split('\n'),
    })
  }

  // Οδηγός γραφείου: πώς οργανώνεται ο φάκελος υλοποίησης + τι έχει μάθει η μνήμη ρόλων.
  const learned = await prisma.fileRoleExample.findMany({ orderBy: [{ source: 'desc' }, { hits: 'desc' }], take: 80, select: { role: true, pattern: true, folder: true, source: true, hits: true } })
  out.push({
    key: 'mem:guide:implementation', title: 'Οδηγός γραφείου — φάκελος υλοποίησης', category: 'memory-guide', trdrId: null, programTitle: null, docType: null, year: null,
    tags: ['οδηγός', 'υλοποίηση', 'ταξινόμηση αρχείων'],
    lines: [
      'Φάκελος υλοποίησης έργου ΕΣΠΑ (π.χ. «Α ΔΟΣΗ - ΤΕΛΙΚΗ»): ένας φάκελος ανά παραστατικό (ΤΔΑ/ΤΠΥ/τιμολόγιο) με τις πληρωμές («Πληρωμή (1) - ποσό»), το εξτρέ, τη βεβαίωση προμηθευτή, τις λογιστικές εγγραφές (Γεν. Ημερολόγιο, καρτέλα προμηθευτή) και φωτογραφίες εξοπλισμού/σειριακών.',
      'Φάκελος προσωπικού: μισθοδοτικές καταστάσεις, αναγγελίες πρόσληψης (ορίζουν τους νέους εργαζόμενους), πληρωμές μισθοδοσίας (προκαταβολή/εξόφληση ανά μήνα), ΑΠΔ, e-ΕΦΚΑ, Ε4.',
      'Στάδια: δικαιολογητικά → «Δικαιολογητικά»· προσφορές → «Δαπάνες & Παραδοτέα»· εγκριτική/τροποποίηση → έγκριση· παραστατικά/πληρωμές/βεβαιώσεις/μισθοδοσία → υλοποίηση («Δελτία ελέγχου», αποπληρωμές).',
      'Κανόνες: η βεβαίωση προμηθευτή χρειάζεται σε εξοπλισμό/μηχανήματα/όργανα/οχήματα/λογισμικό· οι πληρωμές ενός παραστατικού μπορεί να είναι σε δόσεις· εξτρέ με πολλές κινήσεις ταιριάζουν με τις πληρωμές ίδιου ποσού· οι έμμεσες δαπάνες είναι κατ\' αποκοπή % επί των άμεσων· η μισθοδοσία ελέγχεται σωρευτικά (δώρα/εξοφλήσεις τον επόμενο μήνα).',
      learned.length ? 'Τι έχει μάθει η μνήμη (σχήμα ονόματος / φάκελος → ρόλος):' : null,
      ...learned.map(l => `- «${l.pattern}»${l.folder ? ` στον «${l.folder}»` : ''} → ${ROLE_LABEL[l.role as ImplDocRole] ?? l.role}${l.source === 'USER' ? ' (επιλογή χρήστη)' : ''} ×${l.hits}`),
    ].filter(Boolean).join('\n').slice(0, CAP).split('\n'),
  })
  return out
}

/** Σύνδεσμος για εγγραφή γνώσης (για τις πηγές των απαντήσεων). */
export function knowledgeHref(key: string, trdrId: string | null): string | null {
  const [, kind, id] = key.split(':')
  if (kind === 'program') return `/programs/${id}`
  if (kind === 'type') return '/document-types'
  if (kind === 'company') return `/partners/${id}`
  if (kind === 'values') return `/partners/${id.split(':')[0]}?tab=dossier`
  if (kind === 'approval' || kind === 'expenses' || kind === 'impl') return `/programs/x/applications/${id}?tab=expenses`
  if (kind === 'guide') return null
  return trdrId ? `/partners/${trdrId}` : null
}
