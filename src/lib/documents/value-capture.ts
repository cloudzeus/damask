'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { processTemplateIfApplicable } from '@/lib/tax/template-auto'
import { isSeriesKind, normalizePeriod, type SeriesKind } from './series'
import type { FinancialValueTypeStr } from '@/lib/tax/greek-format'

/**
 * «Σάρωση τιμών» + μνήμη τιμών ανά τύπο εγγράφου.
 *  1. Το AI προτείνει ΟΛΕΣ τις τιμές που βρίσκει σε ένα έγγραφο (ετικέτα, τιμή, είδος).
 *  2. Ο χρήστης επιλέγει ποιες «κρατάμε» → γίνονται πεδία του Οδηγού (TaxFormTemplate) του τύπου — νέου ή υπάρχοντος.
 *  3. Από εκεί και πέρα κάθε ίδιο έγγραφο (οποιουδήποτε πελάτη) διαβάζεται αυτόματα στο ανέβασμα και οι τιμές
 *     αποθηκεύονται στην εταιρία (ανά έτος, ή ανά περίοδο για σειρές όπως το Φ2) — διαθέσιμες σε κάθε πρόγραμμα.
 */

const VALUE_TYPES: FinancialValueTypeStr[] = ['CURRENCY', 'NUMBER', 'PERCENT', 'INTEGER', 'DATE', 'BOOLEAN', 'TEXT']

export type ValueCandidate = { label: string; value: string; valueType: FinancialValueTypeStr; hint: string | null; existing: boolean }
export type ValueScan = {
  candidates: ValueCandidate[]
  /** Πρόταση ονόματος τύπου (όταν δεν υπάρχει) και αν είναι σειρά/περίοδος. */
  suggestedTypeName: string | null
  seriesKind: SeriesKind | null
  period: string | null
}

const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()

/** Υπάρχοντα πεδία του Οδηγού ενός τύπου (για προεπιλογή/να μη διπλασιάζονται). */
async function templateOf(typeId: string) {
  return prisma.taxFormTemplate.findFirst({
    where: { documentTypeId: typeId },
    orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }],
    select: { id: true, status: true, fields: { orderBy: { order: 'asc' }, select: { fieldKey: true, label: true, valueType: true, aiHint: true } } },
  })
}

export async function scanCandidateValues(input: { base64?: string | null; text?: string | null; mimeType: string; fileName: string; typeId?: string | null }): Promise<{ ok: true; scan: ValueScan } | { ok: false; message: string }> {
  const session = await requirePermission('customer.edit')
  const binary = !!input.base64 && (input.mimeType === 'application/pdf' || input.mimeType.startsWith('image/'))
  if (!binary && !input.text?.trim()) return { ok: false, message: 'Το αρχείο δεν έχει αναγνώσιμο περιεχόμενο (PDF, εικόνα, Word ή Excel).' }
  const tpl = input.typeId ? await templateOf(input.typeId) : null
  const known = tpl?.fields ?? []
  try {
    const { geminiGenerate } = await import('@/lib/gemini')
    const res = await geminiGenerate({
      parts: binary
        ? [{ inlineData: { data: input.base64!, mimeType: input.mimeType } }, { text: `Όνομα αρχείου: ${input.fileName}` }]
        : [{ text: `Όνομα αρχείου: ${input.fileName}\n\nΠεριεχόμενο:\n${input.text!.slice(0, 120_000)}` }],
      systemInstruction: [
        'Διαβάζεις ελληνικό επιχειρηματικό/φορολογικό έγγραφο. Κατάγραψε ΟΛΕΣ τις ουσιώδεις τιμές που θα ήθελε να κρατήσει ένας σύμβουλος ΕΣΠΑ',
        '(ποσά, σύνολα, ποσοστά, αριθμοί εργαζομένων, ημερομηνίες, περίοδος, ΑΦΜ, κωδικοί) — ΟΧΙ διευθύνσεις/τηλέφωνα/κείμενα νόμων.',
        'Για κάθε τιμή: label = σύντομη ελληνική ετικέτα όπως στο έγγραφο (με κωδικό πεδίου αν υπάρχει, π.χ. «Φόρος εκροών (κωδ. 337)»),',
        `value = η τιμή όπως τυπώνεται, valueType ∈ ${VALUE_TYPES.join('|')}, hint = πού/πώς βρίσκεται (για να ξαναβρεθεί σε άλλο ίδιο έγγραφο).`,
        known.length ? `Το έγγραφο έχει ήδη αυτά τα πεδία — συμπεριέλαβέ τα με την ΙΔΙΑ ετικέτα: ${known.map(k => k.label).join(' · ')}.` : '',
        'Επίσης: typeName = σύντομο όνομα του είδους εγγράφου (π.χ. «Φ2 - Περιοδική δήλωση ΦΠΑ»)·',
        'seriesKind = MONTHLY|QUARTERLY|YEARLY αν το έγγραφο αφορά περίοδο που επαναλαμβάνεται (π.χ. μηνιαία δήλωση), αλλιώς null· period = η περίοδος αναφοράς (YYYY-MM | YYYY-Qn | YYYY) ή null.',
        'Έως 40 τιμές. ΑΥΣΤΗΡΑ JSON: {"typeName":"...","seriesKind":...,"period":...,"values":[{"label":"...","value":"...","valueType":"...","hint":"..."}]}',
      ].filter(Boolean).join('\n'),
      json: true, scope: 'OCR_VISION', refType: 'value-scan', userId: session.user.id,
    })
    const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
    const knownLabels = new Set(known.map(k => fold(k.label)))
    const seen = new Set<string>()
    const candidates: ValueCandidate[] = (Array.isArray(p.values) ? (p.values as Record<string, unknown>[]) : [])
      .map(v => {
        const label = str(v.label) ?? ''
        const vt = String(v.valueType ?? '').toUpperCase() as FinancialValueTypeStr
        return { label: label.slice(0, 120), value: (str(v.value) ?? '').slice(0, 200), valueType: VALUE_TYPES.includes(vt) ? vt : 'TEXT', hint: str(v.hint)?.slice(0, 200) ?? null, existing: knownLabels.has(fold(label)) }
      })
      .filter(c => c.label && !seen.has(fold(c.label)) && seen.add(fold(c.label)))
      .slice(0, 40)
    const sk = isSeriesKind(p.seriesKind) && p.seriesKind !== 'LIST' ? (p.seriesKind as SeriesKind) : null
    return {
      ok: true,
      scan: { candidates, suggestedTypeName: str(p.typeName)?.slice(0, 120) ?? null, seriesKind: sk, period: sk ? normalizePeriod(str(p.period), sk) : null },
    }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η σάρωση απέτυχε.' }
  }
}

