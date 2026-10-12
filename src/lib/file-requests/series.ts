import { prisma } from '@/lib/prisma'
import { isSeriesKind, type SeriesKind } from '@/lib/documents/series'

/**
 * (Plain module.) Σειρές στα αιτήματα δικαιολογητικών (/r/…): ποιος τύπος-σειρά (π.χ. «Φ2 - ΦΠΑ», μηνιαία) αντιστοιχεί
 * σε ένα ζητούμενο. Προτεραιότητα: ο τύπος που έχει ήδη το ζητούμενο → ο τύπος που αναγνώρισε η AI στον browser
 * (όνομα) → ταίριασμα του ονόματος του ζητούμενου με τύπο-σειρά (π.χ. «Φ2 τελευταίων 12 μηνών» ↔ «Φ2 - ΦΠΑ»).
 */
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const tokens = (s: string) => fold(s).split(/[^a-zα-ω0-9]+/).filter(t => t.length >= 2 && !['και', 'των', 'της', 'του', 'για', 'απο'].includes(t))

export type SeriesTypeRow = { id: string; name: string; seriesKind: string | null }

export function loadSeriesTypes(): Promise<SeriesTypeRow[]> {
  return prisma.documentType.findMany({ where: { active: true, seriesKind: { not: null } }, select: { id: true, name: true, seriesKind: true } })
}

/** Καθαρή αντιστοίχιση (χωρίς DB) — για πολλά ζητούμενα με μία φόρτωση τύπων. */
export function matchSeriesType(types: SeriesTypeRow[], item: { label: string; documentTypeId: string | null }, recognizedTypeName?: string | null): { id: string; kind: SeriesKind } | null {
  const ok = (t: SeriesTypeRow | undefined) => (t && isSeriesKind(t.seriesKind) ? { id: t.id, kind: t.seriesKind } : null)
  if (item.documentTypeId) return ok(types.find(t => t.id === item.documentTypeId))
  if (recognizedTypeName) {
    const r = ok(types.find(t => fold(t.name) === fold(recognizedTypeName)))
    if (r) return r
  }
  // Ταίριασμα ονόματος: όλες οι «ουσιαστικές» λέξεις του τύπου υπάρχουν στο ζητούμενο, ή ο χαρακτηριστικός κωδικός
  // του τύπου (π.χ. «φ2», «απδ») εμφανίζεται ως λέξη.
  const label = new Set(tokens(item.label))
  for (const t of types) {
    const tt = tokens(t.name)
    const code = tt.find(w => /\d/.test(w) || w.length <= 4)
    if ((tt.length && tt.every(w => label.has(w))) || (code && label.has(code))) return ok(t)
  }
  return null
}

export async function seriesTypeForItem(item: { label: string; documentTypeId: string | null }, recognizedTypeName?: string | null): Promise<{ id: string; kind: SeriesKind } | null> {
  return matchSeriesType(await loadSeriesTypes(), item, recognizedTypeName)
}
