/** (Καθαρό module — χρησιμοποιείται και σε server και σε client.) Κανόνας λήξης δικαιολογητικών. */

export const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const el = (iso: string) => iso.split('-').reverse().join('/')

/**
 * Λήξη: (1) ό,τι αναγράφει/συνάγεται από το έγγραφο (π.χ. λήξη θητείας ΔΣ στην ανακοίνωση ΓΕΜΗ),
 * αλλιώς (2) κανόνας τύπου «ισχύς Χ ημέρες από την έκδοση» (π.χ. Γενικό Πιστοποιητικό ΓΕΜΗ = τρίμηνο).
 */
export function resolveExpiry(t: { expires: boolean; validityDays?: number | null } | null | undefined, ai: { issuedAt: string | null; expiresAt: string | null; expiryBasis?: string | null } | null): { expiresAt: string | null; expiryNote: string | null } {
  if (!ai) return { expiresAt: null, expiryNote: null }
  // Ρητή λήξη μέσα στο έγγραφο (π.χ. θητεία ΔΣ) μετράει ακόμα κι αν ο τύπος γενικά δεν λήγει.
  if (ai.expiresAt && (t?.expires || ai.expiryBasis)) return { expiresAt: ai.expiresAt, expiryNote: ai.expiryBasis || 'Αναγράφεται στο έγγραφο' }
  if (!t?.expires) return { expiresAt: null, expiryNote: null }
  if (t.validityDays && ai.issuedAt) {
    return { expiresAt: addDays(ai.issuedAt, t.validityDays), expiryNote: `Έκδοση ${el(ai.issuedAt)} + ${t.validityDays} ημέρες (κανόνας τύπου)` }
  }
  return { expiresAt: null, expiryNote: null }
}
