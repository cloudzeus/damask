import { prisma } from '@/lib/prisma'
import { deepseekChat } from '@/lib/deepseek'
import { searchDocuments, type DocumentHit } from '@/lib/search/documents'
import { seriesCoverage, coverageLabel, isSeriesKind, type SeriesKind } from '@/lib/documents/series'
import { knowledgeHref, MEMORY_CATEGORY_LABELS } from './knowledge-docs'

/**
 * (Plain module — ο καλών ελέγχει δικαιώματα.) «Μνήμη γραφείου συμβούλων ΕΣΠΑ».
 *  • Πυρήνας δικαιολογητικών: τύποι που ζητούν τα περισσότερα προγράμματα.
 *  • Κατάσταση πελάτη: ποια από αυτά έχει σε ισχύ / λήγουν / έληξαν / λείπουν.
 *  • Ετοιμότητα πελάτη × προγράμματος: τι υπάρχει ήδη (από οποιοδήποτε πρόγραμμα) και τι λείπει — πριν ανοίξει έργο.
 *  • Ερώτηση στη μνήμη: σημασιολογική ανάκτηση (αρχεία + γνώση) → απάντηση με παραπομπές.
 */

export type CoreDocType = { typeId: string; name: string; programs: { id: string; title: string; active: boolean }[]; activePrograms: number; expires: boolean; seriesKind: string | null; hasValues: boolean }

export async function coreDocumentTypes(): Promise<CoreDocType[]> {
  const types = await prisma.documentType.findMany({
    where: { active: true, requiredForms: { some: {} } },
    select: {
      id: true, name: true, expires: true, seriesKind: true,
      requiredForms: { select: { program: { select: { id: true, title: true, status: true } } } },
      templates: { where: { status: 'READY', fields: { some: {} } }, select: { id: true } },
    },
  })
  return types
    .map(t => {
      const progs = [...new Map(t.requiredForms.map(r => [r.program.id, { id: r.program.id, title: r.program.title, active: r.program.status === 'ACTIVE' }])).values()]
      return { typeId: t.id, name: t.name, programs: progs, activePrograms: progs.filter(p => p.active).length, expires: t.expires, seriesKind: t.seriesKind, hasValues: t.templates.length > 0 }
    })
    .sort((a, b) => b.programs.length - a.programs.length || b.activePrograms - a.activePrograms || a.name.localeCompare(b.name, 'el'))
}

export type DocState = 'VALID' | 'EXPIRING' | 'EXPIRED' | 'MISSING' | 'PARTIAL'
export type CustomerDocStatus = CoreDocType & { state: DocState; detail: string; docName: string | null; expiresAt: string | null }

const DAY = 864e5
const fmt = (d: Date) => d.toLocaleDateString('el-GR')

type DossierRow = { documentTypeId: string; name: string; expiresAt: Date | null; period: string | null; reusable: boolean; programId: string | null }

function stateOf(type: { expires: boolean; seriesKind: string | null }, docs: DossierRow[], req?: { seriesCount: number | null; seriesFrom: string | null; seriesTo: string | null } | null, ref: Date = new Date()): { state: DocState; detail: string; doc: DossierRow | null } {
  if (!docs.length) return { state: 'MISSING', detail: 'Δεν υπάρχει στην αποθήκη.', doc: null }
  if (type.seriesKind && isSeriesKind(type.seriesKind)) {
    const kind = type.seriesKind as SeriesKind
    const cov = seriesCoverage({ kind, count: req?.seriesCount ?? null, from: req?.seriesFrom ?? null, to: req?.seriesTo ?? null }, docs.map(d => d.period), ref)
    return { state: cov.complete ? 'VALID' : 'PARTIAL', detail: coverageLabel(cov, kind), doc: docs[0] }
  }
  const now = Date.now()
  const valid = docs.filter(d => !d.expiresAt || d.expiresAt.getTime() > now).sort((a, b) => (b.expiresAt?.getTime() ?? Infinity) - (a.expiresAt?.getTime() ?? Infinity))[0]
  if (!valid) return { state: 'EXPIRED', detail: `Έληξε ${fmt(docs[0].expiresAt!)} — χρειάζεται νέο.`, doc: docs[0] }
  if (valid.expiresAt && valid.expiresAt.getTime() - now < 30 * DAY) return { state: 'EXPIRING', detail: `Λήγει ${fmt(valid.expiresAt)}.`, doc: valid }
  return { state: 'VALID', detail: valid.expiresAt ? `Σε ισχύ έως ${fmt(valid.expiresAt)}.` : 'Υπάρχει (δεν λήγει).', doc: valid }
}

