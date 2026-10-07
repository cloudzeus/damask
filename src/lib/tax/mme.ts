import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { parseGreekAmount } from '@/lib/tax/e3'

/**
 * Δήλωση ΜΜΕ — «Υπόδειγμα δήλωσης: Στοιχεία σχετικά με την ιδιότητα ΜΜΕ» (Παράρτημα Ι
 * ΕΚ 651/2014). (Plain module.) Είναι το ΕΠΙΣΗΜΟ έγγραφο (συνήθως με ψηφιακή βεβαίωση
 * gov.gr) που υποβάλλεται στο ΟΠΣΚΕ — άρα για το έτος αναφοράς του ΥΠΕΡΙΣΧΥΕΙ των
 * τιμών από Ε3 (κύκλος εργασιών) και μισθοδοσία (ΕΜΕ). Όταν ανεβαίνει:
 *   1. ανάγνωση με Gemini (περίοδος, ΕΜΕ, κύκλος εργασιών, ισολογισμός — μετατροπή από
 *      «χιλιάδες ευρώ», τύπος επιχείρησης, υπογράφων, κωδικός docs.gov.gr)·
 *   2. εγγραφή στον Οδηγό «Δήλωση ΜΜΕ» + τιμές έτους (eme, mme_*) ως επαληθευμένες·
 *   3. κύκλος εργασιών/ΕΜΕ εταιρίας από αυτή για το έτος της (νεότερο ή ίδιο έτος).
 * Οι τύποι «Υπόδειγμα Β: Δήλωση ΜΜΕ», «Υπεύθυνη Δήλωση ΜΜΕ», «Δήλωση ΜΜΕ» θεωρούνται ισοδύναμοι.
 */

export const MME_TEMPLATE_CODE = 'ΜΜΕ'
export const MME_DOC_TYPE_NAME = 'Δήλωση ΜΜΕ'

export type MmeData = {
  year: number | null
  afm: string | null
  companyName: string | null
  eme: number | null
  /** σε ευρώ (ήδη μετατραπέν από χιλιάδες αν χρειαζόταν) */
  turnover: number | null
  balanceSheet: number | null
  enterpriseType: 'INDEPENDENT' | 'PARTNER' | 'LINKED' | null
  categoryChanged: boolean | null
  signer: string | null
  signedAt: string | null
  govgrCode: string | null
}

const TYPE_LABEL = { INDEPENDENT: 'Ανεξάρτητη', PARTNER: 'Συνεργαζόμενη', LINKED: 'Συνδεδεμένη' } as const

/** Κατηγορία επιχείρησης κατά το Παράρτημα Ι του ΕΚ 651/2014. */
export function smeCategory(eme: number | null, turnover: number | null, balance: number | null): { code: 1 | 2 | 3 | 4; label: string } | null {
  if (eme == null) return null
  const fin = (limitT: number, limitB: number) => (turnover != null && turnover <= limitT) || (balance != null && balance <= limitB) || (turnover == null && balance == null)
  if (eme < 10 && fin(2e6, 2e6)) return { code: 1, label: 'Πολύ μικρή' }
  if (eme < 50 && fin(10e6, 10e6)) return { code: 2, label: 'Μικρή' }
  if (eme < 250 && fin(50e6, 43e6)) return { code: 3, label: 'Μεσαία' }
  return { code: 4, label: 'Μεγάλη' }
}

/** Ο «Κωδικός εγγράφου» docs.gov.gr από το ψηφιακό κείμενο (ακριβής — το OCR μπερδεύει O/0). */
export function govgrCodeFromText(text: string | null | undefined): string | null {
  return text ? /Κωδικός εγγράφου\s*:\s*([A-Za-z0-9_-]{10,})/.exec(text)?.[1] ?? null : null
}

