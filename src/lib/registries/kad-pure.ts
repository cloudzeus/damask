/**
 * KAD (Greek Activity Code) — pure helpers, ported from the reference PIM's
 * lib/kad/decoder.ts (normalizeKad) and lib/kad/resolve.ts (stripKadDots, formatKadDots,
 * ensurePrimaryActivity). NO prisma/react/clock imports here — the server-side
 * decodeKADCode/resolveKadForActivity (which query prisma and call these) live in kad.ts.
 */

/**
 * Strip everything except digits. NOT padded — storage uses variable-length raw digits.
 * (ref: lib/kad/decoder.ts normalizeKad)
 */
export function normalizeKad(input: string): string {
  return input.replace(/[^0-9]/g, '')
}

/**
 * Strip all non-digit characters. Used to derive `codeWithoutDots`.
 * (ref: lib/kad/resolve.ts stripKadDots — same contract as normalizeKad, kept as a
 * separate export to preserve the two ref call-sites' naming.)
 */
export function stripKadDots(input: string): string {
  return (input ?? '').replace(/[^0-9]/g, '')
}

/**
 * Format raw digits to canonical Greek KAD dotted form (pairs joined by dots).
 *   "56101104" → "56.10.11.04"
 *   "5690"     → "56.90"
 *   "568000"   → "56.80.00"
 * Trailing zeros are NOT stripped here — we only insert dots. Use the canonical
 * dotted form so the UI is consistent regardless of whether KadCode has a match.
 */
export function formatKadDots(input: string): string {
  if (!input) return input
  if (input.includes('.')) return input.trim()
  const digits = input.replace(/[^0-9]/g, '')
  if (digits.length === 0) return input
  const out: string[] = []
  for (let i = 0; i < digits.length; i += 2) out.push(digits.slice(i, i + 2))
  return out.join('.')
}

/**
 * Ensure exactly one activity is marked as PRIMARY. If the AADE/ΓΕΜΗ response
 * has none flagged (rare but happens for inactive firms or partial records),
 * promote the first item. Idempotent.
 */
export function ensurePrimaryActivity<T extends { kind: 'PRIMARY' | 'SECONDARY' }>(activities: T[]): T[] {
  if (activities.length === 0) return activities
  const hasPrimary = activities.some((a) => a.kind === 'PRIMARY')
  if (hasPrimary) return activities
  return activities.map((a, i) => (i === 0 ? { ...a, kind: 'PRIMARY' as const } : a))
}
