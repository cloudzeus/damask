import iconv from 'iconv-lite'

/**
 * Καθαρές, standalone συναρτήσεις «Δοκιμή σύνδεσης» για τις κάρτες integrations
 * του /settings. Καμία δεν αγγίζει τη DB (ούτε καν prisma import) — μόνο δίκτυο,
 * άρα εύκολα unit-testable με mocked global fetch (ίδιο idiom με tests/softone.test.ts).
 * Ποτέ δεν πετάνε: πάντα επιστρέφουν { ok, message } — ο caller (server action)
 * αποφασίζει τι αποθηκεύει ως _lastCheck.
 */

export type TestResult = { ok: boolean; message: string }

const TEST_TIMEOUT_MS = 15_000

function missingFieldsMessage(fields: string[]): string {
  return `Συμπλήρωσε: ${fields.join(', ')}.`
}

// ── SoftOne ──────────────────────────────────────────────

export type SoftOneTestConfig = {
  serial?: string
  username?: string
  password?: string
  appId?: string
  company?: string
  branch?: string
  module?: string
  refid?: string
}

/**
 * Standalone login→authenticate ΜΕ ΤΑ ΔΟΘΕΝΤΑ creds — δεν χρησιμοποιεί το
 * src/lib/softone.ts (κρατάει δικό του clientID) και ΔΕΝ γράφει καθόλου στο
 * S1Session — ο πίνακας session-cache του production client μένει ανέγγιχτος.
 */
export async function testSoftOne(config: SoftOneTestConfig): Promise<TestResult> {
  const missing = (['serial', 'username', 'password', 'appId'] as const).filter(f => !config[f]?.trim())
  if (missing.length > 0) return { ok: false, message: missingFieldsMessage(missing) }

  const baseUrl = `https://${config.serial}.oncloud.gr/s1services`

  async function s1Fetch(body: object): Promise<Record<string, unknown>> {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
      cache: 'no-store',
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    const buffer = await res.arrayBuffer()
    const text = iconv.decode(Buffer.from(buffer), 'win1253')
    if (!res.ok) throw new Error(`HTTP ${res.status}`)
    try {
      return JSON.parse(text)
    } catch {
      throw new Error('μη έγκυρη απάντηση')
    }
  }

  try {
    const login = await s1Fetch({
      SERVICE: 'Login',
      USERNAME: config.username,
      PASSWORD: config.password,
      APPID: config.appId,
      VERSION: '2',
    })
    if (!login.success) {
      return { ok: false, message: `Αποτυχία login: ${login.error ?? login.errorcode ?? 'άγνωστο σφάλμα'}` }
    }
    const auth = await s1Fetch({
      service: 'authenticate',
      clientID: login.clientID,
      COMPANY: config.company,
      BRANCH: config.branch,
      MODULE: config.module,
      REFID: config.refid,
      VERSION: '2',
    })
    if (!auth.success) {
      return { ok: false, message: `Αποτυχία authenticate: ${auth.error ?? auth.errorcode ?? 'άγνωστο σφάλμα'}` }
    }
    return { ok: true, message: 'Επιτυχής σύνδεση με το SoftOne.' }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με το SoftOne (${errMsg(err)}).` }
  }
}

// ── Mailgun ──────────────────────────────────────────────

export type MailgunTestConfig = { apiKey?: string; domain?: string; region?: string }

export async function testMailgun(config: MailgunTestConfig): Promise<TestResult> {
  const missing = (['apiKey', 'domain'] as const).filter(f => !config[f]?.trim())
  if (missing.length > 0) return { ok: false, message: missingFieldsMessage(missing) }

  const base = config.region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net'
  try {
    const res = await fetch(`${base}/v3/domains/${encodeURIComponent(config.domain!)}`, {
      headers: { Authorization: `Basic ${Buffer.from(`api:${config.apiKey}`).toString('base64')}` },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    if (res.status === 200) return { ok: true, message: 'Επιτυχής σύνδεση με το Mailgun.' }
    if (res.status === 401) return { ok: false, message: 'Μη έγκυρο API key.' }
    if (res.status === 404) return { ok: false, message: 'Το domain δεν βρέθηκε στο Mailgun.' }
    return { ok: false, message: `Το Mailgun επέστρεψε HTTP ${res.status}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με το Mailgun (${errMsg(err)}).` }
  }
}

// ── BunnyCDN ─────────────────────────────────────────────

export type BunnyTestConfig = { storageZone?: string; storagePassword?: string; storageApi?: string }

export async function testBunny(config: BunnyTestConfig): Promise<TestResult> {
  const missing = (['storageZone', 'storagePassword', 'storageApi'] as const).filter(f => !config[f]?.trim())
  if (missing.length > 0) return { ok: false, message: missingFieldsMessage(missing) }

  try {
    const base = config.storageApi!.replace(/\/+$/, '')
    const res = await fetch(`${base}/${config.storageZone}/`, {
      headers: { AccessKey: config.storagePassword! },
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    if (res.status === 200) return { ok: true, message: 'Επιτυχής σύνδεση με το BunnyCDN.' }
    if (res.status === 401) return { ok: false, message: 'Μη έγκυρο storage password (AccessKey).' }
    if (res.status === 404) return { ok: false, message: 'Η storage zone δεν βρέθηκε.' }
    return { ok: false, message: `Το BunnyCDN επέστρεψε HTTP ${res.status}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με το BunnyCDN (${errMsg(err)}).` }
  }
}

// ── DeepSeek ─────────────────────────────────────────────

export type DeepSeekTestConfig = { apiKey?: string; apiUrl?: string; model?: string }

export const DEEPSEEK_DEFAULT_API_URL = 'https://api.deepseek.com/v1/chat/completions'
export const DEEPSEEK_DEFAULT_MODEL = 'deepseek-chat'

export async function testDeepSeek(config: DeepSeekTestConfig): Promise<TestResult> {
  if (!config.apiKey?.trim()) return { ok: false, message: missingFieldsMessage(['apiKey']) }

  const apiUrl = config.apiUrl?.trim() || DEEPSEEK_DEFAULT_API_URL
  const model = config.model?.trim() || DEEPSEEK_DEFAULT_MODEL
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${config.apiKey}` },
      body: JSON.stringify({ model, messages: [{ role: 'user', content: 'ping' }], max_tokens: 5 }),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    if (res.status === 200) return { ok: true, message: 'Επιτυχής σύνδεση με το DeepSeek.' }
    if (res.status === 401) return { ok: false, message: 'Μη έγκυρο API key.' }
    const detail = await safeErrorDetail(res)
    return { ok: false, message: `Το DeepSeek επέστρεψε HTTP ${res.status}${detail ? ` — ${detail}` : ''}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με το DeepSeek (${errMsg(err)}).` }
  }
}

