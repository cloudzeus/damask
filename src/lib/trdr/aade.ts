/**
 * ΑΑΔΕ αναζήτηση στοιχείων επιχείρησης από ΑΦΜ — Trdr-shaped variant of
 * src/lib/aade.ts (εκείνο επιστρέφει company-profile-shaped πεδία για τη
 * Ρύθμιση→Εταιρεία). Αυτό εδώ επιστρέφει `{ mapped, activities }` σε Trdr
 * field-names (NAME/ADDRESS/ZIP/CITY/…) για το src/lib/trdr/enrich-actions.ts
 * (aadeLookupTrdr/applyAadeToTrdr, T3). Η καθαρή ανάλυση payload μένει στο
 * pure aade-map.ts (unit-testable χωρίς δίκτυο — tests/trdr-aade-map.test.ts).
 *
 * POST https://vat.wwa.gr/afm2info { afm } — καμία πιστοποίηση δεν απαιτείται.
 */

import { logApiUsage } from '@/lib/api-usage'
import {
  normalizeAfm,
  isValidAfm,
  mapAadeResponse,
  type AadeRawResponse,
  type AadeTrdrActivity,
  type AadeTrdrPatch,
} from '@/lib/trdr/aade-map'

export { normalizeAfm, isValidAfm }
export type { AadeTrdrActivity, AadeTrdrPatch }

const AADE_ENDPOINT = 'https://vat.wwa.gr/afm2info'
const REQUEST_TIMEOUT_MS = 10_000

/** Λάθος αναζήτησης ΑΑΔΕ (μη έγκυρο ΑΦΜ, timeout, HTTP/δικτυακό σφάλμα) — ελληνικό μήνυμα. */
export class AadeError extends Error {}

/**
 * Επιστρέφει `{ mapped, activities }`, ή `null` όταν το ΑΦΜ δεν βρέθηκε στο
 * μητρώο ΑΑΔΕ (όχι σφάλμα). Πετάει `AadeError` για μη έγκυρο ΑΦΜ, timeout,
 * δικτυακό ή HTTP σφάλμα.
 */
export async function aadeLookup(
  afm: string,
): Promise<{ mapped: AadeTrdrPatch; activities: AadeTrdrActivity[] } | null> {
  const clean = normalizeAfm(afm)
  if (!isValidAfm(clean)) throw new AadeError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')

  let raw: AadeRawResponse
  try {
    const res = await fetch(AADE_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ afm: clean }),
      cache: 'no-store',
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    })
    if (!res.ok) {
      throw new AadeError(`Η υπηρεσία ΑΑΔΕ (vat.wwa.gr) επέστρεψε σφάλμα HTTP ${res.status}.`)
    }
    raw = await res.json()
  } catch (err) {
    if (err instanceof AadeError) throw err
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AadeError('Η υπηρεσία ΑΑΔΕ (vat.wwa.gr) δεν απάντησε έγκαιρα (10s). Δοκίμασε ξανά.')
    }
    throw new AadeError('Αδυναμία σύνδεσης με την υπηρεσία ΑΑΔΕ (vat.wwa.gr). Δοκίμασε ξανά σε λίγο.')
  }

  // «Επιτυχία» εδώ σημαίνει ότι η υπηρεσία απάντησε (HTTP ok + JSON parse) —
  // μετράει ως 1 αναζήτηση ΑΝΕΞΑΡΤΗΤΑ αν το ΑΦΜ βρέθηκε στο μητρώο ή όχι
  // (ίδιο idiom με src/lib/aade.ts).
  void logApiUsage({ service: 'aade', operation: 'trdr-lookup', units: 1 })

  return mapAadeResponse(raw)
}
