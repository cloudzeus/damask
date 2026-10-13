'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { geminiGenerate } from '@/lib/gemini'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { slugFieldKey, type FinancialValueTypeStr } from '@/lib/tax/template'
import { FIELD_TARGETS, TARGET_BY_KEY } from '@/lib/tax/field-targets'
import { askAi, exampleTokens, getMemoryIndex, memoryMatch } from './smart-classify-core'

/**
 * «Εκπαίδευση αναγνώρισης» (/document-training): το προσωπικό ανεβάζει δείγματα εγγράφων ΕΠΙΛΕΓΟΝΤΑΣ τον τύπο.
 * Κάθε δείγμα γίνεται παράδειγμα στη μνήμη (DocumentClassificationExample, origin TRAINING) — μαζί με όσα
 * καταχωρίζονται σε πελάτες (origin UPLOAD). Από ΟΛΑ τα δείγματα ενός τύπου (πολλοί πελάτες) βγαίνει η «διάγνωση»:
 * χαρακτηριστικές φράσεις (γρήγορη αναγνώριση χωρίς AI) + προτεινόμενα πεδία προς εξαγωγή για τον Οδηγό Εντύπου.
 */

const MAX_BYTES = 15 * 1024 * 1024
/** Αναγνώσιμο ελληνικό/λατινικό κείμενο; (όχι σύμβολα από «σπασμένες» γραμματοσειρές ή σαρωμένο PDF) */
const readable = (t: string) => (t.match(/[Α-Ωα-ωάέήίόύώϊϋΐΰA-Za-z]/g) ?? []).length >= 150

export type TrainingTypeRow = {
  id: string
  name: string
  training: number
  uploads: number
  customers: number
  /** Ακρίβεια της μνήμης (χωρίς AI) σε «άγνωστο» δείγμα — leave-one-out· null όταν <2 δείγματα. */
  memoryAccuracy: number | null
  signature: string[]
  templateId: string | null
  templateFields: number
  lastAt: string | null
}

export async function listTrainingOverview(): Promise<{ rows: TrainingTypeRow[]; totals: { samples: number; customers: number; accuracy: number | null } }> {
  await requirePermission('doctraining.upload')
  const [types, memory, counts, customers, templates] = await Promise.all([
    prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    getMemoryIndex(),
    prisma.documentClassificationExample.groupBy({ by: ['documentTypeId', 'origin'], _count: { _all: true }, _max: { createdAt: true } }),
    prisma.documentClassificationExample.groupBy({ by: ['documentTypeId', 'trdrId'], where: { trdrId: { not: null } } }),
    prisma.taxFormTemplate.findMany({ where: { documentTypeId: { not: null } }, orderBy: { updatedAt: 'desc' }, select: { id: true, documentTypeId: true, _count: { select: { fields: true } } } }),
  ])
  const activeIds = new Set(types.map(t => t.id))
  // Leave-one-out: για κάθε δείγμα, θα το έβρισκε η μνήμη χωρίς αυτό;
  const hits = new Map<string, { ok: number; n: number }>()
  for (const e of memory.examples) {
    if (!activeIds.has(e.documentTypeId)) continue
    const h = memoryMatch(e.tok, memory, { activeIds, excludeId: e.id })
    const s = hits.get(e.documentTypeId) ?? { ok: 0, n: 0 }
    s.n += 1
    if (h?.typeId === e.documentTypeId) s.ok += 1
    hits.set(e.documentTypeId, s)
  }
  const rows = types.map(t => {
    const c = counts.filter(x => x.documentTypeId === t.id)
    const tpl = templates.find(x => x.documentTypeId === t.id)
    const h = hits.get(t.id)
    const last = c.map(x => x._max.createdAt).filter((d): d is Date => !!d).sort((a, b) => b.getTime() - a.getTime())[0]
    return {
      id: t.id, name: t.name,
      training: c.filter(x => x.origin === 'TRAINING').reduce((s, x) => s + x._count._all, 0),
      uploads: c.filter(x => x.origin !== 'TRAINING').reduce((s, x) => s + x._count._all, 0),
      customers: customers.filter(x => x.documentTypeId === t.id).length,
      memoryAccuracy: h && h.n >= 2 ? h.ok / h.n : null,
      signature: memory.signatures.get(t.id)?.slice(0, 8) ?? [],
      templateId: tpl?.id ?? null, templateFields: tpl?._count.fields ?? 0,
      lastAt: last?.toISOString() ?? null,
    }
  })
  const all = [...hits.values()].reduce((s, x) => ({ ok: s.ok + x.ok, n: s.n + x.n }), { ok: 0, n: 0 })
  return {
    rows,
    totals: { samples: memory.examples.length, customers: new Set(customers.map(c => c.trdrId)).size, accuracy: all.n >= 2 ? all.ok / all.n : null },
  }
}