// ── Claude API ───────────────────────────────────────────

export type ClaudeTestConfig = { apiKey?: string; model?: string }

export const CLAUDE_DEFAULT_MODEL = 'claude-fable-5'

export async function testClaude(config: ClaudeTestConfig): Promise<TestResult> {
  if (!config.apiKey?.trim()) return { ok: false, message: missingFieldsMessage(['apiKey']) }

  const model = config.model?.trim() || CLAUDE_DEFAULT_MODEL
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey!,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({ model, max_tokens: 8, messages: [{ role: 'user', content: 'ping' }] }),
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    if (res.status === 200) return { ok: true, message: 'Επιτυχής σύνδεση με το Claude API.' }
    if (res.status === 401) return { ok: false, message: 'Μη έγκυρο API key.' }
    const detail = await safeErrorDetail(res)
    return { ok: false, message: `Το Claude API επέστρεψε HTTP ${res.status}${detail ? ` — ${detail}` : ''}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με το Claude API (${errMsg(err)}).` }
  }
}

// ── Viva Payments ────────────────────────────────────────

export type VivaTestConfig = { clientId?: string; clientSecret?: string }

const VIVA_ACCOUNTS_URL: Record<'demo' | 'production', string> = {
  demo: 'https://demo-accounts.vivapayments.com',
  production: 'https://accounts.vivapayments.com',
}

/**
 * Standalone OAuth2 client-credentials request ΜΕ ΤΑ ΔΟΘΕΝΤΑ creds — δεν αγγίζει
 * το in-memory token cache του src/lib/viva.ts (εκείνο είναι για πραγματικές
 * κλήσεις προς checkout/v2, όχι για το κουμπί «Δοκιμή σύνδεσης»).
 */
export async function testViva(environment: 'demo' | 'production', config: VivaTestConfig): Promise<TestResult> {
  const missing = (['clientId', 'clientSecret'] as const).filter(f => !config[f]?.trim())
  if (missing.length > 0) return { ok: false, message: missingFieldsMessage(missing) }

  const envLabel = environment === 'production' ? 'Παραγωγή' : 'Demo'
  try {
    const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
    const res = await fetch(`${VIVA_ACCOUNTS_URL[environment]}/connect/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
      body: 'grant_type=client_credentials',
      signal: AbortSignal.timeout(TEST_TIMEOUT_MS),
    })
    if (res.status === 200) return { ok: true, message: `Επιτυχής σύνδεση με το Viva (${envLabel}).` }
    if (res.status === 400 || res.status === 401) return { ok: false, message: 'Μη έγκυρα Client ID / Client Secret.' }
    const detail = await safeErrorDetail(res)
    return { ok: false, message: `Το Viva επέστρεψε HTTP ${res.status}${detail ? ` — ${detail}` : ''}.` }
  } catch (err) {
    return { ok: false, message: `Αποτυχία σύνδεσης με το Viva (${errMsg(err)}).` }
  }
}

// ── helpers ──────────────────────────────────────────────

async function safeErrorDetail(res: Response): Promise<string | null> {
  try {
    const data = (await res.clone().json()) as { error?: { message?: string } | string }
    if (typeof data.error === 'string') return data.error
    if (data.error?.message) return data.error.message
    return null
  } catch {
    return null
  }
}

function errMsg(err: unknown): string {
  if (err instanceof DOMException && err.name === 'TimeoutError') return 'λήξη χρόνου αναμονής'
  return err instanceof Error ? err.message : String(err)
}
