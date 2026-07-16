/**
 * ΑΑΔΕ αναζήτηση στοιχείων επιχείρησης από ΑΦΜ — μέσω της δικής μας υπηρεσίας
 * vat.wwa.gr/afm2info (ΟΧΙ πλέον το δημόσιο GSIS SOAP RgWsPublic2, ΟΧΙ credentials).
 *
 * POST https://vat.wwa.gr/afm2info  body: { afm: "094019245" }
 * → { basic_rec: {...}, firm_act_tab: { item: [] | {} } }
 *
 * basic_rec.deactivation_flag === '1' ΚΑΙ χωρίς stop_date ⇒ ενεργή επιχείρηση.
 * firm_act_tab.item μπορεί να είναι array, ένα μεμονωμένο object, ή απόν —
 * κανονικοποιείται πάντα σε array. firm_act_kind === '1' ⇒ κύρια δραστηριότητα.
 */

import { logApiUsage } from '@/lib/api-usage'

const AADE_ENDPOINT = 'https://vat.wwa.gr/afm2info'
const REQUEST_TIMEOUT_MS = 10_000

export type AadeActivityKind = 'PRIMARY' | 'SECONDARY'

export type AadeActivity = {
  code: string | null
  description: string | null
  kind: AadeActivityKind
}

export type AadeCompany = {
  afm: string
  name: string
  shortName: string | null
  doy: string | null
  legalForm: string | null
  address: string | null
  zip: string | null
  city: string | null
  country: string
  foundingDate: string | null
  profession: string | null
  activities: AadeActivity[]
  aadeStatus: string | null
  isActive: boolean
}

/** Λάθος αναζήτησης ΑΑΔΕ με φιλικό ελληνικό μήνυμα — δεν σημαίνει "δεν βρέθηκε" (αυτό είναι `null` return). */
export class AadeLookupError extends Error {}

/**
 * AADE/ΓΕΜΗ-style responses μπορεί να επιστρέψουν nil markers αντί για JSON null
 * σε κάποια endpoints· εδώ το vat.wwa.gr επιστρέφει καθαρό JSON, αλλά κρατάμε
 * την ίδια ανεκτική κανονικοποίηση για ασφάλεια (κενό string/whitespace → null).
 */
function s(v: unknown): string | null {
  if (v == null) return null
  if (typeof v === 'string') return v.trim() || null
  if (typeof v === 'number' || typeof v === 'boolean') return String(v)
  return null
}

type FirmActRaw = {
  firm_act_code?: unknown
  firm_act_descr?: unknown
  firm_act_kind?: unknown
}

type AadeRawResponse = {
  basic_rec?: Record<string, unknown>
  firm_act_tab?: { item?: FirmActRaw | FirmActRaw[] }
}

function normalizeActivities(raw: AadeRawResponse['firm_act_tab']): AadeActivity[] {
  const item = raw?.item
  const items: FirmActRaw[] = item == null ? [] : (Array.isArray(item) ? item : [item])
  return items.map(a => ({
    code: s(a?.firm_act_code),
    description: s(a?.firm_act_descr),
    kind: s(a?.firm_act_kind) === '1' ? 'PRIMARY' : 'SECONDARY',
  }))
}

/**
 * Αναζήτηση στοιχείων επιχείρησης από ΑΦΜ μέσω vat.wwa.gr/afm2info.
 * - Επιστρέφει `null` όταν το ΑΦΜ δεν βρέθηκε στο μητρώο (όχι σφάλμα).
 * - Πετάει `AadeLookupError` (ελληνικό μήνυμα) για μη έγκυρο ΑΦΜ, timeout, HTTP/δικτυακό σφάλμα.
 */
export async function aadeLookup(afm: string): Promise<AadeCompany | null> {
  const clean = String(afm ?? '').trim()
  if (!/^\d{9}$/.test(clean)) {
    throw new AadeLookupError('Το ΑΦΜ πρέπει να έχει 9 ψηφία.')
  }

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
      throw new AadeLookupError(`Η υπηρεσία ΑΑΔΕ (vat.wwa.gr) επέστρεψε σφάλμα HTTP ${res.status}.`)
    }
    raw = await res.json()
  } catch (err) {
    if (err instanceof AadeLookupError) throw err
    if (err instanceof Error && (err.name === 'TimeoutError' || err.name === 'AbortError')) {
      throw new AadeLookupError('Η υπηρεσία ΑΑΔΕ (vat.wwa.gr) δεν απάντησε έγκαιρα (10s). Δοκίμασε ξανά.')
    }
    throw new AadeLookupError('Αδυναμία σύνδεσης με την υπηρεσία ΑΑΔΕ (vat.wwa.gr). Δοκίμασε ξανά σε λίγο.')
  }

  // "Επιτυχία" εδώ σημαίνει ότι η υπηρεσία απάντησε (HTTP ok + JSON parse) —
  // μετράει ως 1 αναζήτηση ΑΝΕΞΑΡΤΗΤΑ αν το ΑΦΜ βρέθηκε στο μητρώο ή όχι.
  void logApiUsage({ service: 'aade', operation: 'lookup', units: 1 })

  const b = raw?.basic_rec
  if (!b || !s(b.afm)) return null

  const activities = normalizeActivities(raw?.firm_act_tab)
  const profession = activities.find(a => a.kind === 'PRIMARY')?.description ?? activities[0]?.description ?? null

  const stopDate = s(b.stop_date)
  const isActive = s(b.deactivation_flag) === '1' && !stopDate

  const addressParts = [s(b.postal_address), s(b.postal_address_no)].filter(Boolean)

  return {
    afm: s(b.afm) ?? clean,
    name: s(b.onomasia) ?? '',
    shortName: s(b.commer_title),
    doy: s(b.doy_descr),
    legalForm: s(b.legal_status_descr),
    address: addressParts.join(' ') || null,
    zip: s(b.postal_zip_code),
    city: s(b.postal_area_description),
    country: 'GR',
    foundingDate: s(b.regist_date),
    profession,
    activities,
    aadeStatus: s(b.deactivation_flag_descr),
    isActive,
  }
}