export type TrainingSampleResult =
  | { ok: true; duplicate: boolean; predicted: { typeName: string | null; source: 'memory' | 'ai' | 'none'; correct: boolean }; readByAi: boolean }
  | { ok: false; message: string }

/** Νέο δείγμα εκπαίδευσης: ο χρήστης έχει ήδη διαλέξει τον τύπο. Επιστρέφει και τι θα πρότεινε το σύστημα πριν. */
export async function addTrainingSample(input: { documentTypeId: string; fileName: string; base64: string; mimeType: string; text: string }): Promise<TrainingSampleResult> {
  const session = await requirePermission('doctraining.upload')
  // Αλλαγή καταλόγου → ξαναεξέταση αναγνώριστων/ανάγνωση τιμών σε ~2′ (βλ. src/lib/import/catalog.ts).
  void import('@/lib/import/catalog').then(m => m.kickCatalogRecheck())
  const type = await prisma.documentType.findUnique({ where: { id: input.documentTypeId }, select: { id: true, name: true } })
  if (!type) return { ok: false, message: 'Διαλέξτε τύπο εγγράφου.' }
  const body = Buffer.from(input.base64, 'base64')
  if (!body.length) return { ok: false, message: 'Το αρχείο είναι κενό.' }
  if (body.length > MAX_BYTES) return { ok: false, message: 'Το αρχείο ξεπερνά τα 15MB.' }
  const contentHash = crypto.createHash('sha256').update(body).digest('hex')
  if (await prisma.documentClassificationExample.findFirst({ where: { documentTypeId: type.id, contentHash }, select: { id: true } })) {
    return { ok: true, duplicate: true, predicted: { typeName: type.name, source: 'memory', correct: true }, readByAi: false }
  }

  // Κείμενο: ψηφιακό από τον browser· σαρωμένο/«σπασμένο» PDF ή εικόνα → μεταγραφή με Gemini.
  let text = input.text.replace(/\s+/g, ' ').trim()
  let readByAi = false
  if (!readable(text) && /pdf|image\//.test(input.mimeType)) {
    try {
      const res = await geminiGenerate({
        parts: [{ inlineData: { data: input.base64, mimeType: input.mimeType } }, { text: 'Μετέγραψε αυτούσιο το κείμενο των 2 πρώτων σελίδων του εγγράφου (χωρίς σχόλια, χωρίς markdown).' }],
        scope: 'OCR_VISION', refType: 'doc-training', userId: session.user.id, maxOutputTokens: 2000,
      })
      text = res.text.replace(/\s+/g, ' ').trim()
      readByAi = true
    } catch { /* κρατάμε ό,τι υπάρχει — το όνομα αρχείου μετράει κι αυτό */ }
  }
  const snippet = text.slice(0, 1500)

  // Τι θα πρότεινε το σύστημα ΧΩΡΙΣ αυτό το δείγμα (μέτρηση προόδου της εκπαίδευσης).
  const [types, memory] = await Promise.all([
    prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true, expires: true, validityDays: true, notes: true }, orderBy: { name: 'asc' } }),
    getMemoryIndex(),
  ])
  const activeIds = new Set(types.map(t => t.id))
  const probe = exampleTokens(input.fileName, snippet)
  let predictedId: string | null = null
  let source: 'memory' | 'ai' | 'none' = 'none'
  const hit = memoryMatch(probe, memory, { activeIds })
  if (hit) { predictedId = hit.typeId; source = 'memory' } else {
    const scored = memory.examples.filter(e => activeIds.has(e.documentTypeId)).map(e => ({ e, sim: 0 }))
    const ai = await askAi({ types, examples: scored, apps: [], fileName: input.fileName, snippet }).catch(() => null)
    const t = ai?.typeName ? types.find(x => x.name === ai.typeName) : null
    if (t) { predictedId = t.id; source = 'ai' }
  }

  const id = crypto.randomUUID()
  const ext = (input.fileName.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 8) || 'bin'
  const storageKey = `training/${type.id}/${id}.${ext}`
  await bunnyUploadPrivate({ key: storageKey, body, contentType: input.mimeType || 'application/octet-stream' })
  await prisma.documentClassificationExample.create({
    data: {
      id, documentTypeId: type.id, predictedTypeId: predictedId, wasCorrect: predictedId === type.id,
      fileName: input.fileName.slice(0, 200), snippet, origin: 'TRAINING', storageKey, mimeType: input.mimeType, contentHash,
      createdById: session.user.id,
    },
  })
  revalidatePath('/document-training')
  return { ok: true, duplicate: false, predicted: { typeName: types.find(t => t.id === predictedId)?.name ?? null, source, correct: predictedId === type.id }, readByAi }
}

