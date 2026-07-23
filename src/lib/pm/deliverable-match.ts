// PURE matcher for C2g Task 13 — suggests, for one extracted deliverable group
// name, which DELIVERABLE_CATALOG entry or which OTHER program's library
// template it likely corresponds to. The annex tables (ΠΑΡΑΡΤΗΜΑ ΧΙ) are
// roughly the same across ΕΣΠΑ programs, but wording/order/ΚΑΔ-prefix vary
// per document, so exact-string matching is not enough.
//
// No prisma/react/clock imports here on purpose — this stays a plain,
// synchronously-testable module. `src/lib/pm/actions.ts` (server-only) wires
// it up to real DB queries.

export type MatchCandidate = { key: string; source: 'catalog' | 'library'; name: string; score: number }

// Unicode combining diacritical marks block — what NFD-decomposition splits
// accents/tones into (Greek τόνος included, e.g. ά → α + U+0301).
const COMBINING_MARKS = /[̀-ͯ]/g

/**
 * lowercase, strip accents/tones (NFD-decompose then drop combining marks —
 * works for Greek τόνος the same way it works for Latin diacritics), strip
 * punctuation/digits (keep letters + whitespace only), collapse whitespace.
 */
export function normalizeName(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_MARKS, '')
    .replace(/[^\p{L}\s]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Character bigrams of a single token; single-char tokens fall back to the token itself. */
function tokenBigrams(token: string): string[] {
  if (token.length <= 1) return token ? [token] : []
  const grams: string[] = []
  for (let i = 0; i < token.length - 1; i++) grams.push(token.slice(i, i + 2))
  return grams
}

/** Union of per-token character-bigrams for a normalized name (bigrams never cross word boundaries). */
function bigramSet(s: string): Set<string> {
  const set = new Set<string>()
  for (const token of normalizeName(s).split(' ')) {
    if (!token) continue
    for (const g of tokenBigrams(token)) set.add(g)
  }
  return set
}

/**
 * Jaccard similarity (0..1) over the union of normalized-token character
 * bigrams. Using bigrams instead of whole-word equality gives partial credit
 * to shared word stems under Greek inflection (e.g. «μισθολογικό» vs
 * «μισθοδοσία» both starting «μισθο-») without needing a real stemmer.
 * Two empty names are trivially identical (1); one empty vs non-empty is 0.
 */
export function nameSimilarity(a: string, b: string): number {
  const sa = bigramSet(a)
  const sb = bigramSet(b)
  if (sa.size === 0 && sb.size === 0) return 1
  if (sa.size === 0 || sb.size === 0) return 0
  let intersection = 0
  for (const g of sa) if (sb.has(g)) intersection++
  const union = sa.size + sb.size - intersection
  return union === 0 ? 0 : intersection / union
}

/** Suggests matches for one extracted deliverable-group name, sorted by score desc, above `threshold`. */
export function suggestMatches(
  extractedName: string,
  candidates: { key: string; source: 'catalog' | 'library'; name: string }[],
  threshold = 0.45,
): MatchCandidate[] {
  return candidates
    .map((c) => ({ key: c.key, source: c.source, name: c.name, score: nameSimilarity(extractedName, c.name) }))
    .filter((c) => c.score >= threshold)
    .sort((a, b) => b.score - a.score)
}
