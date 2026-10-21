import type { AssessmentResult } from './agent'

/**
 * (Isomorphic, pure.) ΣΥΝΟΛΙΚΗ ανάλυση πολλών προγραμμάτων για μία επιχείρηση: τα δικαιολογητικά όλων των
 * αξιολογήσεων ενώνονται σε ΜΙΑ λίστα — ίδιο έγγραφο με άλλη διατύπωση = μία γραμμή («Φορολογική ενημερότητα» ≈
 * «Αποδεικτικό φορολογικής ενημερότητας») — με τα προγράμματα που το ζητούν και την κατάστασή του για την επιχείρηση.
 */

type RequiredDoc = AssessmentResult['requiredDocuments'][number]
export type DocStatus = RequiredDoc['status']

export type CombinedDoc = {
  name: string
  issuer: string | null
  status: DocStatus
  /** Τίτλοι προγραμμάτων που το ζητούν. */
  programs: string[]
  notes: string[]
}

const STOP = new Set(['και', 'του', 'της', 'των', 'για', 'απο', 'στο', 'στην', 'στη', 'με', 'σε', 'το', 'τα', 'οι', 'η', 'ο', 'ή', 'ανα', 'κατα', 'προς', 'περι', 'επιχειρησης', 'εταιρειας', 'σε ισχυ', 'ισχυ', 'αποδεικτικο', 'βεβαιωση', 'πιστοποιητικο', 'αντιγραφο', 'επικυρωμενο'])
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()
export const docStems = (name: string) => new Set(fold(name).split(' ').filter(w => w.length >= 3 && !STOP.has(w)).map(w => w.slice(0, 6)))
function similar(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  // Πόσο από το ΜΙΚΡΟΤΕΡΟ όνομα καλύπτεται («Φορολογική ενημερότητα» μέσα σε «Φορολογική ενημερότητα σε ισχύ για είσπραξη»).
  return hit / Math.min(a.size, b.size)
}

/** «Υπάρχει» αν υπάρχει για ΕΣΤΩ ένα πρόγραμμα (ίδια επιχείρηση, ίδιο έγγραφο)· αλλιώς το πιο επείγον. */
const STATUS_RANK: Record<DocStatus, number> = { OK: 0, EXPIRED: 1, MISSING: 2, TO_PREPARE: 3 }

export function combineRequiredDocs(items: { programTitle: string; docs: RequiredDoc[] }[]): CombinedDoc[] {
  const groups: (CombinedDoc & { stems: Set<string> })[] = []
  for (const it of items) {
    for (const d of it.docs ?? []) {
      if (!d?.name?.trim()) continue
      const st = docStems(d.name)
      const g = groups.find(x => similar(x.stems, st) >= 0.75)
      if (!g) {
        groups.push({ name: d.name.trim(), issuer: d.issuer ?? null, status: d.status, programs: [it.programTitle], notes: d.note ? [d.note] : [], stems: st })
        continue
      }
      if (!g.programs.includes(it.programTitle)) g.programs.push(it.programTitle)
      if (STATUS_RANK[d.status] < STATUS_RANK[g.status]) g.status = d.status
      if (!g.issuer && d.issuer) g.issuer = d.issuer
      if (d.note && !g.notes.includes(d.note)) g.notes.push(d.note)
      if (d.name.trim().length < g.name.length) g.name = d.name.trim() // η πιο σύντομη (γενική) διατύπωση
      for (const w of st) g.stems.add(w)
    }
  }
  // Πρώτα όσα ζητούν τα περισσότερα προγράμματα· μέσα σε αυτά, πρώτα όσα θέλουν ενέργεια.
  const action = (s: DocStatus) => (s === 'OK' ? 1 : 0)
  return groups
    .map(({ stems: _s, ...g }) => { void _s; return g })
    .sort((a, b) => b.programs.length - a.programs.length || action(a.status) - action(b.status) || a.name.localeCompare(b.name, 'el'))
}

export type CombinedSummary = {
  programs: { assessmentId: string; title: string; probability: number; verdict: AssessmentResult['verdict']; submissionEnd: string | null }[]
  docs: CombinedDoc[]
  counts: { total: number; common: number; ok: number; toDo: number }
}

export function summarizeCombined(rows: { assessmentId: string; title: string; submissionEnd: string | null; result: AssessmentResult }[]): CombinedSummary {
  const docs = combineRequiredDocs(rows.map(r => ({ programTitle: r.title, docs: r.result.requiredDocuments ?? [] })))
  return {
    programs: rows.map(r => ({ assessmentId: r.assessmentId, title: r.title, probability: r.result.probability, verdict: r.result.verdict, submissionEnd: r.submissionEnd }))
      .sort((a, b) => b.probability - a.probability),
    docs,
    counts: { total: docs.length, common: docs.filter(d => d.programs.length > 1).length, ok: docs.filter(d => d.status === 'OK').length, toDo: docs.filter(d => d.status !== 'OK').length },
  }
}