export type TrainingSampleRow = { id: string; fileName: string; origin: string; customer: string | null; createdAt: string; wasCorrect: boolean; predicted: string | null; snippet: string }

export async function listTypeSamples(documentTypeId: string): Promise<TrainingSampleRow[]> {
  await requirePermission('doctraining.upload')
  const rows = await prisma.documentClassificationExample.findMany({
    where: { documentTypeId }, orderBy: { createdAt: 'desc' }, take: 200,
    select: { id: true, fileName: true, origin: true, trdrId: true, createdAt: true, wasCorrect: true, predictedTypeId: true, snippet: true },
  })
  const [trdrs, types] = await Promise.all([
    prisma.trdr.findMany({ where: { id: { in: [...new Set(rows.map(r => r.trdrId).filter((x): x is string => !!x))] } }, select: { id: true, NAME: true } }),
    prisma.documentType.findMany({ where: { id: { in: [...new Set(rows.map(r => r.predictedTypeId).filter((x): x is string => !!x))] } }, select: { id: true, name: true } }),
  ])
  return rows.map(r => ({
    id: r.id, fileName: r.fileName, origin: r.origin, customer: trdrs.find(t => t.id === r.trdrId)?.NAME ?? null,
    createdAt: r.createdAt.toISOString(), wasCorrect: r.wasCorrect,
    predicted: types.find(t => t.id === r.predictedTypeId)?.name ?? null, snippet: r.snippet.slice(0, 220),
  }))
}

/** Αφαίρεση λάθος δείγματος από τη μνήμη (π.χ. ανέβηκε σε λάθος τύπο). */
export async function deleteTrainingSample(id: string): Promise<void> {
  await requirePermission('doctraining.upload')
  // Αλλαγή καταλόγου → ξαναεξέταση αναγνώριστων/ανάγνωση τιμών σε ~2′ (βλ. src/lib/import/catalog.ts).
  void import('@/lib/import/catalog').then(m => m.kickCatalogRecheck())
  await prisma.documentClassificationExample.delete({ where: { id } })
  revalidatePath('/document-training')
}


// ── Διάγνωση από όλα τα δείγματα ενός τύπου ─────────────────────────────────

export type ProposedField = { label: string; valueType: FinancialValueTypeStr; aiHint: string; target: string | null; exists: boolean }
export type TypeDiagnosis = {
  typeName: string
  samples: number
  customers: number
  signature: string[]
  summary: string
  notes: string | null
  currentNotes: string | null
  fields: ProposedField[]
  templateId: string | null
}

