import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * Ε3 — «Κατάσταση Οικονομικών Στοιχείων από Επιχειρηματική Δραστηριότητα». (Plain module.)
 *
 * Κύκλος εργασιών κατά τα ΕΛΠ (ν.4308/2014): Πίνακας Δ, γραμμή Δ1 «Πωλήσεις αγαθών
 * και παροχή υπηρεσιών», κωδ. 500 (Σύνολο) = 100 εμπορική + 200 παραγωγική + 300
 * αγροτική + 400 υπηρεσίες. Όταν ανεβαίνει Ε3:
 *   1. ανάγνωση με Gemini απευθείας από το PDF/εικόνα (ψηφιακό ή σαρωμένο)·
 *   2. εγγραφή χρήσης στον Οδηγό Εντύπων «Ε3» + τιμές ανά έτος (TrdrFinancialValue)·
 *      και ό,τι δίνει ο πίνακας «Κριτήρια μεγέθους» για προηγούμενα έτη (χωρίς να
 *      πατά τιμές που ήρθαν από το Ε3 εκείνου του έτους)·
 *   3. κύκλος εργασιών στην καρτέλα = ο πιο πρόσφατος (νεότερη χρήση υπερισχύει·
 *      η χειροκίνητη διόρθωση κρατιέται μέχρι να ανέβει νεότερο Ε3).
 */

export const E3_TEMPLATE_CODE = 'E3'
export const E3_DOC_TYPE_NAME = 'Ε3 — Κατάσταση Οικονομικών Στοιχείων'

export type E3Data = {
  year: number | null
  afm: string | null
  companyName: string | null
  /** κωδ. 500 */
  turnover: number | null
  sales: { commercial: number | null; production: number | null; agricultural: number | null; services: number | null }
  /** κωδ. 521 */
  grossProfit: number | null
  /** κωδ. 524 (EBITDA) */
  ebitda: number | null
  /** κωδ. 525 */
  depreciation: number | null
  /** κωδ. 526 (EBIT) */
  ebit: number | null
  /** κωδ. 529 */
  profitBeforeTax: number | null
  /** κωδ. 025 / 026 */
  persons: number | null
  salaried: number | null
  /** «Κριτήρια μεγέθους» — τιμές ανά έτος (μπορεί να περιέχουν προηγούμενα έτη). */
  sizeCriteria: { year: number; turnover: number | null; totalAssets: number | null; avgStaff: number | null }[]
}

/** Ελληνική μορφή ποσών: «1.396.887 ,2» / «2.024.551,16» / «1396887.20». */
export function parseGreekAmount(v: unknown): number | null {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[€\s]/g, '')
  if (!s || s === '-') return null
  const neg = /^\(.*\)$/.test(s) || s.startsWith('-')
  s = s.replace(/[()\-]/g, '')
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  else if ((s.match(/\./g) ?? []).length > 1) s = s.replace(/\./g, '')
  const n = Number(s)
  return Number.isFinite(n) ? (neg ? -n : n) : null
}

