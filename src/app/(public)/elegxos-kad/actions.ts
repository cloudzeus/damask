'use server'

import { suggestKad, checkKad, type KadSuggestion, type KadCheckResult } from '@/lib/seo-content/kad-check'

/** Δημόσια (χωρίς σύνδεση) — μόνο ανάγνωση μητρώου ΚΑΔ και ενεργών δημόσιων προγραμμάτων. */
export async function kadSuggestAction(q: string): Promise<KadSuggestion[]> {
  return suggestKad(String(q ?? '')).catch(() => [])
}

export async function kadCheckAction(code: string): Promise<KadCheckResult> {
  return checkKad(String(code ?? '')).catch(() => null)
}
