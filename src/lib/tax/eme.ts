import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * ΕΜΕ — «Πίνακας ταξινόμησης οντοτήτων βάσει μεγέθους» (ετήσιες μονάδες εργασίας).
 * (Plain module.) Όταν ανεβαίνει τέτοιο δικαιολογητικό:
 *   1. ανάγνωση: ακριβής parser στο ψηφιακό κείμενο, αλλιώς Gemini στο PDF/εικόνα·
 *   2. αποθήκευση εγγραφής ανά χρήση στον «Οδηγό Εντύπων» ΕΜΕ (TrdrFormRecord) +
 *      τιμές eme / eme_plires / eme_merikis / eme_ergazomenoi (TrdrFinancialValue —
 *      το `eme` το ελέγχουν ήδη τα προγράμματα έναντι «Ελάχιστες ΕΜΕ»)·
 *   3. ενημέρωση εργαζομένων της εταιρίας (appEmployees/appEme) — εκτός αν υπάρχει
 *      ήδη νεότερη χρήση· η χειροκίνητη διόρθωση ισχύει μέχρι να ανέβει νεότερο ΕΜΕ.
 */

export const EME_TEMPLATE_CODE = 'EME'
export const EME_DOC_TYPE_NAME = 'ΕΜΕ — Πίνακας ταξινόμησης οντοτήτων βάσει μεγέθους'

export type EmeEmployee = {
  code: string | null
  lastName: string
  firstName: string
  afm: string | null
  months: number | null
  average: number | null
  category: 'FULL' | 'PART'
}
export type EmeData = {
  year: number | null
  companyName: string | null
  afm: string | null
  totalEme: number | null
  fullTimeEme: number | null
  partTimeEme: number | null
  employees: EmeEmployee[]
}

const num = (s: string | null | undefined): number | null => {
  if (s == null) return null
  const n = Number(String(s).trim().replace(/\./g, '').replace(',', '.'))
  return Number.isFinite(n) ? n : null
}

/** Ακριβής ανάγνωση από ψηφιακό κείμενο (μορφή «Πίνακα ταξινόμησης» των μισθοδοσιών).
 * Δουλεύει και σε «επίπεδο» κείμενο (pdfjs ενώνει τα κομμάτια με κενό, χωρίς γραμμές). */
export function parseEmeText(raw: string): EmeData | null {
  const text = raw.replace(/\s+/g, ' ')
  if (!/ταξινόμησης|Μέσου Όρου Εργαζομένων|Μέσος όρος/i.test(text)) return null
  const year = num(/Χρήση\s*:?\s*(\d{4})/i.exec(text)?.[1] ?? null)
  const afm = /ΑΦΜ\s*:\s*(\d{9})/.exec(text)?.[1] ?? null
  const companyName = /Εταιρ[ίι]α\s*:\s*(.+?)\s+(?:ΑΦΜ|Χρήση)\s*:/i.exec(text)?.[1]?.trim() ?? null
  const total = num(/Σύνολο Μέσου Όρου Εργαζομένων Εταιρ[ίι]ας\s*([\d.,]+)/i.exec(text)?.[1])
  const catTotals = [...text.matchAll(/Σύνολο Μέσου Όρου Εργαζομένων Κατηγορίας\s*([\d.,]+)/gi)].map(m => num(m[1]) ?? 0)
  // Θέσεις των επικεφαλίδων κατηγορίας → σε ποια κατηγορία ανήκει κάθε εργαζόμενος.
  const cats = [...text.matchAll(/Κατηγορία εργαζ[οό]μ[εέ]νων\s*:\s*([^\d]{0,40})/gi)].map(m => ({ at: m.index ?? 0, part: /μερικ/i.test(m[1]) }))
  const catAt = (pos: number): 'FULL' | 'PART' => {
    let c: 'FULL' | 'PART' = 'FULL'
    for (const h of cats) if (h.at <= pos) c = h.part ? 'PART' : 'FULL'
    return c
  }
  const employees: EmeEmployee[] = []
  // Δύο σειρές στηλών ανάλογα με τον extractor:
  //   κωδικός ΕΠΩΝΥΜΟ ΟΝΟΜΑ ΑΦΜ(9) μήνες μ.ό.   ή   κωδικός ΕΠΩΝΥΜΟ ΟΝΟΜΑ μήνες μ.ό. ΑΦΜ(9)
  const rowRe = /(?:^|\s)(\d{3,6})\s+([^\d]+?)\s+(?:(\d{9})\s+(\d{1,2})\s+(\d+[.,]\d{1,2})|(\d{1,2})\s+(\d+[.,]\d{1,2})\s+(\d{9}))(?=\s|$)/g
  for (const m of text.matchAll(rowRe)) {
    const parts = m[2].trim().split(/\s+/)
    const afmV = m[3] ?? m[8]
    const months = m[4] ?? m[6]
    const avg = m[5] ?? m[7]
    employees.push({
      code: m[1],
      lastName: parts[0] ?? '',
      firstName: parts.slice(1).join(' '),
      afm: afmV,
      months: Number(months),
      average: num(avg),
      category: catAt(m.index ?? 0),
    })
  }
  if (employees.length === 0 && total == null) return null
  const sum = (c: 'FULL' | 'PART') => Math.round(employees.filter(e => e.category === c).reduce((a, e) => a + (e.average ?? 0), 0) * 100) / 100
  return {
    year,
    companyName,
    afm,
    totalEme: total ?? Math.round((sum('FULL') + sum('PART')) * 100) / 100,
    fullTimeEme: catTotals[0] ?? sum('FULL'),
    partTimeEme: catTotals.length > 1 ? catTotals[1] : sum('PART'),
    employees,
  }
}