export async function extractE3WithAi(file: { base64: string; mimeType: string }, opts: { refId?: string; userId?: string } = {}): Promise<E3Data | null> {
  const system = [
    'Διαβάζεις ελληνικό έντυπο Ε3 «Κατάσταση Οικονομικών Στοιχείων από Επιχειρηματική Δραστηριότητα» της ΑΑΔΕ.',
    'Εντόπισε τα ποσά ΜΕ ΒΑΣΗ ΤΟΥΣ ΚΩΔΙΚΟΥΣ του εντύπου (Πίνακας Δ, στήλη «Σύνολο» για 5xx):',
    '500 = Πωλήσεις αγαθών και παροχή υπηρεσιών (Σύνολο) — ο κύκλος εργασιών·',
    '100 εμπορική, 200 παραγωγική, 300 αγροτική, 400 παροχή υπηρεσιών (ίδια γραμμή Δ1)·',
    '521 μικτό κέρδος, 524 αποτελέσματα προ φόρων/τόκων/αποσβέσεων (EBITDA), 525 αποσβέσεις, 526 EBIT, 529 αποτελέσματα προ φόρων.',
    'Πίνακας Α: 020 ΑΦΜ, επωνυμία. Φορολογικό έτος (002). Πίνακας Β: 025 αριθμός απασχολούμενων ατόμων, 026 αριθμός μισθωτών,',
    'και ο πίνακας «Κριτήρια Μεγέθους Οντοτήτων» (ανά έτος: κύκλος εργασιών, σύνολο ενεργητικού, μέσος όρος προσωπικού).',
    'Τα ποσά γράφονται ελληνικά (π.χ. «1.396.887 ,2» = 1396887.20). Επέστρεψε αριθμούς με τελεία δεκαδικών, null αν κενό.',
    'ΑΥΣΤΗΡΑ JSON: {"year":έτος,"afm":"...","companyName":"...","k500":n,"k100":n,"k200":n,"k300":n,"k400":n,"k521":n,"k524":n,"k525":n,"k526":n,"k529":n,"k025":n,"k026":n,',
    '"sizeCriteria":[{"year":έτος,"turnover":n,"totalAssets":n,"avgStaff":n}]}',
  ].join(' ')
  const res = await geminiGenerate({
    parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: 'Εξήγαγε τα στοιχεία του Ε3.' }],
    systemInstruction: system,
    json: true,
    scope: 'OCR_VISION',
    refType: 'e3',
    refId: opts.refId,
    userId: opts.userId,
  })
  const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
  const n = parseGreekAmount
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const year = typeof p.year === 'number' ? p.year : n(p.year)
  const crit = Array.isArray(p.sizeCriteria) ? (p.sizeCriteria as Record<string, unknown>[]) : []
  const data: E3Data = {
    year: year != null ? Math.round(year) : null,
    afm: s(p.afm)?.replace(/\D/g, '') || null,
    companyName: s(p.companyName),
    turnover: n(p.k500),
    sales: { commercial: n(p.k100), production: n(p.k200), agricultural: n(p.k300), services: n(p.k400) },
    grossProfit: n(p.k521),
    ebitda: n(p.k524),
    depreciation: n(p.k525),
    ebit: n(p.k526),
    profitBeforeTax: n(p.k529),
    persons: n(p.k025),
    salaried: n(p.k026),
    sizeCriteria: crit
      .map(c => ({ year: Math.round(n(c.year) ?? 0), turnover: n(c.turnover), totalAssets: n(c.totalAssets), avgStaff: n(c.avgStaff) }))
      .filter(c => c.year > 1990),
  }
  // Αν λείπει ο 500 αλλά υπάρχουν οι επιμέρους πωλήσεις → άθροισμα.
  if (data.turnover == null) {
    const parts = Object.values(data.sales).filter((x): x is number => x != null)
    if (parts.length) data.turnover = Math.round(parts.reduce((a, b) => a + b, 0) * 100) / 100
  }
  return data.turnover != null || data.profitBeforeTax != null ? data : null
}

const E3_FIELDS = [
  { fieldKey: 'e3_xrisi', label: 'Φορολογικό έτος', valueType: 'INTEGER' as const, order: 0, aiHint: 'κωδ. 002' },
  { fieldKey: 'e3_kyklos_ergasion', label: 'Κύκλος εργασιών (κωδ. 500)', valueType: 'CURRENCY' as const, order: 1, required: true, aiHint: 'Πίνακας Δ — Δ1 Πωλήσεις αγαθών και παροχή υπηρεσιών, στήλη Σύνολο (κωδ. 500)' },
  { fieldKey: 'e3_k100', label: 'Πωλήσεις εμπορικής δραστηριότητας (100)', valueType: 'CURRENCY' as const, order: 2 },
  { fieldKey: 'e3_k200', label: 'Πωλήσεις παραγωγικής δραστηριότητας (200)', valueType: 'CURRENCY' as const, order: 3 },
  { fieldKey: 'e3_k300', label: 'Πωλήσεις αγροτικής δραστηριότητας (300)', valueType: 'CURRENCY' as const, order: 4 },
  { fieldKey: 'e3_k400', label: 'Παροχή υπηρεσιών (400)', valueType: 'CURRENCY' as const, order: 5 },
  { fieldKey: 'e3_mikto_kerdos', label: 'Μικτό κέρδος (521)', valueType: 'CURRENCY' as const, order: 6 },
  { fieldKey: 'e3_ebitda', label: 'Αποτελέσματα προ φόρων, τόκων & αποσβέσεων — EBITDA (524)', valueType: 'CURRENCY' as const, order: 7 },
  { fieldKey: 'e3_apostheseis', label: 'Αποσβέσεις (525)', valueType: 'CURRENCY' as const, order: 8 },
  { fieldKey: 'e3_ebit', label: 'Αποτελέσματα προ φόρων & τόκων — EBIT (526)', valueType: 'CURRENCY' as const, order: 9 },
  { fieldKey: 'e3_apotelesmata_pro_foron', label: 'Αποτελέσματα προ φόρων (529)', valueType: 'CURRENCY' as const, order: 10 },
  { fieldKey: 'e3_atoma', label: 'Απασχολούμενα άτομα (025)', valueType: 'INTEGER' as const, order: 11 },
  { fieldKey: 'e3_misthotoi', label: 'Μισθωτοί (026)', valueType: 'INTEGER' as const, order: 12 },
  { fieldKey: 'e3_synolo_energitikou', label: 'Σύνολο ενεργητικού (κριτήρια μεγέθους)', valueType: 'CURRENCY' as const, order: 13 },
  { fieldKey: 'e3_mesos_oros_prosopikou', label: 'Μέσος όρος προσωπικού (κριτήρια μεγέθους)', valueType: 'NUMBER' as const, order: 14 },
]

