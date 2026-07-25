import { getIntegration } from '@/lib/settings'

/**
 * Ανάγνωση Mailgun analytics για τη σελίδα «Αναφορά Email» (/mail-report):
 * Stats API (ημερήσια σύνολα accepted/delivered/opened/clicked/failed/…)
 * + Events API (πρόσφατες αποτυχίες με λόγο). Ίδιο config pattern με το
 * src/lib/mailer.ts — getIntegration('mailgun'), region-aware base URL,
 * Basic auth, AbortSignal timeouts. Όλα τα σφάλματα επιστρέφονται ως typed
 * αποτελέσματα (ποτέ throw) ώστε κάθε ενότητα της σελίδας να δείχνει δικό
 * της empty/error state χωρίς να ρίχνει το υπόλοιπο report.
 *
 * Οι καθαροί mappers (buildDailySeries, computeMailKpis, normalizeFailureEvent)
 * είναι exported χωρίς I/O για unit tests.
 */

type StoredMailgunConfig = { apiKey?: string; domain?: string; region?: string }

export type MailRange = 7 | 30 | 90

export function mailRangeFromParam(raw: string | undefined): MailRange {
  return raw === '7' ? 7 : raw === '90' ? 90 : 30
}

/** Ένα σημείο της ημερήσιας σειράς — μόνο totals, ό,τι δείχνει το γράφημα. */
export type MailgunDailyPoint = {
  /** YYYY-MM-DD (UTC ημέρα του Mailgun bucket) */
  day: string
  accepted: number
  delivered: number
  opened: number
  clicked: number
  failed: number
  complained: number
  unsubscribed: number
}

export type MailKpis = {
  accepted: number
  delivered: number
  opened: number
  clicked: number
  failed: number
  complained: number
  unsubscribed: number
  /** Ποσοστά 0–100, null όταν ο παρονομαστής είναι 0 (εμφανίζεται «—»). */
  deliveryRate: number | null
  openRate: number | null
  clickRate: number | null
  failRate: number | null
}

export type MailgunStatsResult =
  | { ok: true; series: MailgunDailyPoint[]; kpis: MailKpis }
  | { ok: false; configured: boolean; error: string }

export type MailFailure = {
  /** ISO timestamp */
  at: string
  recipient: string
  /** failed | rejected | complained */
  event: string
  /** permanent | temporary | '' */
  severity: string
  reason: string
}

export type MailFailuresResult =
  | { ok: true; failures: MailFailure[] }
  | { ok: false; configured: boolean; error: string }

/* ------------------------------------------------------------------ */
/* Καθαροί mappers (χωρίς I/O) — unit-tested στο mailgun-stats.test.ts */
/* ------------------------------------------------------------------ */

/** Σχήμα του Stats API: κάθε event είναι αντικείμενο με total (+ επιμέρους breakdown που αγνοούμε). */
export type RawStatItem = {
  time: string
  accepted?: { total?: number }
  delivered?: { total?: number }
  opened?: { total?: number }
  clicked?: { total?: number }
  failed?: { permanent?: { total?: number }; temporary?: { total?: number } }
  complained?: { total?: number }
  unsubscribed?: { total?: number }
}

function utcDayKey(d: Date): string {
  return d.toISOString().slice(0, 10)
}

/**
 * Κανονικοποίηση των raw stats σε πλήρη ημερήσια σειρά `days` σημείων που
 * τελειώνει σήμερα (UTC) — οι μέρες χωρίς traffic γεμίζουν με μηδενικά ώστε
 * το γράφημα να μη «σπάει» σε κενά και ο άξονας να έχει σταθερό βήμα.
 */
export function buildDailySeries(items: RawStatItem[], days: number, now: Date = new Date()): MailgunDailyPoint[] {
  const byDay = new Map<string, RawStatItem>()
  for (const item of items) {
    const t = new Date(item.time)
    if (!Number.isNaN(t.getTime())) byDay.set(utcDayKey(t), item)
  }

  const series: MailgunDailyPoint[] = []
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(now)
    d.setUTCDate(d.getUTCDate() - i)
    const day = utcDayKey(d)
    const raw = byDay.get(day)
    series.push({
      day,
      accepted: raw?.accepted?.total ?? 0,
      delivered: raw?.delivered?.total ?? 0,
      opened: raw?.opened?.total ?? 0,
      clicked: raw?.clicked?.total ?? 0,
      failed: (raw?.failed?.permanent?.total ?? 0) + (raw?.failed?.temporary?.total ?? 0),
      complained: raw?.complained?.total ?? 0,
      unsubscribed: raw?.unsubscribed?.total ?? 0,
    })
  }
  return series
}