/** Σαρωμένο/φωτογραφία ή ασυνήθιστη μορφή → Gemini διαβάζει το ίδιο το αρχείο. */
export async function extractEmeWithAi(file: { base64: string; mimeType: string }, opts: { refId?: string; userId?: string } = {}): Promise<EmeData | null> {
  const system = [
    'Διαβάζεις ελληνικό «Πίνακα ταξινόμησης οντοτήτων βάσει μεγέθους» (ΕΜΕ — μέσος όρος εργαζομένων).',
    'Επέστρεψε ΑΥΣΤΗΡΑ JSON: {"year":έτος χρήσης,"companyName":"...","afm":"9 ψηφία","totalEme":αριθμός,"fullTimeEme":αριθμός,"partTimeEme":αριθμός,',
    '"employees":[{"code":"...","lastName":"...","firstName":"...","afm":"...","months":αριθμός,"average":αριθμός,"category":"FULL"|"PART"}]}.',
    'Δεκαδικά με τελεία. Μερική απασχόληση → category PART. Μη παραλείψεις κανέναν εργαζόμενο.',
  ].join(' ')
  const res = await geminiGenerate({
    parts: [{ inlineData: { data: file.base64, mimeType: file.mimeType } }, { text: 'Εξήγαγε τα στοιχεία.' }],
    systemInstruction: system,
    json: true,
    scope: 'OCR_VISION',
    refType: 'eme',
    refId: opts.refId,
    userId: opts.userId,
  })
  const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
  const emps = Array.isArray(p.employees) ? (p.employees as Record<string, unknown>[]) : []
  const n = (v: unknown) => (typeof v === 'number' ? v : num(typeof v === 'string' ? v : null))
  const s = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : null)
  const data: EmeData = {
    year: n(p.year),
    companyName: s(p.companyName),
    afm: s(p.afm)?.replace(/\D/g, '') || null,
    totalEme: n(p.totalEme),
    fullTimeEme: n(p.fullTimeEme),
    partTimeEme: n(p.partTimeEme),
    employees: emps.map(e => ({
      code: s(e.code),
      lastName: s(e.lastName) ?? '',
      firstName: s(e.firstName) ?? '',
      afm: s(e.afm)?.replace(/\D/g, '') || null,
      months: n(e.months),
      average: n(e.average),
      category: e.category === 'PART' ? 'PART' : 'FULL',
    })),
  }
  return data.totalEme != null || data.employees.length ? data : null
}