/** Εξασφαλίζει τύπο δικαιολογητικού «Ε3» + Οδηγό Εντύπου «Ε3» (ξαναχρησιμοποιεί τον υπάρχοντα). */
export async function ensureE3Template(): Promise<{ templateId: string; documentTypeId: string }> {
  const docType =
    (await prisma.documentType.findFirst({ where: { name: E3_DOC_TYPE_NAME }, select: { id: true } })) ??
    (await prisma.documentType.create({
      data: { name: E3_DOC_TYPE_NAME, expires: false, notes: 'Ε3 οποιουδήποτε φορολογικού έτους — αυτόματη ανάγνωση κύκλου εργασιών & αποτελεσμάτων.' },
      select: { id: true },
    }))
  let tpl = await prisma.taxFormTemplate.findFirst({ where: { code: { in: [E3_TEMPLATE_CODE, 'Ε3'] } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!tpl) {
    tpl = await prisma.taxFormTemplate.create({
      data: { code: E3_TEMPLATE_CODE, name: 'Έντυπο Ε3', status: 'READY', documentTypeId: docType.id },
      select: { id: true },
    })
  }
  await prisma.taxFormTemplate.update({
    where: { id: tpl.id },
    data: {
      status: 'READY',
      year: null,
      documentTypeId: docType.id,
      description: 'Κατάσταση Οικονομικών Στοιχείων — κύκλος εργασιών (κωδ. 500 κατά ΕΛΠ), αποτελέσματα, προσωπικό. Αυτόματη ανάγνωση στο ανέβασμα· μία εγγραφή ανά φορολογικό έτος.',
    },
  })
  const have = new Set((await prisma.taxFormTemplateField.findMany({ where: { templateId: tpl.id }, select: { fieldKey: true } })).map(f => f.fieldKey))
  for (const f of E3_FIELDS) {
    if (!have.has(f.fieldKey)) await prisma.taxFormTemplateField.create({ data: { templateId: tpl.id, kind: 'SINGLE', ...f } })
  }
  return { templateId: tpl.id, documentTypeId: docType.id }
}

/** Ε3 = ο γενικός τύπος ή οποιοσδήποτε τύπος με «Ε3» στο όνομα (π.χ. «Έντυπο Ε3 2024»). */
export function isE3TypeName(name: string | null | undefined): boolean {
  return !!name && /(^|[^Α-ΩA-Z0-9])(Ε3|E3)([^0-9]|$)/i.test(name)
}

export type E3Applied = { year: number; turnover: number | null; updatedCompany: boolean; afmMismatch: boolean; years: number[] }

export async function applyE3ToTrdr(input: {
  trdrId: string
  data: E3Data
  storageKey: string
  name: string
  userId?: string | null
  model?: string | null
}): Promise<E3Applied> {
  const { templateId } = await ensureE3Template()
  const d = input.data
  const trdr = await prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { AFM: true, appRevenueYear: true } })
  const year = d.year ?? new Date().getFullYear() - 1
  const afmMismatch = !!(d.afm && trdr?.AFM && d.afm !== trdr.AFM)
  // Έγγραφο άλλης εταιρίας → ΔΕΝ γράφεται τίποτα, μόνο προειδοποίηση.
  if (afmMismatch) return { year, turnover: d.turnover, updatedCompany: false, afmMismatch, years: [] }

  const values: Record<string, number | null> = {
    e3_xrisi: year,
    e3_kyklos_ergasion: d.turnover,
    e3_k100: d.sales.commercial,
    e3_k200: d.sales.production,
    e3_k300: d.sales.agricultural,
    e3_k400: d.sales.services,
    e3_mikto_kerdos: d.grossProfit,
    e3_ebitda: d.ebitda,
    e3_apostheseis: d.depreciation,
    e3_ebit: d.ebit,
    e3_apotelesmata_pro_foron: d.profitBeforeTax,
    e3_atoma: d.persons,
    e3_misthotoi: d.salaried,
  }
  const sameYearCrit = d.sizeCriteria.find(c => c.year === year)
  if (sameYearCrit) {
    values.e3_synolo_energitikou = sameYearCrit.totalAssets
    values.e3_mesos_oros_prosopikou = sameYearCrit.avgStaff
  }

  const record = await prisma.trdrFormRecord.create({
    data: {
      trdrId: input.trdrId, templateId, year, name: input.name, storageKey: input.storageKey, status: 'EXTRACTED',
      extractedData: Object.fromEntries(Object.entries(values).map(([k, v]) => [k, v != null ? String(v) : null])),
      model: input.model ?? null, createdById: input.userId ?? null,
    },
    select: { id: true },
  })
  const typeOf = (k: string) => (k === 'e3_xrisi' || k === 'e3_atoma' || k === 'e3_misthotoi' ? 'INTEGER' : k === 'e3_mesos_oros_prosopikou' ? 'NUMBER' : 'CURRENCY') as 'INTEGER' | 'NUMBER' | 'CURRENCY'
  const years = new Set<number>([year])
  for (const [fieldKey, value] of Object.entries(values)) {
    if (value == null) continue
    await prisma.trdrFinancialValue.upsert({
      where: { trdrId_fieldKey_year: { trdrId: input.trdrId, fieldKey, year } },
      create: { trdrId: input.trdrId, fieldKey, templateId, year, value, kind: 'SINGLE', valueType: typeOf(fieldKey), source: 'OCR', sourceRecordId: record.id },
      update: { templateId, value, valueType: typeOf(fieldKey), source: 'OCR', sourceRecordId: record.id, verified: false },
    })
  }
  // «Κριτήρια μεγέθους»: προηγούμενα έτη — μόνο αν δεν υπάρχει ήδη τιμή εκείνου του έτους.
  for (const c of d.sizeCriteria) {
    if (c.year === year) continue
    const pairs: [string, number | null][] = [['e3_kyklos_ergasion', c.turnover], ['e3_synolo_energitikou', c.totalAssets], ['e3_mesos_oros_prosopikou', c.avgStaff]]
    for (const [fieldKey, value] of pairs) {
      if (value == null) continue
      const exists = await prisma.trdrFinancialValue.findUnique({ where: { trdrId_fieldKey_year: { trdrId: input.trdrId, fieldKey, year: c.year } }, select: { id: true } })
      if (exists) continue
      await prisma.trdrFinancialValue.create({
        data: { trdrId: input.trdrId, fieldKey, templateId, year: c.year, value, kind: 'SINGLE', valueType: typeOf(fieldKey), source: 'OCR', sourceRecordId: record.id, note: `Από τα κριτήρια μεγέθους του Ε3 ${year}` },
      })
      years.add(c.year)
    }
  }

  // Κύκλος εργασιών στην καρτέλα = ο πιο πρόσφατος.
  let updatedCompany = false
  if (d.turnover != null && (trdr?.appRevenueYear == null || year >= trdr.appRevenueYear)) {
    await prisma.trdr.update({ where: { id: input.trdrId }, data: { appAnnualRevenue: d.turnover, appRevenueYear: year, appRevenueSource: 'E3' } })
    updatedCompany = true
  }
  return { year, turnover: d.turnover, updatedCompany, afmMismatch, years: [...years].sort() }
}