function keyOf(label: string, taken: Set<string>): string {
  const map: Record<string, string> = { α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o' }
  const base = fold(label).split('').map(c => map[c] ?? c).join('').replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 40) || 'pedio'
  let k = base
  for (let i = 2; taken.has(k); i++) k = `${base}_${i}`
  taken.add(k)
  return k
}

/**
 * Αποθήκευση επιλογής ως μνήμη: τύπος (υπάρχων ή νέος) + Οδηγός με τα πεδία. Επιστρέφει τον τύπο για να
 * ταξινομηθεί αμέσως το αρχείο — στην αποθήκευση του δικαιολογητικού οι τιμές διαβάζονται και καταχωρούνται.
 */
export async function saveValueTemplate(input: {
  typeId?: string | null
  newTypeName?: string | null
  seriesKind?: SeriesKind | null
  fields: { label: string; valueType: FinancialValueTypeStr; hint: string | null }[]
}): Promise<{ ok: true; type: { id: string; name: string; expires: boolean; seriesKind: string | null }; added: number } | { ok: false; message: string }> {
  const session = await requirePermission('customer.edit')
  // Αλλαγή καταλόγου → ξαναεξέταση αναγνώριστων/ανάγνωση τιμών σε ~2′ (βλ. src/lib/import/catalog.ts).
  void import('@/lib/import/catalog').then(m => m.kickCatalogRecheck())
  const fields = input.fields.filter(f => f.label.trim())
  if (!fields.length) return { ok: false, message: 'Επιλέξτε τουλάχιστον μία τιμή.' }
  let type = input.typeId ? await prisma.documentType.findUnique({ where: { id: input.typeId }, select: { id: true, name: true, expires: true, seriesKind: true } }) : null
  if (!type) {
    const name = input.newTypeName?.trim()
    if (!name) return { ok: false, message: 'Δώστε όνομα για τον νέο τύπο εγγράφου.' }
    type = await prisma.documentType.findUnique({ where: { name }, select: { id: true, name: true, expires: true, seriesKind: true } })
      ?? await prisma.documentType.create({ data: { name, expires: false, seriesKind: input.seriesKind ?? null }, select: { id: true, name: true, expires: true, seriesKind: true } })
  }
  if (input.seriesKind && !type.seriesKind) {
    type = await prisma.documentType.update({ where: { id: type.id }, data: { seriesKind: input.seriesKind }, select: { id: true, name: true, expires: true, seriesKind: true } })
  }
  let tpl = await templateOf(type.id)
  if (!tpl) {
    const created = await prisma.taxFormTemplate.create({
      data: { code: `doc-${crypto.randomUUID().slice(0, 8)}`, name: type.name, status: 'READY', documentTypeId: type.id, description: 'Δημιουργήθηκε από «Σάρωση τιμών».', createdById: session.user.id },
      select: { id: true },
    })
    tpl = { id: created.id, status: 'READY', fields: [] }
  } else if (tpl.status !== 'READY') {
    await prisma.taxFormTemplate.update({ where: { id: tpl.id }, data: { status: 'READY' } })
  }
  const existing = new Set(tpl.fields.map(f => fold(f.label)))
  const taken = new Set(tpl.fields.map(f => f.fieldKey))
  let order = tpl.fields.length
  let added = 0
  for (const f of fields) {
    if (existing.has(fold(f.label))) continue
    await prisma.taxFormTemplateField.create({
      data: { templateId: tpl.id, fieldKey: keyOf(f.label, taken), label: f.label.trim().slice(0, 120), valueType: f.valueType, aiHint: f.hint, order: order++ },
    })
    existing.add(fold(f.label))
    added++
  }
  revalidatePath('/tax-templates')
  return { ok: true, type, added }
}

