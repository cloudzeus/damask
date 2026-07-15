import type { PaymentOrder, PaymentStatus, Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { getSetting, setSetting, type CheckResult } from '@/lib/settings'

/**
 * Viva Payments (viva.com) — Smart Checkout integration. Δύο πλήρως ξεχωριστά
 * σετ credentials (demo/production) αποθηκευμένα ΜΑΖΙ κάτω από ένα setting key
 * ("integration.viva") με ένα ενεργό `environment` — η εναλλαγή είναι "με ένα
 * κλικ" γιατί δεν αγγίζει τα ίδια τα credentials, μόνο ποιο σετ είναι ενεργό.
 *
 * Αυτό το module ΔΕΝ ακολουθεί το γενικό IntegrationName/getIntegration
 * μηχανισμό του src/lib/settings.ts (εκείνο υποθέτει επίπεδα (flat) πεδία ανά
 * integration) — το σχήμα εδώ είναι εμφωλευμένο (demo/production) οπότε
 * διαβάζει/γράφει απευθείας μέσω getSetting/setSetting (που παραμένουν το
 * ΜΟΝΑΔΙΚΟ σημείο πρόσβασης στο Setting model, όπως ορίζει το settings.ts).
 */

export type VivaEnvironment = 'demo' | 'production'

export type VivaEnvConfig = {
  clientId?: string
  clientSecret?: string
  sourceCode?: string
  webhookVerificationKey?: string
  merchantId?: string
  apiKey?: string
  _lastCheck?: CheckResult
}

export type VivaSettings = {
  environment: VivaEnvironment
  bankInstructions: string
  demo: VivaEnvConfig
  production: VivaEnvConfig
}

const SETTING_KEY = 'integration.viva'

export async function getVivaSettings(): Promise<VivaSettings> {
  const saved = await getSetting<Partial<VivaSettings>>(SETTING_KEY)
  return {
    environment: saved?.environment === 'production' ? 'production' : 'demo',
    bankInstructions: typeof saved?.bankInstructions === 'string' ? saved.bankInstructions : '',
    demo: { ...(saved?.demo ?? {}) },
    production: { ...(saved?.production ?? {}) },
  }
}

/** Πεδία φόρμας (πάντα strings, ίδια σύμβαση με τα *Values του settings/actions.ts). */
export type VivaEnvInput = {
  clientId: string
  clientSecret: string
  sourceCode: string
  webhookVerificationKey: string
  merchantId: string
  apiKey: string
}

export type VivaSaveInput = {
  environment: VivaEnvironment
  bankInstructions: string
  demo: VivaEnvInput
  production: VivaEnvInput
}

/** Secret πεδία ανά environment — κενό στο submit σημαίνει «κράτα την ήδη αποθηκευμένη τιμή» (ίδια σύμβαση με saveIntegration). */
const VIVA_SECRET_FIELDS: readonly (keyof VivaEnvInput)[] = ['clientSecret', 'apiKey']

function mergeEnvConfig(existing: VivaEnvConfig, incoming: VivaEnvInput): VivaEnvConfig {
  const next: VivaEnvConfig = { ...existing }
  for (const [key, value] of Object.entries(incoming) as [keyof VivaEnvInput, string][]) {
    if (VIVA_SECRET_FIELDS.includes(key) && value.trim() === '') continue
    next[key] = value
  }
  return next
}

export async function saveVivaSettings(input: VivaSaveInput): Promise<void> {
  const existing = await getVivaSettings()
  const next: VivaSettings = {
    environment: input.environment,
    bankInstructions: input.bankInstructions,
    demo: mergeEnvConfig(existing.demo, input.demo),
    production: mergeEnvConfig(existing.production, input.production),
  }
  await setSetting(SETTING_KEY, next)
}

/** Αποτέλεσμα «Δοκιμή σύνδεσης» ανά environment — μέσα στο δικό του υπο-αντικείμενο, ώστε η εναλλαγή env να μη σβήνει το ιστορικό ελέγχου του άλλου. */
export async function saveVivaLastCheck(environment: VivaEnvironment, result: Omit<CheckResult, 'at'>): Promise<CheckResult> {
  const existing = await getVivaSettings()
  const check: CheckResult = { ...result, at: new Date().toISOString() }
  const next: VivaSettings = { ...existing, [environment]: { ...existing[environment], _lastCheck: check } }
  await setSetting(SETTING_KEY, next)
  return check
}

/** Ελάχιστα πεδία ώστε το environment να μπορεί να δημιουργήσει πληρωμές (χωρίς αυτά, «Μη ρυθμισμένο»). */
export function isVivaEnvConfigured(config: VivaEnvConfig): boolean {
  return Boolean(config.clientId?.trim() && config.clientSecret?.trim() && config.sourceCode?.trim())
}

export type VivaEnvUrls = { accounts: string; api: string; checkoutBase: string }

const VIVA_URLS: Record<VivaEnvironment, VivaEnvUrls> = {
  demo: {
    accounts: 'https://demo-accounts.vivapayments.com',
    api: 'https://demo-api.vivapayments.com',
    checkoutBase: 'https://demo.vivapayments.com/web/checkout',
  },
  production: {
    accounts: 'https://accounts.vivapayments.com',
    api: 'https://api.vivapayments.com',
    checkoutBase: 'https://www.vivapayments.com/web/checkout',
  },
}

export function vivaEnvUrls(environment: VivaEnvironment): VivaEnvUrls {
  return VIVA_URLS[environment]
}

export function vivaCheckoutUrl(environment: VivaEnvironment, orderCode: string): string {
  return `${VIVA_URLS[environment].checkoutBase}?ref=${orderCode}`
}

function envLabel(environment: VivaEnvironment): string {
  return environment === 'production' ? 'Παραγωγή' : 'Demo'
}

export type ResolvedVivaConfig = {
  environment: VivaEnvironment
  config: VivaEnvConfig
  urls: VivaEnvUrls
  bankInstructions: string
}

/** Resolve του ΕΝΕΡΓΟΥ environment + το αντίστοιχο σετ credentials/urls — καμία επικύρωση εδώ (τη γίνεται στα caller functions ώστε το μήνυμα λάθους να ταιριάζει στην πράξη που αποτυγχάνει). */
export async function getVivaConfig(): Promise<ResolvedVivaConfig> {
  const settings = await getVivaSettings()
  const environment = settings.environment
  const config = environment === 'production' ? settings.production : settings.demo
  return { environment, config, urls: vivaEnvUrls(environment), bankInstructions: settings.bankInstructions }
}

const SETTINGS_HINT = 'Ρύθμισε το Viva στις Ρυθμίσεις.'

/** Λείπουν required credentials — ο caller (server action) δείχνει το μήνυμα ΑΥΤΟΥΣΙΟ στον χρήστη (π.χ. στο dialog «Νέα πληρωμή»). */
export class VivaConfigError extends Error {
  constructor(missing: string, environment: VivaEnvironment) {
    super(`Το Viva (${envLabel(environment)}) δεν έχει ρυθμιστεί πλήρως — λείπει: ${missing}. ${SETTINGS_HINT}`)
    this.name = 'VivaConfigError'
  }
}

// ── OAuth2 client-credentials token — cache σε memory μέχρι λήξη ─────────

type TokenCacheEntry = { token: string; expiresAt: number }
const tokenCache = new Map<string, TokenCacheEntry>()

/** Εκτίθεται για tests / χειροκίνητο cache-bust — καθαρίζει το in-memory token cache. */
export function resetVivaTokenCache(): void {
  tokenCache.clear()
}

export async function getAccessToken(opts: { force?: boolean } = {}): Promise<string> {
  const { environment, config, urls } = await getVivaConfig()
  if (!config.clientId?.trim() || !config.clientSecret?.trim()) {
    throw new VivaConfigError('Client ID / Client Secret', environment)
  }

  const cacheKey = `${environment}:${config.clientId}`
  const now = Date.now()
  if (!opts.force) {
    const cached = tokenCache.get(cacheKey)
    if (cached && cached.expiresAt > now + 5_000) return cached.token
  }

  const basic = Buffer.from(`${config.clientId}:${config.clientSecret}`).toString('base64')
  const res = await fetch(`${urls.accounts}/connect/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', Authorization: `Basic ${basic}` },
    body: 'grant_type=client_credentials',
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Viva OAuth (${envLabel(environment)}) → HTTP ${res.status}${detail ? `: ${detail.slice(0, 300)}` : ''}`)
  }
  const data = (await res.json()) as { access_token?: string; expires_in?: number }
  if (!data.access_token) {
    throw new Error(`Viva OAuth (${envLabel(environment)}): η απάντηση δεν περιείχε access_token.`)
  }

  tokenCache.set(cacheKey, { token: data.access_token, expiresAt: now + (data.expires_in ?? 3600) * 1000 })
  return data.access_token
}