const VALUE_TYPES: FinancialValueTypeStr[] = ['CURRENCY', 'NUMBER', 'PERCENT', 'INTEGER', 'DATE', 'BOOLEAN', 'TEXT']

export async function diagnoseType(documentTypeId: string): Promise<TypeDiagnosis> {
  await requirePermission('doctype.manage')
  const [type, examples, memory, template] = await Promise.all([
    prisma.documentType.findUniqueOrThrow({ where: { id: documentTypeId }, select: { name: true, notes: true } }),
    prisma.documentClassificationExample.findMany({ where: { documentTypeId }, orderBy: { createdAt: 'desc' }, take: 60, select: { fileName: true, snippet: true, trdrId: true } }),
    getMemoryIndex(),
    prisma.taxFormTemplate.findFirst({ where: { documentTypeId }, orderBy: { updatedAt: 'desc' }, select: { id: true, fields: { select: { fieldKey: true, label: true } } } }),
  ])
  if (!examples.length) throw new Error('Δεν υπάρχουν ακόμη δείγματα για αυτόν τον τύπο — ανεβάστε πρώτα μερικά.')
  // Ένα δείγμα ανά πελάτη πρώτα (ποικιλία), μετά τα υπόλοιπα — έως 10 για το AI.
  const seen = new Set<string>()
  const picked = [...examples.filter(e => e.trdrId && !seen.has(e.trdrId) && seen.add(e.trdrId)), ...examples.filter(e => !e.trdrId)].slice(0, 10)
  const existing = new Set((template?.fields ?? []).map(f => f.fieldKey))
  const targets = FIELD_TARGETS.map(t => `${t.key} = ${t.group}: ${t.label}`).join('\n')

  const system = [
    'Είσαι ειδικός στα ελληνικά επιχειρηματικά δικαιολογητικά (ΕΣΠΑ, φορολογικά, ασφαλιστικά, ΓΕΜΗ).',
    `Σου δίνονται αποσπάσματα από ${picked.length} έγγραφα του ίδιου τύπου «${type.name}» (διαφορετικές επιχειρήσεις).`,
    'Κάνε διάγνωση: (1) πώς αναγνωρίζεται ο τύπος (σταθερές φράσεις/εκδότης/δομή) — 1-2 προτάσεις, (2) μια σύντομη σημείωση (έως 120 χαρακτήρες) που ξεχωρίζει τον τύπο από παρόμοιους, (3) ποια ΧΡΗΣΙΜΑ στοιχεία υπάρχουν σταθερά σε αυτά τα έγγραφα και αξίζει να εξάγονται (έως 8).',
    `Για κάθε πεδίο: label (ελληνικά), valueType (${VALUE_TYPES.join('/')}), aiHint = πού/πώς βρίσκεται μέσα στο έγγραφο (ελληνικά, συγκεκριμένα), target = ένας από τους παρακάτω κωδικούς ή null (= μόνο ιστορικό ανά έτος):\n${targets}`,
    'Προτίμησε στοιχεία που αλλάζουν ανά επιχείρηση (ποσά, αριθμοί, ημερομηνίες έκδοσης/λήξης, έτος αναφοράς) — ΟΧΙ σταθερά κείμενα του εντύπου. ΜΗΝ προτείνεις ΑΦΜ/επωνυμία (ελέγχονται ήδη).',
    'Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"summary":"...","notes":"...","fields":[{"label":"...","valueType":"...","aiHint":"...","target":"... ή null"}]}',
  ].join('\n\n')
  const user = picked.map((e, i) => `### Δείγμα ${i + 1} («${e.fileName}»)\n${e.snippet.slice(0, 1200)}`).join('\n\n')
  const text = await deepseekChat([{ role: 'system', content: system }, { role: 'user', content: user }], { model: 'deepseek-chat', maxTokens: 1500, scope: 'OTHER', refType: 'doc-diagnosis' })
  const p = (parseJsonLoose(text) ?? {}) as { summary?: unknown; notes?: unknown; fields?: unknown }
  const fields: ProposedField[] = (Array.isArray(p.fields) ? p.fields : []).flatMap(raw => {
    const f = raw as Record<string, unknown>
    const label = typeof f.label === 'string' ? f.label.trim() : ''
    if (!label) return []
    const target = typeof f.target === 'string' && TARGET_BY_KEY.has(f.target) ? f.target : null
    const vt = target ? TARGET_BY_KEY.get(target)!.valueType : VALUE_TYPES.includes(f.valueType as FinancialValueTypeStr) ? (f.valueType as FinancialValueTypeStr) : 'TEXT'
    return [{ label: label.slice(0, 120), valueType: vt, aiHint: typeof f.aiHint === 'string' ? f.aiHint.slice(0, 240) : '', target, exists: existing.has(slugFieldKey(label)) }]
  }).slice(0, 8)

  return {
    typeName: type.name,
    samples: examples.length,
    customers: new Set(examples.map(e => e.trdrId).filter(Boolean)).size,
    signature: memory.signatures.get(documentTypeId) ?? [],
    summary: typeof p.summary === 'string' ? p.summary.slice(0, 400) : '',
    notes: typeof p.notes === 'string' && p.notes.trim() ? p.notes.trim().slice(0, 160) : null,
    currentNotes: type.notes,
    fields,
    templateId: template?.id ?? null,
  }
}