export async function extractMmeWithAi(file: { base64: string; mimeType: string }, opts: { refId?: string; userId?: string } = {}): Promise<MmeData | null> {
  const system = [
    'Διαβάζεις ελληνική «Δήλωση — Στοιχεία σχετικά με την ιδιότητα ΜΜΕ» (Παράρτημα Ι ΕΚ 651/2014), πιθανώς με ψηφιακή βεβαίωση gov.gr.',
    'Εξήγαγε: περίοδο αναφοράς (έτος), ΑΦΜ (αριθμ. μητρώου ΦΠΑ) & επωνυμία επιχείρησης, Αριθμό απασχολουμένων (ΕΜΕ), Κύκλο εργασιών, Σύνολο ισολογισμού,',
    'αν τα ποσά είναι «σε χιλιάδες ευρώ» (σημείωση (**)), τον τύπο επιχείρησης που είναι σημειωμένος (Ανεξάρτητη/Συνεργαζόμενη/Συνδεδεμένη),',
    'αν σημειώθηκε «Ναι» στη μεταβολή κατηγορίας, τον υπογράφοντα, την ημερομηνία υπογραφής/βεβαίωσης και τον «Κωδικό εγγράφου» docs.gov.gr.',
    'Αριθμοί όπως γράφονται (π.χ. «1.350,70»). ΑΥΣΤΗΡΑ JSON:',
    '{"year":n,"afm":"9 ψηφία","companyName":"...","eme":"...","turnover":"...","balanceSheet":"..." ή null,"amountsInThousands":true|false,',
    '"enterpriseType":"INDEPENDENT"|"PARTNER"|"LINKED"|null,"categoryChanged":true|false|null,"signer":"...","signedAt":"YYYY-MM-DD","govgrCode":"..." ή null}',
  ].join(' ')
  const res = await geminiGenerate({
    parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: 'Εξήγαγε τα στοιχεία της δήλωσης ΜΜΕ.' }],
    systemInstruction: system,
    json: true,
    scope: 'OCR_VISION',
    refType: 'mme',
    refId: opts.refId,
    userId: opts.userId,
  })
  const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
  const s = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== '-' ? v.trim() : null)
  const k = p.amountsInThousands === true ? 1000 : 1
  const amt = (v: unknown) => { const n = parseGreekAmount(v); return n != null ? Math.round(n * k * 100) / 100 : null }
  const year = parseGreekAmount(p.year)
  const type = p.enterpriseType === 'INDEPENDENT' || p.enterpriseType === 'PARTNER' || p.enterpriseType === 'LINKED' ? p.enterpriseType : null
  const data: MmeData = {
    year: year != null ? Math.round(year) : null,
    afm: s(p.afm)?.replace(/\D/g, '') || null,
    companyName: s(p.companyName),
    eme: parseGreekAmount(p.eme),
    turnover: amt(p.turnover),
    balanceSheet: amt(p.balanceSheet),
    enterpriseType: type,
    categoryChanged: typeof p.categoryChanged === 'boolean' ? p.categoryChanged : null,
    signer: s(p.signer),
    signedAt: s(p.signedAt),
    govgrCode: s(p.govgrCode),
  }
  return data.eme != null || data.turnover != null ? data : null
}

const MME_FIELDS = [
  { fieldKey: 'mme_periodos', label: 'Περίοδος αναφοράς (έτος)', valueType: 'INTEGER' as const, order: 0 },
  { fieldKey: 'eme', label: 'Αριθμός απασχολουμένων (ΕΜΕ)', valueType: 'NUMBER' as const, order: 1, required: true },
  { fieldKey: 'mme_kyklos_ergasion', label: 'Κύκλος εργασιών (€)', valueType: 'CURRENCY' as const, order: 2, required: true, aiHint: 'Συχνά «σε χιλιάδες ευρώ» — αποθηκεύεται σε ευρώ.' },
  { fieldKey: 'mme_synolo_isologismou', label: 'Σύνολο ισολογισμού (€)', valueType: 'CURRENCY' as const, order: 3 },
  { fieldKey: 'mme_katigoria', label: 'Κατηγορία ΜΜΕ (1 πολύ μικρή · 2 μικρή · 3 μεσαία · 4 μεγάλη)', valueType: 'INTEGER' as const, order: 4 },
]

/** Ισοδύναμοι τύποι δικαιολογητικού για τη Δήλωση ΜΜΕ (όπως τους έχουν ορίσει τα προγράμματα). */
export function isMmeTypeName(name: string | null | undefined): boolean {
  return !!name && /(δήλωση|δηλωση)\s+(ιδιότητας\s+)?ΜΜΕ|ιδιότητα\s+ΜΜΕ/i.test(name)
}

export async function ensureMmeTemplate(): Promise<{ templateId: string; documentTypeId: string }> {
  const docType =
    (await prisma.documentType.findFirst({ where: { name: MME_DOC_TYPE_NAME }, select: { id: true } })) ??
    (await prisma.documentType.create({ data: { name: MME_DOC_TYPE_NAME, expires: false, notes: 'Στοιχεία ιδιότητας ΜΜΕ (Παράρτημα Ι ΕΚ 651/2014) — επίσημο έγγραφο ΟΠΣΚΕ.' }, select: { id: true } }))
  let tpl = await prisma.taxFormTemplate.findFirst({ where: { code: { in: [MME_TEMPLATE_CODE, 'MME'] } }, orderBy: { createdAt: 'asc' }, select: { id: true } })
  if (!tpl) {
    tpl = await prisma.taxFormTemplate.create({
      data: {
        code: MME_TEMPLATE_CODE,
        name: 'Δήλωση ΜΜΕ — Στοιχεία ιδιότητας ΜΜΕ',
        description: 'Επίσημη δήλωση (ΟΠΣΚΕ) ανά περίοδο αναφοράς: ΕΜΕ, κύκλος εργασιών, σύνολο ισολογισμού, τύπος & κατηγορία επιχείρησης, βεβαίωση gov.gr. Υπερισχύει Ε3/μισθοδοσίας για το ίδιο έτος.',
        status: 'READY',
        documentTypeId: docType.id,
      },
      select: { id: true },
    })
  }
  const have = new Set((await prisma.taxFormTemplateField.findMany({ where: { templateId: tpl.id }, select: { fieldKey: true } })).map(f => f.fieldKey))
  for (const f of MME_FIELDS) {
    if (!have.has(f.fieldKey)) await prisma.taxFormTemplateField.create({ data: { templateId: tpl.id, kind: 'SINGLE', ...f } })
  }
  return { templateId: tpl.id, documentTypeId: docType.id }
}