function rate(numerator: number, denominator: number): number | null {
  if (denominator <= 0) return null
  return Math.round((numerator / denominator) * 1000) / 10
}

export function computeMailKpis(series: MailgunDailyPoint[]): MailKpis {
  const sum = (pick: (p: MailgunDailyPoint) => number) => series.reduce((acc, p) => acc + pick(p), 0)
  const accepted = sum(p => p.accepted)
  const delivered = sum(p => p.delivered)
  const opened = sum(p => p.opened)
  const clicked = sum(p => p.clicked)
  const failed = sum(p => p.failed)
  return {
    accepted,
    delivered,
    opened,
    clicked,
    failed,
    complained: sum(p => p.complained),
    unsubscribed: sum(p => p.unsubscribed),
    deliveryRate: rate(delivered, accepted),
    openRate: rate(opened, delivered),
    clickRate: rate(clicked, delivered),
    failRate: rate(failed, accepted),
  }
}

/** Σχήμα item του Events API — μόνο τα πεδία που διαβάζουμε. */
export type RawEventItem = {
  timestamp?: number
  event?: string
  severity?: string
  recipient?: string
  reason?: string
  'delivery-status'?: { message?: string; description?: string; code?: number | string }
}

/**
 * Λόγος αποτυχίας με fallback αλυσίδα: delivery-status.description →
 * delivery-status.message → reason → «Άγνωστος λόγος». Το description είναι
 * το πιο ανθρώπινο («Not delivering to previously bounced address»), το
 * message το raw SMTP (π.χ. «550 5.1.1 user unknown»).
 */
export function normalizeFailureEvent(item: RawEventItem): MailFailure {
  const ds = item['delivery-status']
  const reason = ds?.description?.trim() || ds?.message?.trim() || item.reason?.trim() || 'Άγνωστος λόγος'
  return {
    at: item.timestamp ? new Date(item.timestamp * 1000).toISOString() : '',
    recipient: item.recipient ?? '',
    event: item.event ?? '',
    severity: item.severity ?? '',
    reason,
  }
}

/* ------------------------------------------------------------------ */
/* Fetchers                                                            */
/* ------------------------------------------------------------------ */

type MailgunAccess = { base: string; domain: string; auth: string }

async function loadAccess(): Promise<MailgunAccess | null> {
  const cfg = await getIntegration<StoredMailgunConfig>('mailgun')
  if (!cfg.apiKey?.trim() || !cfg.domain?.trim()) return null
  return {
    base: cfg.region === 'EU' ? 'https://api.eu.mailgun.net' : 'https://api.mailgun.net',
    domain: cfg.domain,
    auth: `Basic ${Buffer.from(`api:${cfg.apiKey}`).toString('base64')}`,
  }
}

const NOT_CONFIGURED = 'Το Mailgun δεν έχει ρυθμιστεί (apiKey/domain) — Ρυθμίσεις → Integrations.'

export async function fetchMailgunStats(days: MailRange): Promise<MailgunStatsResult> {
  const access = await loadAccess()
  if (!access) return { ok: false, configured: false, error: NOT_CONFIGURED }

  const params = new URLSearchParams({ resolution: 'day', duration: `${days}d` })
  for (const ev of ['accepted', 'delivered', 'failed', 'opened', 'clicked', 'complained', 'unsubscribed']) {
    params.append('event', ev)
  }

  try {
    const res = await fetch(`${access.base}/v3/${access.domain}/stats/total?${params}`, {
      headers: { Authorization: access.auth },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, configured: true, error: `Mailgun HTTP ${res.status}: ${detail.slice(0, 200)}` }
    }
    const data = (await res.json()) as { stats?: RawStatItem[] }
    const series = buildDailySeries(data.stats ?? [], days)
    return { ok: true, series, kpis: computeMailKpis(series) }
  } catch (err) {
    return { ok: false, configured: true, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function fetchRecentFailures(limit = 25): Promise<MailFailuresResult> {
  const access = await loadAccess()
  if (!access) return { ok: false, configured: false, error: NOT_CONFIGURED }

  const params = new URLSearchParams({ event: 'failed OR rejected OR complained', limit: String(limit) })

  try {
    const res = await fetch(`${access.base}/v3/${access.domain}/events?${params}`, {
      headers: { Authorization: access.auth },
      cache: 'no-store',
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) {
      const detail = await res.text().catch(() => '')
      return { ok: false, configured: true, error: `Mailgun HTTP ${res.status}: ${detail.slice(0, 200)}` }
    }
    const data = (await res.json()) as { items?: RawEventItem[] }
    return { ok: true, failures: (data.items ?? []).map(normalizeFailureEvent) }
  } catch (err) {
    return { ok: false, configured: true, error: err instanceof Error ? err.message : String(err) }
  }
}
