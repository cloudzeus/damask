import type { ExtractedProgram } from '@/lib/programs/types'

/**
 * (Isomorphic, pure.) ΣΥΝΔΥΑΣΤΙΚΗ αποδελτίωση: ο επόμενος οδηγός (παράρτημα, τροποποίηση, λίστα ΚΑΔ, 2ο μέρος)
 * ΣΥΜΠΛΗΡΩΝΕΙ τον προηγούμενο αντί να τον σβήνει.
 *  · Λίστες (ΚΑΔ, περιφέρειες, νομικές μορφές, κατηγορίες, κριτήρια, προθεσμίες, φάσεις, παραδοτέα, έντυπα, bonus):
 *    ένωση με κλειδί το όνομα/κωδικό· ίδιο κλειδί → οι μη κενές τιμές του νεότερου υπερισχύουν.
 *  · Μεμονωμένες τιμές: του νεότερου όταν υπάρχει, αλλιώς οι προηγούμενες.
 *  · Κανόνας ΚΑΔ: ο πιο συγκεκριμένος (λίστα επιλέξιμων/αποκλεισμένων) υπερισχύει του «δεν αναφέρεται».
 */

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zα-ω0-9]+/g, ' ').trim()

/** Μη κενές τιμές (null/undefined/'' δεν σβήνουν τις προηγούμενες). */
function overlay<T extends object>(prev: T, next: T): T {
  const out = { ...prev } as Record<string, unknown>
  for (const [k, v] of Object.entries(next)) if (v !== null && v !== undefined && v !== '' && !(Array.isArray(v) && v.length === 0)) out[k] = v
  return out as T
}

/** Το όνομα/κωδικός της ΠΡΩΤΗΣ εμφάνισης μένει (ίδιο κλειδί, άλλη γραφή π.χ. πεζά). */
function keepIdentity<T>(first: T, merged: T): T {
  const f = first as Record<string, unknown>
  return { ...(merged as object), ...('name' in f ? { name: f.name } : {}), ...('code' in f ? { code: f.code } : {}) } as T
}

export function unionBy<T>(prev: T[] | undefined, next: T[] | undefined, key: (x: T) => string, merge: (a: T, b: T) => T = (a, b) => (typeof a === 'object' && a && b ? keepIdentity(a, overlay(a as object, b as object) as T) : b)): T[] {
  const out: T[] = []
  const at = new Map<string, number>()
  for (const x of [...(prev ?? []), ...(next ?? [])]) {
    const k = key(x)
    if (!k) continue
    const i = at.get(k)
    if (i === undefined) { at.set(k, out.length); out.push(x) } else out[i] = merge(out[i], x)
  }
  return out
}

const SPECIFIC_KAD_RULE = (r: string | null | undefined) => !!r && !/UNSPECIFIED|^null$/i.test(r)

export function mergeExtractedPrograms(prev: ExtractedProgram | null | undefined, next: ExtractedProgram): ExtractedProgram {
  if (!prev) return next
  const scalars = overlay(
    { ...prev, expenseCategories: [], deliverables: [], deliverableGroups: [], requiredForms: [], phases: [], kads: [], bonuses: [], criteria: [], deadlines: [], regions: [], eligibleLegalForms: [] },
    { ...next, expenseCategories: [], deliverables: [], deliverableGroups: [], requiredForms: [], phases: [], kads: [], bonuses: [], criteria: [], deadlines: [], regions: [], eligibleLegalForms: [] },
  )
  return {
    ...scalars,
    kadRule: SPECIFIC_KAD_RULE(next.kadRule) ? next.kadRule : SPECIFIC_KAD_RULE(prev.kadRule) ? prev.kadRule : next.kadRule ?? prev.kadRule,
    expenseCategories: unionBy(prev.expenseCategories, next.expenseCategories, c => norm(c.name)),
    deliverables: unionBy(prev.deliverables, next.deliverables, d => norm(d.name)),
    deliverableGroups: unionBy(prev.deliverableGroups, next.deliverableGroups, g => norm(g.name), (a, b) => ({ ...overlay(a, b), name: a.name, tasks: unionBy(a.tasks, b.tasks, t => norm(t.name)) })),
    requiredForms: unionBy(prev.requiredForms, next.requiredForms, f => norm(f.name)),
    phases: unionBy(prev.phases, next.phases, p => norm(p.name)),
    kads: unionBy(prev.kads, next.kads, k => k.code.replace(/\s+/g, '')),
    bonuses: unionBy(prev.bonuses, next.bonuses, b => norm(b.name)),
    criteria: unionBy(prev.criteria, next.criteria, c => norm(c.name)),
    deadlines: unionBy(prev.deadlines, next.deadlines, d => norm(d.name)),
    regions: unionBy(prev.regions, next.regions, r => norm(r.name)),
    eligibleLegalForms: unionBy(prev.eligibleLegalForms, next.eligibleLegalForms, f => norm(f), (a) => a),
  }
}