const EME_FIELDS = [
  { fieldKey: 'eme_xrisi', label: 'Χρήση (έτος)', valueType: 'INTEGER' as const, kind: 'SINGLE' as const, order: 1, aiHint: 'Χρήση: ΕΕΕΕ' },
  { fieldKey: 'eme', label: 'Ετήσιες Μονάδες Εργασίας (ΕΜΕ)', valueType: 'NUMBER' as const, kind: 'SINGLE' as const, order: 0, required: true, aiHint: 'Σύνολο Μέσου Όρου Εργαζομένων Εταιρίας — δεκαδικός.' },
  { fieldKey: 'eme_plires', label: 'ΕΜΕ πλήρους απασχόλησης', valueType: 'NUMBER' as const, kind: 'SINGLE' as const, order: 2 },
  { fieldKey: 'eme_merikis', label: 'ΕΜΕ μερικής απασχόλησης', valueType: 'NUMBER' as const, kind: 'SINGLE' as const, order: 3 },
  {
    fieldKey: 'eme_ergazomenoi', label: 'Εργαζόμενοι', valueType: 'NUMBER' as const, kind: 'TABLE' as const, order: 4,
    config: { columns: ['Κωδικός', 'ΑΦΜ', 'Κατηγορία', 'Μήνες απασχόλησης', 'Μέσος όρος'] },
  },
]

/** Εξασφαλίζει τον (ΕΝΑΝ) τύπο δικαιολογητικού «ΕΜΕ» + Οδηγό Εντύπου «ΕΜΕ» (idempotent).
 * Ξαναχρησιμοποιεί τον υπάρχοντα τύπο «ΕΜΕ» (τον ζητούν ήδη προγράμματα) και τον
 * υπάρχοντα οδηγό (κωδ. «ΕΜΕ»)· προσθέτει μόνο όσα πεδία λείπουν. */
export async function ensureEmeTemplate(): Promise<{ templateId: string; documentTypeId: string }> {
  let tpl = await prisma.taxFormTemplate.findFirst({
    where: { code: { in: ['ΕΜΕ', EME_TEMPLATE_CODE] } },
    orderBy: { createdAt: 'asc' },
    select: { id: true, documentTypeId: true },
  })
  const docType =
    (tpl?.documentTypeId ? await prisma.documentType.findUnique({ where: { id: tpl.documentTypeId }, select: { id: true } }) : null) ??
    (await prisma.documentType.findFirst({ where: { name: { in: ['ΕΜΕ', EME_DOC_TYPE_NAME] } }, orderBy: { createdAt: 'asc' }, select: { id: true } })) ??
    (await prisma.documentType.create({ data: { name: 'ΕΜΕ', expires: false, notes: 'Πίνακας ταξινόμησης οντοτήτων βάσει μεγέθους — μέσος όρος εργαζομένων (ΕΜΕ) ανά χρήση.' }, select: { id: true } }))
  if (!tpl) {
    tpl = await prisma.taxFormTemplate.create({
      data: {
        code: 'ΕΜΕ',
        name: 'ΕΜΕ — Ετήσιες Μονάδες Εργασίας',
        description: 'Πίνακας ταξινόμησης οντοτήτων βάσει μεγέθους: εργαζόμενοι, μήνες απασχόλησης, μέσος όρος, ΕΜΕ πλήρους/μερικής και σύνολο. Αυτόματη ανάγνωση στο ανέβασμα.',
        status: 'READY',
        documentTypeId: docType.id,
      },
      select: { id: true, documentTypeId: true },
    })
  } else if (tpl.documentTypeId !== docType.id) {
    await prisma.taxFormTemplate.update({ where: { id: tpl.id }, data: { documentTypeId: docType.id } })
  }
  const have = new Set((await prisma.taxFormTemplateField.findMany({ where: { templateId: tpl.id }, select: { fieldKey: true } })).map(f => f.fieldKey))
  for (const f of EME_FIELDS) {
    if (!have.has(f.fieldKey)) await prisma.taxFormTemplateField.create({ data: { templateId: tpl.id, ...f } })
  }
  return { templateId: tpl.id, documentTypeId: docType.id }
}

/** Είναι ο τύπος δικαιολογητικού το ΕΜΕ; */
export async function isEmeDocumentType(documentTypeId: string | null | undefined): Promise<boolean> {
  if (!documentTypeId) return false
  const { documentTypeId: emeId } = await ensureEmeTemplate()
  return emeId === documentTypeId
}