/** Ο πυρήνας δικαιολογητικών με την κατάσταση του πελάτη. */
export async function customerCoreStatus(trdrId: string, minPrograms = 1): Promise<CustomerDocStatus[]> {
  const [core, docs] = await Promise.all([
    coreDocumentTypes(),
    prisma.trdrDossierDocument.findMany({ where: { trdrId }, orderBy: { createdAt: 'desc' }, select: { documentTypeId: true, name: true, expiresAt: true, period: true, reusable: true, programId: true } }),
  ])
  const byType = new Map<string, DossierRow[]>()
  for (const d of docs) byType.set(d.documentTypeId, [...(byType.get(d.documentTypeId) ?? []), d])
  return core.filter(c => c.programs.length >= minPrograms).map(c => {
    const s = stateOf(c, (byType.get(c.typeId) ?? []).filter(d => d.reusable || !d.programId))
    return { ...c, state: s.state, detail: s.detail, docName: s.doc?.name ?? null, expiresAt: s.doc?.expiresAt?.toISOString() ?? null }
  })
}

export type ReadinessItem = {
  formId: string
  name: string
  mandatory: boolean
  phase: string | null
  typeName: string | null
  state: DocState | 'UNLINKED'
  detail: string
  /** Από πού καλύπτεται (π.χ. «από άλλο πρόγραμμα»). */
  source: string | null
  /** Για απαιτήσεις χωρίς τύπο: πιθανά έγγραφα του πελάτη (σημασιολογικά). */
  candidates: { title: string; key: string }[]
}
export type Readiness = { programTitle: string; items: ReadinessItem[]; score: number; ready: number; total: number }

/** Ετοιμότητα πελάτη για πρόγραμμα: για κάθε απαίτηση, τι υπάρχει ήδη στην αποθήκη (από οποιοδήποτε πρόγραμμα). */
export async function programReadiness(trdrId: string, programId: string): Promise<Readiness> {
  const [program, docs] = await Promise.all([
    prisma.program.findUniqueOrThrow({
      where: { id: programId },
      select: { title: true, requiredForms: { orderBy: [{ mandatory: 'desc' }, { order: 'asc' }], select: { id: true, name: true, mandatory: true, phase: true, seriesCount: true, seriesFrom: true, seriesTo: true, documentType: { select: { id: true, name: true, expires: true, seriesKind: true } } } } },
    }),
    prisma.trdrDossierDocument.findMany({ where: { trdrId }, orderBy: { createdAt: 'desc' }, select: { documentTypeId: true, name: true, expiresAt: true, period: true, reusable: true, programId: true, program: { select: { title: true } } } }),
  ])
  const byType = new Map<string, (DossierRow & { program: { title: string } | null })[]>()
  for (const d of docs) byType.set(d.documentTypeId, [...(byType.get(d.documentTypeId) ?? []), d])
  const items: ReadinessItem[] = []
  for (const f of program.requiredForms) {
    if (!f.documentType) {
      const hits = (await searchDocuments(f.name, { trdrId, limit: 3 }).catch(() => [] as DocumentHit[])).filter(h => h.score >= 0.5)
      items.push({ formId: f.id, name: f.name, mandatory: f.mandatory, phase: f.phase, typeName: null, state: 'UNLINKED', detail: hits.length ? 'Πιθανά έγγραφα του πελάτη — ελέγξτε.' : 'Δεν έχει οριστεί τύπος — δεν βρέθηκε αντίστοιχο έγγραφο.', source: null, candidates: hits.map(h => ({ title: h.title, key: h.key })) })
      continue
    }
    const usable = (byType.get(f.documentType.id) ?? []).filter(d => d.reusable || !d.programId || d.programId === programId)
    const s = stateOf(f.documentType, usable, f)
    const fromOther = s.doc && 'program' in s.doc && s.doc.programId && s.doc.programId !== programId ? (s.doc as { program: { title: string } | null }).program?.title : null
    // Λείπει με αυτόν τον τύπο → μήπως υπάρχει με άλλο όνομα/τύπο; (σημασιολογικά, στα αρχεία του πελάτη)
    const candidates = s.state === 'MISSING'
      ? (await searchDocuments(f.name, { trdrId, limit: 3 }).catch(() => [] as DocumentHit[])).filter(h => h.score >= 0.5).map(h => ({ title: h.title, key: h.key }))
      : []
    items.push({
      formId: f.id, name: f.name, mandatory: f.mandatory, phase: f.phase, typeName: f.documentType.name, state: s.state,
      detail: candidates.length ? 'Δεν βρέθηκε με τον τύπο του — πιθανά υπάρχει με άλλο όνομα.' : s.detail,
      source: s.doc ? (fromOther ? `από «${fromOther}»` : 'από την αποθήκη') : null, candidates,
    })
  }
  const mand = items.filter(i => i.mandatory)
  const ready = mand.filter(i => i.state === 'VALID' || i.state === 'EXPIRING').length
  return { programTitle: program.title, items, ready, total: mand.length, score: mand.length ? Math.round((ready / mand.length) * 100) : 100 }
}

