/**
 * (Plain module, μνήμη διεργασίας.) «Μνήμη ορίων» για τα μοντέλα AI (κυρίως Gemini).
 *
 * Το Gemini απαντά 429 RESOURCE_EXHAUSTED με λεπτομέρειες: ποιο όριο εξαντλήθηκε (quotaId, π.χ.
 * «GenerateRequestsPerMinutePerProjectPerModel» ή «…PerDay…») και πόσο να περιμένουμε (RetryInfo.retryDelay «37s»).
 *  • Όριο ΑΝΑ ΛΕΠΤΟ → το μοντέλο «παγώνει» για όσο λέει· ΟΛΕΣ οι ταυτόχρονες κλήσεις περιμένουν (όχι καταιγισμός 429).
 *  • Όριο ΑΝΑ ΗΜΕΡΑ → το μοντέλο σημειώνεται εξαντλημένο ως την επαναφορά (μεσάνυχτα Pacific) και παρακάμπτεται —
 *    συνεχίζουν τα εφεδρικά μοντέλα (με δική τους ποσόστωση).
 */

export type QuotaKind = 'minute' | 'day' | 'unknown'
export type QuotaInfo = { kind: QuotaKind; retryMs: number | null; quotaId: string | null }

/** Ανάλυση σώματος σφάλματος 429 του Gemini. */
export function parseQuotaError(body: string): QuotaInfo {
  let quotaId: string | null = null
  let retryMs: number | null = null
  try {
    const j = JSON.parse(body) as { error?: { details?: { '@type'?: string; violations?: { quotaId?: string }[]; retryDelay?: string }[] } }
    for (const d of j.error?.details ?? []) {
      if (d.violations?.length && !quotaId) quotaId = d.violations[0].quotaId ?? null
      if (d.retryDelay) {
        const m = /^(\d+(?:\.\d+)?)s$/.exec(d.retryDelay)
        if (m) retryMs = Math.ceil(Number(m[1]) * 1000)
      }
    }
  } catch {
    const m = /retry in (\d+(?:\.\d+)?)s/i.exec(body)
    if (m) retryMs = Math.ceil(Number(m[1]) * 1000)
    quotaId = /PerDay/i.test(body) ? 'PerDay' : /PerMinute/i.test(body) ? 'PerMinute' : null
  }
  const kind: QuotaKind = quotaId && /PerDay/i.test(quotaId) ? 'day' : quotaId && /PerMinute/i.test(quotaId) ? 'minute' : 'unknown'
  return { kind, retryMs, quotaId }
}

/** Η επόμενη επαναφορά ημερήσιας ποσόστωσης Gemini: μεσάνυχτα ώρας Pacific (~10:00 ώρα Ελλάδας). */
export function nextDailyReset(now: Date = new Date()): Date {
  // Pacific ≈ UTC-8 (χειμώνας) / UTC-7 (καλοκαίρι) — παίρνουμε το πιο συντηρητικό (UTC-7 ⇒ 07:00 UTC, UTC-8 ⇒ 08:00 UTC).
  const r = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 8, 5))
  if (r.getTime() <= now.getTime()) r.setUTCDate(r.getUTCDate() + 1)
  return r
}

const cooldownUntil = new Map<string, number>()
const exhaustedUntil = new Map<string, number>()

/** Περίμενε όσο το μοντέλο είναι «παγωμένο» λόγω ορίου ανά λεπτό (μέγιστο maxWaitMs). false = θα περίμενε πολύ. */
export async function waitForModel(model: string, maxWaitMs = 90_000, now = Date.now, sleep = (ms: number) => new Promise(r => setTimeout(r, ms))): Promise<boolean> {
  const until = cooldownUntil.get(model) ?? 0
  const wait = until - now()
  if (wait <= 0) return true
  if (wait > maxWaitMs) return false
  await sleep(wait + Math.floor(Math.random() * 400))
  return true
}

export function noteMinuteLimit(model: string, retryMs: number | null, now = Date.now()): number {
  const ms = Math.min(Math.max(retryMs ?? 30_000, 5_000), 120_000)
  cooldownUntil.set(model, Math.max(cooldownUntil.get(model) ?? 0, now + ms))
  return ms
}

export function noteDailyLimit(model: string, now = new Date()): Date {
  const until = nextDailyReset(now)
  exhaustedUntil.set(model, until.getTime())
  return until
}

export function isExhausted(model: string, now = Date.now()): boolean {
  const u = exhaustedUntil.get(model)
  if (!u) return false
  if (u <= now) { exhaustedUntil.delete(model); return false }
  return true
}

export function exhaustedUntilOf(models: string[]): Date | null {
  const ts = models.map(m => exhaustedUntil.get(m)).filter((x): x is number => !!x)
  return ts.length ? new Date(Math.min(...ts)) : null
}

/** Σφάλμα «εξαντλήθηκε το όριο» — ο καλών μπορεί να το αναγνωρίσει (code) και να προγραμματίσει νέα προσπάθεια. */
export class AiQuotaError extends Error {
  constructor(message: string, readonly kind: QuotaKind, readonly retryAt: Date | null) {
    super(message)
    this.name = 'AiQuotaError'
  }
}

/** Για μηνύματα που περνούν από server action (χάνεται η κλάση): αναγνώριση από το κείμενο. */
export function isQuotaMessage(msg: string | null | undefined): 'minute' | 'day' | null {
  if (!msg) return null
  if (/ημερήσιο όριο|PerDay/i.test(msg)) return 'day'
  if (/όριο|429|RESOURCE_EXHAUSTED|quota|rate limit|tokens per minute/i.test(msg)) return 'minute'
  return null
}

/** Για δοκιμές. */
export function _resetQuotaState() { cooldownUntil.clear(); exhaustedUntil.clear() }