export type MmeApplied = {
  year: number
  eme: number | null
  turnover: number | null
  category: string | null
  official: boolean
  updatedCompany: boolean
  afmMismatch: boolean
}

export async function applyMmeToTrdr(input: {
  trdrId: string
  data: MmeData
  storageKey: string
  name: string
  userId?: string | null
  model?: string | null
}): Promise<MmeApplied> {
  const { templateId } = await ensureMmeTemplate()
  const d = input.data
  const trdr = await prisma.trdr.findUnique({
    where: { id: input.trdrId },
    select: { AFM: true, appRevenueYear: true, appRevenueSource: true, appEmployeesYear: true, appEmployeesSource: true },
  })
  const year = d.year ?? new Date().getFullYear() - 1
  const cat = smeCategory(d.eme, d.turnover, d.balanceSheet)
  const official = !!d.govgrCode
  const afmMismatch = !!(d.afm && trdr?.AFM && d.afm !== trdr.AFM)
  if (afmMismatch) return { year, eme: d.eme, turnover: d.turnover, category: cat?.label ?? null, official, updatedCompany: false, afmMismatch }

  const record = await prisma.trdrFormRecord.create({
    data: {
      trdrId: input.trdrId, templateId, year, name: input.name, storageKey: input.storageKey, status: 'EXTRACTED',
      extractedData: {
        mme_periodos: String(year),
        eme: d.eme != null ? String(d.eme) : null,
        mme_kyklos_ergasion: d.turnover != null ? String(d.turnover) : null,
        mme_synolo_isologismou: d.balanceSheet != null ? String(d.balanceSheet) : null,
        mme_katigoria: cat ? String(cat.code) : null,
        typos_epixeirisis: d.enterpriseType ? TYPE_LABEL[d.enterpriseType] : null,
        metavoli_katigorias: d.categoryChanged,
        ypografon: d.signer,
        imerominia: d.signedAt,
        govgr_kodikos: d.govgrCode,
      },
      model: input.model ?? null, createdById: input.userId ?? null,
    },
    select: { id: true },
  })
  const note = official ? `Επίσημη δήλωση ΜΜΕ — docs.gov.gr ${d.govgrCode}` : 'Δήλωση ΜΜΕ'
  const vals: [string, number | null, 'NUMBER' | 'CURRENCY' | 'INTEGER', string | null][] = [
    ['mme_periodos', year, 'INTEGER', null],
    ['eme', d.eme, 'NUMBER', null],
    ['mme_kyklos_ergasion', d.turnover, 'CURRENCY', null],
    ['mme_synolo_isologismou', d.balanceSheet, 'CURRENCY', null],
    ['mme_katigoria', cat?.code ?? null, 'INTEGER', cat?.label ?? null],
  ]
  for (const [fieldKey, value, valueType, valueText] of vals) {
    if (value == null) continue
    // Επίσημη τιμή του έτους: υπερισχύει (π.χ. το eme της μισθοδοσίας ίδιου έτους) και σημειώνεται επαληθευμένη.
    await prisma.trdrFinancialValue.upsert({
      where: { trdrId_fieldKey_year: { trdrId: input.trdrId, fieldKey, year } },
      create: { trdrId: input.trdrId, fieldKey, templateId, year, value, valueText, kind: 'SINGLE', valueType, source: 'OCR', sourceRecordId: record.id, verified: official, note },
      update: { templateId, value, valueText, valueType, source: 'OCR', sourceRecordId: record.id, verified: official, note },
    })
  }

  // Στοιχεία εταιρίας: νεότερο έτος, ή ίδιο έτος (η επίσημη δήλωση υπερισχύει Ε3/ΕΜΕ/χειροκίνητου).
  const patch: Record<string, unknown> = {}
  if (d.turnover != null && (trdr?.appRevenueYear == null || year >= trdr.appRevenueYear)) {
    Object.assign(patch, { appAnnualRevenue: d.turnover, appRevenueYear: year, appRevenueSource: 'MME' })
  }
  if (d.eme != null && (trdr?.appEmployeesYear == null || year >= trdr.appEmployeesYear)) {
    Object.assign(patch, { appEme: d.eme, appEmployees: Math.round(d.eme), appEmployeesYear: year, appEmployeesSource: 'MME' })
  }
  if (Object.keys(patch).length) await prisma.trdr.update({ where: { id: input.trdrId }, data: patch })
  return { year, eme: d.eme, turnover: d.turnover, category: cat?.label ?? null, official, updatedCompany: Object.keys(patch).length > 0, afmMismatch }
}
