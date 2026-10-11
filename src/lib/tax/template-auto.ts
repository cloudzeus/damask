import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { coerceFinancialValue, parseGreekDate, parseGreekNumber, type FinancialValueTypeStr } from '@/lib/tax/greek-format'
import { TARGET_BY_KEY } from '@/lib/tax/field-targets'

/**
 * (Plain module.) Αυτόματη ανάγνωση με τον Οδηγό Εντύπου του τύπου: όταν ανεβαίνει δικαιολογητικό ενός τύπου που
 * έχει έτοιμο (READY) Οδηγό με πεδία, το Gemini διαβάζει ΟΛΟ το έγγραφο και βρίσκει κάθε πεδίο από την περιγραφή
 * «τι να βρει» (+ περιοχή, αν έχει σημειωθεί). Κάθε τιμή μπαίνει στο ιστορικό της εταιρίας ανά έτος και, όπου
 * δηλώθηκε, ΚΑΙ στον προορισμό της (στοιχείο εταιρίας / ημερομηνίες εγγράφου). ΑΦΜ άλλης επιχείρησης ⇒ καμία
 * καταχώριση. ΕΜΕ/Ε3/Δήλωση ΜΜΕ έχουν δικούς τους ειδικούς αναγνώστες και δεν περνούν από εδώ.
 */

const TYPE_HINT: Record<FinancialValueTypeStr, string> = {
  CURRENCY: 'ποσό σε ευρώ (όπως τυπώνεται)',
  NUMBER: 'αριθμός',
  PERCENT: 'ποσοστό',
  INTEGER: 'ακέραιος αριθμός',
  DATE: 'ημερομηνία σε μορφή YYYY-MM-DD',
  BOOLEAN: '"ναι" ή "όχι"',
  TEXT: 'κείμενο όπως αναγράφεται',
}

export type TemplateApplied = {
  template: string
  year: number
  found: { label: string; value: string; target: string | null }[]
  missing: string[]
  appliedTo: string[]
  afmMismatch: boolean
}

export type FieldLite = { fieldKey: string; label: string; valueType: FinancialValueTypeStr; aiHint: string | null; target: string | null; regionHint: unknown }

function buildPrompt(typeName: string, fields: FieldLite[]): string {
  const lines = fields.map(f => {
    const r = f.regionHint as { page?: number; bbox?: number[] } | null
    const where = r && Array.isArray(r.bbox) ? ` — συνήθως στη σελίδα ${(r.page ?? 0) + 1}, περίπου ${Math.round(r.bbox[1] * 100)}% από πάνω` : ''
    return `- "${f.fieldKey}": ${f.label}${f.aiHint ? ` — ${f.aiHint}` : ''}${where}. Τιμή: ${TYPE_HINT[f.valueType]}.`
  })
  return [
    `Διαβάζεις ένα ελληνικό επιχειρηματικό έγγραφο τύπου «${typeName}».`,
    'Βρες ΜΟΝΟ τα παρακάτω πεδία. Αν ένα πεδίο δεν υπάρχει στο έγγραφο, βάλε null — ΠΟΤΕ μην επινοείς τιμή.',
    ...lines,
    '- "_afm": το ΑΦΜ (9 ψηφία) της επιχείρησης που αφορά το έγγραφο, ή null.',
    `Απάντησε με ένα JSON αντικείμενο: { ${[...fields.map(f => `"${f.fieldKey}": ...`), '"_afm": ...'].join(', ')} }`,
  ].join('\n')
}