/** Εφαρμογή διάγνωσης: σημείωση τύπου (προαιρετικά) + προσθήκη πεδίων στον Οδηγό Εντύπου του τύπου (δημιουργείται αν λείπει). */
export async function applyDiagnosis(documentTypeId: string, input: { notes?: string | null; fields: Omit<ProposedField, 'exists'>[] }): Promise<{ templateId: string | null; added: number }> {
  const session = await requirePermission('doctype.manage')
  // Αλλαγή καταλόγου → ξαναεξέταση αναγνώριστων/ανάγνωση τιμών σε ~2′ (βλ. src/lib/import/catalog.ts).
  void import('@/lib/import/catalog').then(m => m.kickCatalogRecheck())
  const type = await prisma.documentType.findUniqueOrThrow({ where: { id: documentTypeId }, select: { name: true } })
  if (input.notes?.trim()) await prisma.documentType.update({ where: { id: documentTypeId }, data: { notes: input.notes.trim().slice(0, 500) } })
  if (!input.fields.length) { revalidatePath('/document-training'); return { templateId: null, added: 0 } }

  let template = await prisma.taxFormTemplate.findFirst({ where: { documentTypeId }, orderBy: { updatedAt: 'desc' }, select: { id: true } })
  if (!template) {
    template = await prisma.taxFormTemplate.create({
      data: { code: slugFieldKey(type.name).slice(0, 40) || 'doc', name: type.name, status: 'READY', documentTypeId, createdById: session.user.id, description: 'Δημιουργήθηκε από τη διάγνωση δειγμάτων (Εκπαίδευση αναγνώρισης).' },
      select: { id: true },
    })
  }
  const existing = await prisma.taxFormTemplateField.findMany({ where: { templateId: template.id }, select: { fieldKey: true, order: true } })
  const keys = new Set(existing.map(f => f.fieldKey))
  let order = existing.reduce((m, f) => Math.max(m, f.order + 1), 0)
  let added = 0
  for (const f of input.fields) {
    const fieldKey = slugFieldKey(f.label) || `field_${order + 1}`
    if (keys.has(fieldKey)) continue
    keys.add(fieldKey)
    await prisma.taxFormTemplateField.create({
      data: { templateId: template.id, fieldKey, label: f.label, valueType: f.valueType, kind: 'SINGLE', aiHint: f.aiHint || null, target: f.target && TARGET_BY_KEY.has(f.target) ? f.target : null, order: order++ },
    })
    added += 1
  }
  revalidatePath('/document-training')
  revalidatePath(`/tax-templates/${template.id}`)
  return { templateId: template.id, added }
}
