import { prisma } from '@/lib/prisma'
import { periodLabel } from '@/lib/documents/series'

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
        id: true, title: true, status: true, referenceCode: true,
        expenseCats: { orderBy: { order: 'asc' }, select: { name: true, maxPercentage: true, maxAmount: true, minAmount: true } },
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
        p.expenseCats.length ? `Κατηγορίες δαπανών: ${p.expenseCats.map(c => [c.name, c.maxPercentage != null ? `έως ${c.maxPercentage}%` : null, c.maxAmount != null ? `έως ${eur(c.maxAmount)}` : null].filter(Boolean).join(' ')).join('· ')}` : null,
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
      out.push({
        key: `mem:values:${c.id}:${(g.tpl + g.year).replace(/[^a-z0-9α-ω]+/gi, '-').slice(0, 60)}`, title: `${g.tpl} ${g.year} — ${c.NAME}`, category: 'memory-values', trdrId: c.id, programTitle: null, docType: g.tpl, year: g.year,
        tags: ['τιμές', g.tpl, String(g.year), c.AFM ? `ΑΦΜ ${c.AFM}` : null].filter(Boolean) as string[],
        lines: [`Αποθηκευμένες τιμές «${g.tpl}» ${g.year} της εταιρίας ${c.NAME}${c.AFM ? ` (ΑΦΜ ${c.AFM})` : ''}:`, ...rows.map(([when, a]) => `${when}: ${a.join('; ')}`)].join('\n').slice(0, CAP * 2).split('\n'),
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
  return out
}

/** Σύνδεσμος για εγγραφή γνώσης (για τις πηγές των απαντήσεων). */
export function knowledgeHref(key: string, trdrId: string | null): string | null {
  const [, kind, id] = key.split(':')
  if (kind === 'program') return `/programs/${id}`
  if (kind === 'type') return '/document-types'
  if (kind === 'company') return `/partners/${id}`
  if (kind === 'values') return `/partners/${id.split(':')[0]}?tab=dossier`
  if (kind === 'approval' || kind === 'expenses') return `/programs/x/applications/${id}?tab=expenses`
  return trdrId ? `/partners/${trdrId}` : null
}