// ── Δημιουργία παραγγελίας πληρωμής (μοναδικός κωδικός) ──────────────────

export type CreatePaymentOrderInput = {
  amountCents: number
  description: string
  customerName?: string
  customerEmail?: string
  customerPhone?: string
  customerId?: string
  createdById?: string
}

export type CreatePaymentOrderResult = {
  payment: PaymentOrder
  checkoutUrl: string
}

export async function createPaymentOrder(input: CreatePaymentOrderInput): Promise<CreatePaymentOrderResult> {
  if (!Number.isInteger(input.amountCents) || input.amountCents <= 0) {
    throw new Error('Το ποσό πρέπει να είναι θετικός αριθμός.')
  }
  if (!input.description.trim()) {
    throw new Error('Η περιγραφή είναι υποχρεωτική.')
  }

  const { environment, config, urls } = await getVivaConfig()
  if (!config.sourceCode?.trim()) {
    throw new VivaConfigError('Source Code', environment)
  }
  const token = await getAccessToken()

  const body = {
    amount: input.amountCents,
    customerTrns: input.description,
    customer: {
      email: input.customerEmail?.trim() || undefined,
      fullName: input.customerName?.trim() || undefined,
      phone: input.customerPhone?.trim() || undefined,
      countryCode: 'GR',
      requestLang: 'el-GR',
    },
    paymentTimeout: 1800,
    preauth: false,
    sourceCode: config.sourceCode,
    merchantTrns: input.description,
    tags: ['damask-pim'],
  }

  const res = await fetch(`${urls.api}/checkout/v2/orders`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(15_000),
  })
  const rawText = await res.text()
  let json: Record<string, unknown> = {}
  try {
    json = rawText ? JSON.parse(rawText) : {}
  } catch {
    // μη-JSON απάντηση — αντιμετωπίζεται ως σφάλμα παρακάτω (λείπει orderCode)
  }

  if (!res.ok || json.orderCode === undefined || json.orderCode === null) {
    const detail = typeof json.error === 'string' ? json.error : (typeof json.Error === 'string' ? json.Error : rawText.slice(0, 300))
    throw new Error(`Αποτυχία δημιουργίας πληρωμής στο Viva (${envLabel(environment)}): HTTP ${res.status}${detail ? ` — ${detail}` : ''}`)
  }

  const orderCode = String(json.orderCode)
  const payment = await prisma.paymentOrder.create({
    data: {
      orderCode,
      amountCents: input.amountCents,
      description: input.description,
      customerName: input.customerName?.trim() || null,
      customerEmail: input.customerEmail?.trim() || null,
      customerId: input.customerId || null,
      environment,
      status: 'PENDING',
      raw: json as Prisma.InputJsonValue,
      createdById: input.createdById || null,
    },
  })

  return { payment, checkoutUrl: vivaCheckoutUrl(environment, orderCode) }
}

