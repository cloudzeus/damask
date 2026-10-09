import { getIntegration } from '@/lib/settings'

/**
 * Envato (Elements / Market) — personal token από build.envato.com (Ρυθμίσεις → Διασυνδέσεις → Envato Elements).
 * Προς το παρόν μόνο αποθήκευση + δοκιμή σύνδεσης· για μελλοντική χρήση (π.χ. φωτογραφίες/πρότυπα στο Media Gallery).
 */

export const ENVATO_API_BASE = 'https://api.envato.com'
export type EnvatoConfig = { apiKey?: string }

export async function envatoFetch(path: string, init: RequestInit = {}): Promise<Response> {
  const c = await getIntegration<EnvatoConfig>('envato')
  if (!c.apiKey?.trim()) throw new Error('Δεν έχει ρυθμιστεί το Envato (Ρυθμίσεις → Διασυνδέσεις).')
  return fetch(`${ENVATO_API_BASE}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${c.apiKey.trim()}`, 'User-Agent': 'WWA (wwa.gr)', ...(init.headers ?? {}) },
    signal: init.signal ?? AbortSignal.timeout(20_000),
  })
}

export async function testEnvato(config: EnvatoConfig): Promise<{ ok: boolean; message: string }> {
  if (!config.apiKey?.trim()) return { ok: false, message: 'Συμπλήρωσε το API key (personal token).' }
  try {
    const res = await fetch(`${ENVATO_API_BASE}/whoami`, {
      headers: { Authorization: `Bearer ${config.apiKey.trim()}`, 'User-Agent': 'WWA (wwa.gr)' },
      signal: AbortSignal.timeout(15_000),
    })
    if (res.status === 401 || res.status === 403) return { ok: false, message: 'Μη έγκυρο ή ληγμένο token.' }
    if (!res.ok) return { ok: false, message: `Το Envato επέστρεψε HTTP ${res.status}.` }
    const j = await res.json().catch(() => null) as { userId?: number; scopes?: string[] } | null
    const scopes = j?.scopes?.length ? ` — δικαιώματα: ${j.scopes.join(', ')}` : ''
    return { ok: true, message: `Επιτυχής σύνδεση με το Envato${j?.userId ? ` (χρήστης #${j.userId})` : ''}${scopes}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης (${err instanceof Error ? err.message : String(err)}).` }
  }
}