/** Μόνο η ανάγνωση (χωρίς καταχώριση): τιμή ανά fieldKey + `_afm`. */
export async function extractTemplateValues(input: { base64: string; mimeType: string; typeName: string; fields: FieldLite[]; refId?: string | null; userId?: string | null }) {
  const res = await geminiGenerate({
    parts: [{ inlineData: { data: input.base64, mimeType: input.mimeType } }, { text: 'Βρες τα πεδία σύμφωνα με τις οδηγίες.' }],
    systemInstruction: buildPrompt(input.typeName, input.fields),
    json: true, scope: 'OCR_VISION', refType: 'template-auto', refId: input.refId ?? null, userId: input.userId ?? null,
  })
  const raw = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
  const str = (v: unknown) => (v == null || String(v).trim() === '' || String(v).trim() === 'null' ? null : String(v).trim())
  const values: Record<string, string | null> = {}
  for (const f of input.fields) values[f.fieldKey] = str(raw[f.fieldKey])
  return { values, afm: str(raw._afm)?.replace(/\D/g, '') ?? null, model: res.model, tokensUsed: res.tokensUsed ?? null }
}

/** Τρέχει τον Οδηγό του τύπου πάνω στο έγγραφο (αν υπάρχει) και καταχωρεί τις τιμές. */
export async function processTemplateIfApplicable(input: {
  docId: string | null
  trdrId: string
  documentTypeId: string
  base64: string
  mimeType: string
  storageKey: string
  name: string
  userId: string | null
}): Promise<TemplateApplied | null> {
  if (!/pdf|image\//.test(input.mimeType)) return null
  const template = await prisma.taxFormTemplate.findFirst({
    where: { documentTypeId: input.documentTypeId, status: 'READY', fields: { some: { kind: { not: 'TABLE' } } } },
    orderBy: [{ year: 'desc' }, { updatedAt: 'desc' }],
    select: {
      id: true, name: true, documentType: { select: { name: true } },
      fields: { where: { kind: { not: 'TABLE' } }, orderBy: { order: 'asc' }, select: { fieldKey: true, label: true, valueType: true, aiHint: true, target: true, regionHint: true } },
    },
  })
  if (!template || !template.fields.length) return null
  const fields = template.fields as FieldLite[]

  try {
    const res = await extractTemplateValues({ base64: input.base64, mimeType: input.mimeType, typeName: template.documentType?.name ?? template.name, fields, refId: input.docId, userId: input.userId })
    const trdr = await prisma.trdr.findUnique({ where: { id: input.trdrId }, select: { AFM: true, appEmployeesYear: true, appRevenueYear: true } })
    const docAfm = res.afm
    const afmMismatch = !!(docAfm && docAfm.length === 9 && trdr?.AFM && trdr.AFM.replace(/\D/g, '') !== docAfm)

    const values = fields.map(f => ({ f, raw: res.values[f.fieldKey] }))
    const yearField = values.find(v => v.f.target === 'record.year' && v.raw)
    const issued = values.find(v => v.f.target === 'doc.issuedAt' && v.raw)
    const year = (yearField && Math.round(parseGreekNumber(yearField.raw) ?? 0)) || (issued && parseGreekDate(issued.raw)?.getUTCFullYear()) || new Date().getFullYear()

    const out: TemplateApplied = {
      template: template.name, year, afmMismatch,
      found: values.filter(v => v.raw).map(v => ({ label: v.f.label, value: v.raw!, target: v.f.target })),
      missing: values.filter(v => !v.raw).map(v => v.f.label),
      appliedTo: [],
    }
    if (afmMismatch || !out.found.length) return out

    // Ιστορικό ανά έτος: TrdrFormRecord (το έγγραφο) + μία τιμή ανά πεδίο (οι επιβεβαιωμένες από χρήστη δεν αλλάζουν).
    const record = await prisma.trdrFormRecord.create({
      data: {
        name: input.name.trim() || template.name, trdrId: input.trdrId, templateId: template.id, year,
        storageKey: input.storageKey, status: 'EXTRACTED', model: res.model, tokensUsed: res.tokensUsed,
        extractedData: Object.fromEntries(values.map(v => [v.f.fieldKey, v.raw])) as Prisma.InputJsonValue,
        createdById: input.userId,
      },
    })
    for (const { f, raw: rv } of values) {
      if (!rv || f.target === 'record.year') continue
      const existing = await prisma.trdrFinancialValue.findUnique({ where: { trdrId_fieldKey_year: { trdrId: input.trdrId, fieldKey: f.fieldKey, year } }, select: { verified: true, source: true } })
      if (existing?.verified || existing?.source === 'MANUAL') continue
      const num = f.valueType === 'TEXT' ? null : coerceFinancialValue(rv, f.valueType)
      const data = { templateId: template.id, value: num, valueText: rv, valueType: f.valueType, kind: 'SINGLE' as const, source: 'OCR' as const, sourceRecordId: record.id }
      await prisma.trdrFinancialValue.upsert({
        where: { trdrId_fieldKey_year: { trdrId: input.trdrId, fieldKey: f.fieldKey, year } },
        create: { trdrId: input.trdrId, fieldKey: f.fieldKey, year, ...data },
        update: data,
      })
    }

    // Προορισμοί: στοιχεία εταιρίας (νεότερο έτος υπερισχύει) και ημερομηνίες του ίδιου του εγγράφου.
    const trdrData: Prisma.TrdrUpdateInput = {}
    const docData: { issuedAt?: Date; expiresAt?: Date } = {}
    const src = `Έγγραφο: ${input.name}`.slice(0, 120)
    for (const { f, raw: rv } of values) {
      if (!rv || !f.target) continue
      const n = parseGreekNumber(rv)
      const d = parseGreekDate(rv)
      switch (f.target) {
        case 'trdr.appEmployees':
          if (n != null && year >= (trdr?.appEmployeesYear ?? 0)) Object.assign(trdrData, { appEmployees: Math.round(n), appEmployeesYear: year, appEmployeesSource: src })
          break
        case 'trdr.appEme':
          if (n != null && year >= (trdr?.appEmployeesYear ?? 0)) Object.assign(trdrData, { appEme: n, appEmployeesYear: year, appEmployeesSource: src })
          break
        case 'trdr.appAnnualRevenue':
          if (n != null && year >= (trdr?.appRevenueYear ?? 0)) Object.assign(trdrData, { appAnnualRevenue: n, appRevenueYear: year, appRevenueSource: src })
          break
        case 'trdr.appLegalForm': trdrData.appLegalForm = rv.slice(0, 120); break
        case 'trdr.foundingDate': if (d) trdrData.foundingDate = d; break
        case 'trdr.arGemi': trdrData.arGemi = rv.replace(/\D/g, '') || null; break
        case 'doc.issuedAt': if (d) docData.issuedAt = d; break
        case 'doc.expiresAt': if (d) docData.expiresAt = d; break
        default: continue
      }
      out.appliedTo.push(TARGET_BY_KEY.get(f.target)?.label ?? f.target)
    }
    if (Object.keys(trdrData).length) {
      await prisma.trdr.update({ where: { id: input.trdrId }, data: trdrData }).catch(err => {
        console.error('[template-auto] trdr update failed', err) // π.χ. ο ΑΡ. ΓΕΜΗ ανήκει ήδη σε άλλη εταιρία
      })
    }
    if (input.docId && Object.keys(docData).length) {
      // Ημερομηνίες εγγράφου μόνο όπου λείπουν — ό,τι όρισε ο χρήστης στη φόρμα υπερισχύει.
      const doc = await prisma.trdrDossierDocument.findUnique({ where: { id: input.docId }, select: { issuedAt: true, expiresAt: true } })
      const patch = { ...(docData.issuedAt && !doc?.issuedAt ? { issuedAt: docData.issuedAt } : {}), ...(docData.expiresAt && !doc?.expiresAt ? { expiresAt: docData.expiresAt } : {}) }
      if (Object.keys(patch).length) await prisma.trdrDossierDocument.update({ where: { id: input.docId }, data: patch })
    }
    return out
  } catch (err) {
    console.error('[template-auto] failed', err)
    return null
  }
}