export type SeriesValues = {
  fields: { key: string; label: string; valueType: string }[]
  rows: { period: string; values: Record<string, string | null> }[]
  /** Δικαιολογητικά του τύπου που δεν έχουν διαβαστεί ακόμη (για «Ανάγνωση τιμών»). */
  unread: number
}

/** Πίνακας τιμών ενός τύπου-σειράς για τον πελάτη: γραμμές = περίοδοι, στήλες = πεδία του Οδηγού. */
export async function listSeriesValues(trdrId: string, typeId: string): Promise<SeriesValues | null> {
  await requirePermission('customer.view')
  const tpl = await templateOf(typeId)
  if (!tpl?.fields.length) return null
  const [vals, docs, records] = await Promise.all([
    prisma.trdrFinancialValue.findMany({ where: { trdrId, templateId: tpl.id, period: { not: '' } }, select: { fieldKey: true, period: true, valueText: true } }),
    prisma.trdrDossierDocument.findMany({ where: { trdrId, documentTypeId: typeId }, select: { id: true } }),
    prisma.trdrFormRecord.findMany({ where: { trdrId, templateId: tpl.id, dossierDocId: { not: null } }, select: { dossierDocId: true } }),
  ])
  const byPeriod = new Map<string, Record<string, string | null>>()
  for (const v of vals) {
    const row = byPeriod.get(v.period) ?? {}
    row[v.fieldKey] = v.valueText
    byPeriod.set(v.period, row)
  }
  const read = new Set(records.map(r => r.dossierDocId))
  return {
    fields: tpl.fields.map(f => ({ key: f.fieldKey, label: f.label, valueType: f.valueType })),
    rows: [...byPeriod.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([period, values]) => ({ period, values })),
    unread: docs.filter(d => !read.has(d.id)).length,
  }
}

/** Ανάγνωση τιμών στα ήδη ανεβασμένα δικαιολογητικά ενός τύπου (π.χ. όλα τα Φ2) που δεν έχουν διαβαστεί. */
export async function readTypeValues(trdrId: string, typeId: string): Promise<{ read: number; failed: number }> {
  const session = await requirePermission('customer.edit')
  const tpl = await templateOf(typeId)
  if (!tpl) return { read: 0, failed: 0 }
  const [docs, records] = await Promise.all([
    prisma.trdrDossierDocument.findMany({ where: { trdrId, documentTypeId: typeId }, select: { id: true, name: true, storageKey: true, mimeType: true, period: true } }),
    prisma.trdrFormRecord.findMany({ where: { trdrId, templateId: tpl.id, dossierDocId: { not: null } }, select: { dossierDocId: true } }),
  ])
  const done = new Set(records.map(r => r.dossierDocId))
  let read = 0
  let failed = 0
  for (const d of docs.filter(x => !done.has(x.id)).slice(0, 36)) {
    try {
      const buf = await bunnyDownload(d.storageKey)
      const mime = d.mimeType ?? (d.storageKey.endsWith('.pdf') ? 'application/pdf' : 'application/octet-stream')
      const r = await processTemplateIfApplicable({ docId: d.id, trdrId, documentTypeId: typeId, base64: buf.toString('base64'), mimeType: mime, storageKey: d.storageKey, name: d.name, userId: session.user.id, period: d.period })
      if (r?.found.length) read++
      else failed++
    } catch { failed++ }
  }
  revalidatePath(`/partners/${trdrId}`)
  return { read, failed }
}