// ── Ανάκτηση συναλλαγής ────────────────────────────────────────────────

export async function getTransaction(transactionId: string): Promise<Record<string, unknown>> {
  const { environment, urls } = await getVivaConfig()
  const token = await getAccessToken()
  const res = await fetch(`${urls.api}/checkout/v2/transactions/${encodeURIComponent(transactionId)}`, {
    headers: { Authorization: `Bearer ${token}` },
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) {
    const detail = await res.text().catch(() => '')
    throw new Error(`Αποτυχία ανάκτησης συναλλαγής από το Viva (${envLabel(environment)}): HTTP ${res.status}${detail ? ` — ${detail.slice(0, 300)}` : ''}`)
  }
  return res.json()
}

/**
 * Best-effort ερμηνεία του Viva transaction `statusId` → τοπικό PaymentStatus.
 * Βασισμένο στα δημόσια Viva docs (F=Finished/paid, A=Authorized/εκκρεμεί
 * capture, E=Error, R=Reversed, C=Canceled) — ΔΕΝ έχει επιβεβαιωθεί ακόμα με
 * πραγματική production απάντηση (δεν υπήρχαν live credentials σε αυτή τη
 * φάση). Επιβεβαίωσε/διόρθωσε μόλις γίνει η πρώτη πραγματική κλήση —
 * βλ. concern στο commit message / report.
 */
export function interpretVivaStatusId(statusId: string | undefined | null): PaymentStatus | null {
  switch (statusId) {
    case 'F': return 'PAID'
    case 'E': return 'FAILED'
    case 'R': return 'FAILED'
    case 'C': return 'CANCELED'
    default: return null // 'A' (pending capture) ή άγνωστος κωδικός → μην αλλάξεις κατάσταση
  }
}

export type RefreshPaymentStatusResult = { payment: PaymentOrder; changed: boolean; checked: boolean }

/** «Έλεγχος κατάστασης» row action — GET transaction + best-effort ενημέρωση status. Χωρίς transactionId (ακόμα PENDING, δεν ήρθε webhook) δεν καλεί το Viva — `checked:false` ώστε ο caller να δείξει διαφορετικό μήνυμα από «ελέγχθηκε, καμία αλλαγή». */
export async function refreshPaymentOrderStatus(id: string): Promise<RefreshPaymentStatusResult> {
  const existing = await prisma.paymentOrder.findUniqueOrThrow({ where: { id } })
  if (!existing.transactionId) {
    return { payment: existing, changed: false, checked: false }
  }

  const transaction = await getTransaction(existing.transactionId)
  const statusId = typeof transaction.statusId === 'string'
    ? transaction.statusId
    : (typeof transaction.StatusId === 'string' ? transaction.StatusId : null)
  const mapped = interpretVivaStatusId(statusId)

  const data: Prisma.PaymentOrderUpdateInput = { raw: transaction as Prisma.InputJsonValue }
  const changed = Boolean(mapped && mapped !== existing.status)
  if (changed) {
    data.status = mapped!
    if (mapped === 'PAID' && !existing.paidAt) data.paidAt = new Date()
  }

  const payment = await prisma.paymentOrder.update({ where: { id }, data })
  return { payment, changed, checked: true }
}

// ── Webhook ────────────────────────────────────────────────────────────

export const VIVA_EVENT_PAYMENT_CREATED = 1796
export const VIVA_EVENT_PAYMENT_FAILED = 1797

export type VivaWebhookEvent = {
  EventTypeId: number
  EventData?: {
    TransactionId?: string
    OrderCode?: number | string
    StatusId?: string
    Amount?: number
    [key: string]: unknown
  }
}

/**
 * GET verification handshake: η Viva καλεί GET στο registered webhook URL και
 * περιμένει `{Key: <verification key>}`. ΑΠΛΟΠΟΙΗΣΗ v1 (βλ. brief): το key
 * αποθηκεύεται ως πεδίο ρυθμίσεων ανά environment (ο χρήστης το αντιγράφει
 * από GET {api}/api/messages/config/token στο Viva portal) — δεν το
 * ανακτούμε εμείς αυτόματα. Επιστρέφει null όταν το ενεργό environment δεν
 * έχει ακόμα key ρυθμισμένο (η route επιστρέφει 404 σε αυτή την περίπτωση).
 */
export async function verifyWebhookGet(): Promise<{ Key: string } | null> {
  const { config } = await getVivaConfig()
  const key = config.webhookVerificationKey?.trim()
  return key ? { Key: key } : null
}

export type ProcessWebhookResult = { handled: boolean; reason: string; orderCode?: string }

/**
 * Πυρήνας λογικής του POST webhook — ξεχωριστό από το route handler ώστε να
 * είναι unit-testable με mocked prisma. Η route ΠΑΝΤΑ απαντάει 200 (ακόμα και
 * σε άγνωστο orderCode/event type) — εδώ απλά αναφέρουμε `handled:false` +
 * `reason` για logging, δεν πετάει ποτέ.
 *
 * PAID/FAILED από τη Viva υπερισχύουν πάντα της τοπικής κατάστασης (ακόμα κι
 * αν κάποιος είχε κάνει τοπική «Ακύρωση») — η Viva είναι το source of truth
 * για το αν όντως πληρώθηκε.
 */
export async function processVivaWebhookEvent(event: VivaWebhookEvent): Promise<ProcessWebhookResult> {
  const rawOrderCode = event.EventData?.OrderCode
  if (rawOrderCode === undefined || rawOrderCode === null || rawOrderCode === '') {
    return { handled: false, reason: 'missing-order-code' }
  }
  const orderCode = String(rawOrderCode)

  const existing = await prisma.paymentOrder.findUnique({ where: { orderCode } })
  if (!existing) {
    return { handled: false, reason: 'unknown-order-code', orderCode }
  }

  if (event.EventTypeId === VIVA_EVENT_PAYMENT_CREATED) {
    await prisma.paymentOrder.update({
      where: { orderCode },
      data: {
        status: 'PAID',
        transactionId: event.EventData?.TransactionId ?? existing.transactionId,
        paidAt: new Date(),
        raw: event as unknown as Prisma.InputJsonValue,
      },
    })
    return { handled: true, reason: 'paid', orderCode }
  }

  if (event.EventTypeId === VIVA_EVENT_PAYMENT_FAILED) {
    await prisma.paymentOrder.update({
      where: { orderCode },
      data: {
        status: 'FAILED',
        transactionId: event.EventData?.TransactionId ?? existing.transactionId,
        raw: event as unknown as Prisma.InputJsonValue,
      },
    })
    return { handled: true, reason: 'failed', orderCode }
  }

  return { handled: false, reason: 'ignored-event-type', orderCode }
}