/** Αποθηκεύει το ΕΜΕ ως εγγραφή χρήσης + τιμές και ενημερώνει τους εργαζόμενους της εταιρίας. */
export async function applyEmeToTrdr(input: {
  trdrId: string
  data: EmeData
  storageKey: string
  name: string
  userId?: string | null
  model?: string | null
}): Promise<{ year: number; eme: number | null; employees: number; updatedCompany: boolean; afmMismatch: boolean }> {
  const { templateId } = await ensureEmeTemplate()
  const trdr = await prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { AFM: true, appEmployeesYear: true } })
  const d = input.data
  const year = d.year ?? new Date().getFullYear() - 1
  const afmMismatch = !!(d.afm && trdr?.AFM && d.afm !== trdr.AFM)
  // Έγγραφο άλλης εταιρίας → ΔΕΝ γράφεται τίποτα, μόνο προειδοποίηση.
  if (afmMismatch) return { year, eme: d.totalEme, employees: d.employees.length, updatedCompany: false, afmMismatch }

  const table = {
    columns: ['Κωδικός', 'ΑΦΜ', 'Κατηγορία', 'Μήνες απασχόλησης', 'Μέσος όρος'],
    rows: d.employees.map(e => ({
      label: `${e.lastName} ${e.firstName}`.trim(),
      values: [e.code, e.afm, e.category === 'PART' ? 'Μερική' : 'Πλήρης', e.months != null ? String(e.months) : null, e.average != null ? String(e.average) : null],
    })),
  }
  const record = await prisma.trdrFormRecord.create({
    data: {
      trdrId: input.trdrId, templateId, year, name: input.name, storageKey: input.storageKey, status: 'EXTRACTED',
      extractedData: { eme_xrisi: String(year), eme: d.totalEme != null ? String(d.totalEme) : null, eme_plires: d.fullTimeEme != null ? String(d.fullTimeEme) : null, eme_merikis: d.partTimeEme != null ? String(d.partTimeEme) : null, eme_ergazomenoi: table },
      model: input.model ?? null, createdById: input.userId ?? null,
    },
    select: { id: true },
  })

  const upsertValue = (fieldKey: string, v: { value?: number | null; valueJson?: Prisma.InputJsonValue; kind?: 'SINGLE' | 'TABLE'; valueType: 'NUMBER' | 'INTEGER' }) =>
    prisma.trdrFinancialValue.upsert({
      where: { trdrId_fieldKey_year: { trdrId: input.trdrId, fieldKey, year } },
      create: { trdrId: input.trdrId, fieldKey, templateId, year, value: v.value ?? null, valueJson: v.valueJson, kind: v.kind ?? 'SINGLE', valueType: v.valueType, source: 'OCR', sourceRecordId: record.id },
      update: { templateId, value: v.value ?? null, valueJson: v.valueJson, kind: v.kind ?? 'SINGLE', valueType: v.valueType, source: 'OCR', sourceRecordId: record.id, verified: false },
    })
  await Promise.all([
    upsertValue('eme', { value: d.totalEme, valueType: 'NUMBER' }),
    upsertValue('eme_plires', { value: d.fullTimeEme, valueType: 'NUMBER' }),
    upsertValue('eme_merikis', { value: d.partTimeEme, valueType: 'NUMBER' }),
    upsertValue('eme_ergazomenoi', { valueJson: table, kind: 'TABLE', valueType: 'NUMBER' }),
  ])

  // Εργαζόμενοι εταιρίας: μόνο αν δεν υπάρχει ήδη ΝΕΟΤΕΡΗ χρήση (ούτε από χειροκίνητη διόρθωση).
  let updatedCompany = false
  if (d.totalEme != null && (trdr?.appEmployeesYear == null || year >= trdr.appEmployeesYear)) {
    await prisma.trdr.update({
      where: { id: input.trdrId },
      data: { appEme: d.totalEme, appEmployees: Math.round(d.totalEme), appEmployeesYear: year, appEmployeesSource: 'EME' },
    })
    updatedCompany = true
  }
  return { year, eme: d.totalEme, employees: d.employees.length, updatedCompany, afmMismatch }
}
