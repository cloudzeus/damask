import { describe, it, expect } from 'vitest'
import {
  buildDailySeries,
  computeMailKpis,
  normalizeFailureEvent,
  mailRangeFromParam,
  type RawStatItem,
} from '@/lib/mailgun-stats'

const NOW = new Date('2026-07-25T12:00:00Z')

describe('mailRangeFromParam', () => {
  it('δέχεται 7/90, default 30 για οτιδήποτε άλλο', () => {
    expect(mailRangeFromParam('7')).toBe(7)
    expect(mailRangeFromParam('90')).toBe(90)
    expect(mailRangeFromParam('30')).toBe(30)
    expect(mailRangeFromParam('999')).toBe(30)
    expect(mailRangeFromParam(undefined)).toBe(30)
  })
})

describe('buildDailySeries', () => {
  it('γεμίζει κενές μέρες με μηδενικά και τελειώνει σήμερα (UTC)', () => {
    const items: RawStatItem[] = [
      {
        time: 'Fri, 24 Jul 2026 00:00:00 UTC',
        accepted: { total: 10 },
        delivered: { total: 9 },
        opened: { total: 4 },
        clicked: { total: 2 },
        failed: { permanent: { total: 1 }, temporary: { total: 2 } },
        complained: { total: 1 },
        unsubscribed: { total: 0 },
      },
    ]
    const series = buildDailySeries(items, 7, NOW)
    expect(series).toHaveLength(7)
    expect(series[0].day).toBe('2026-07-19')
    expect(series[6].day).toBe('2026-07-25')

    const jul24 = series.find(p => p.day === '2026-07-24')!
    expect(jul24.accepted).toBe(10)
    expect(jul24.failed).toBe(3) // permanent 1 + temporary 2
    expect(jul24.complained).toBe(1)

    const empty = series.find(p => p.day === '2026-07-20')!
    expect(empty).toMatchObject({ accepted: 0, delivered: 0, opened: 0, clicked: 0, failed: 0 })
  })

  it('αγνοεί items με μη-parsable time και ελλιπή πεδία γίνονται 0', () => {
    const items: RawStatItem[] = [
      { time: 'garbage' },
      { time: 'Sat, 25 Jul 2026 00:00:00 UTC', delivered: { total: 5 } },
    ]
    const series = buildDailySeries(items, 3, NOW)
    expect(series).toHaveLength(3)
    const today = series[2]
    expect(today.day).toBe('2026-07-25')
    expect(today.delivered).toBe(5)
    expect(today.accepted).toBe(0)
  })
})

describe('computeMailKpis', () => {
  it('αθροίζει τη σειρά και υπολογίζει ποσοστά με 1 δεκαδικό', () => {
    const series = buildDailySeries(
      [
        { time: 'Fri, 24 Jul 2026 00:00:00 UTC', accepted: { total: 100 }, delivered: { total: 90 }, opened: { total: 30 }, clicked: { total: 9 }, failed: { permanent: { total: 10 } } },
        { time: 'Sat, 25 Jul 2026 00:00:00 UTC', accepted: { total: 100 }, delivered: { total: 90 }, opened: { total: 31 }, clicked: { total: 9 } },
      ],
      7,
      NOW,
    )
    const kpis = computeMailKpis(series)
    expect(kpis.accepted).toBe(200)
    expect(kpis.delivered).toBe(180)
    expect(kpis.deliveryRate).toBe(90)
    expect(kpis.openRate).toBe(33.9) // 61/180
    expect(kpis.clickRate).toBe(10)
    expect(kpis.failRate).toBe(5)
  })

  it('μηδενικοί παρονομαστές δίνουν null (όχι NaN/Infinity)', () => {
    const kpis = computeMailKpis(buildDailySeries([], 7, NOW))
    expect(kpis.accepted).toBe(0)
    expect(kpis.deliveryRate).toBeNull()
    expect(kpis.openRate).toBeNull()
    expect(kpis.clickRate).toBeNull()
    expect(kpis.failRate).toBeNull()
  })
})

describe('normalizeFailureEvent', () => {
  it('προτιμά delivery-status.description, μετά message, μετά reason', () => {
    expect(
      normalizeFailureEvent({
        timestamp: 1_785_000_000,
        event: 'failed',
        severity: 'permanent',
        recipient: 'a@b.gr',
        reason: 'bounce',
        'delivery-status': { description: 'Previously bounced address', message: '550 user unknown' },
      }),
    ).toMatchObject({ recipient: 'a@b.gr', event: 'failed', severity: 'permanent', reason: 'Previously bounced address' })

    expect(
      normalizeFailureEvent({ event: 'failed', 'delivery-status': { message: '550 user unknown' } }).reason,
    ).toBe('550 user unknown')

    expect(normalizeFailureEvent({ event: 'failed', reason: 'suppress-bounce' }).reason).toBe('suppress-bounce')
  })

  it('fallback σε «Άγνωστος λόγος» και κενό at χωρίς timestamp', () => {
    const f = normalizeFailureEvent({ event: 'rejected' })
    expect(f.reason).toBe('Άγνωστος λόγος')
    expect(f.at).toBe('')
    expect(f.recipient).toBe('')
  })

  it('μετατρέπει epoch seconds σε ISO', () => {
    const f = normalizeFailureEvent({ timestamp: 1_785_000_000, event: 'failed' })
    expect(f.at).toBe(new Date(1_785_000_000 * 1000).toISOString())
  })
})