export type MemorySource = { n: number; title: string; category: string; categoryLabel: string; href: string | null; trdrName: string | null; snippet: string }
export type MemoryAnswer = { answer: string; sources: MemorySource[] }

/** Ερώτηση στη μνήμη: ανάκτηση από ΟΛΑ (γνώση + αρχεία), απάντηση μόνο από τις πηγές, με παραπομπές [n]. */
export async function askOfficeMemory(question: string, scope: { trdrId?: string | null; programId?: string | null } = {}, opts: { userId?: string | null } = {}): Promise<MemoryAnswer> {
  const q = question.trim().slice(0, 600)
  if (!q) return { answer: 'Γράψτε μια ερώτηση.', sources: [] }
  const [knowledge, files, scoped] = await Promise.all([
    searchDocuments(q, { memory: 'only', limit: 10 }).catch(() => [] as DocumentHit[]),
    searchDocuments(q, { trdrId: scope.trdrId ?? null, limit: 6 }).catch(() => [] as DocumentHit[]),
    scope.trdrId ? searchDocuments(q, { trdrId: scope.trdrId, memory: 'only', limit: 4 }).catch(() => [] as DocumentHit[]) : Promise.resolve([] as DocumentHit[]),
  ])
  const seen = new Set<string>()
  const hits = [...scoped, ...knowledge, ...files].filter(h => !seen.has(h.key) && seen.add(h.key)).slice(0, 14)
  // Πλήρες κείμενο εγγραφών γνώσης (το snippet είναι μία γραμμή).
  const full = new Map((await prisma.documentSearch.findMany({ where: { key: { in: hits.map(h => h.key) } }, select: { key: true, content: true } })).map(r => [r.key, r.content]))
  const sources: MemorySource[] = hits.map((h, i) => ({
    n: i + 1, title: h.title, category: h.category,
    categoryLabel: MEMORY_CATEGORY_LABELS[h.category] ?? 'Αρχείο',
    href: h.category.startsWith('memory-') ? knowledgeHref(h.key, h.trdrId) : (h.trdrId ? `/partners/${h.trdrId}?tab=files` : null),
    trdrName: h.trdrName, snippet: h.snippet,
  }))
  if (!hits.length) return { answer: 'Δεν βρέθηκε κάτι σχετικό στη μνήμη του γραφείου.', sources: [] }
  const context = hits.map((h, i) => `[${i + 1}] (${MEMORY_CATEGORY_LABELS[h.category] ?? 'Αρχείο'}${h.trdrName ? ` — ${h.trdrName}` : ''}) ${(full.get(h.key) ?? h.snippet).slice(0, h.category === 'memory-values' ? 14_000 : 4500)}`).join('\n\n')
  const answer = await deepseekChat([
    { role: 'system', content: [
      'Είσαι η «μνήμη» ενός γραφείου συμβούλων ΕΣΠΑ. Απαντάς στα ελληνικά, σύντομα και πρακτικά, ΜΟΝΟ από τις πηγές που δίνονται.',
      'Κάθε ισχυρισμός με παραπομπή [n]. Αν οι πηγές δεν αρκούν, πες τι λείπει — μην επινοείς ποσά, ημερομηνίες ή απαιτήσεις.',
      'Όπου ταιριάζει: ποια προγράμματα ζητούν κάτι, τι έχει ήδη ο πελάτης, τι λείπει/λήγει, τιμές ανά έτος/περίοδο.',
    ].join(' ') },
    { role: 'user', content: `Ερώτηση: ${q}\n\nΠηγές:\n${context}` },
  ], { model: 'deepseek-chat', maxTokens: 900, scope: 'OTHER', refType: 'office-memory', userId: opts.userId ?? undefined })
  return { answer: answer.trim(), sources }
}
