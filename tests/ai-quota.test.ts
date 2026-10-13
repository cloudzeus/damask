import { describe, it, expect, beforeEach } from 'vitest'
import { parseQuotaError, nextDailyReset, noteMinuteLimit, noteDailyLimit, isExhausted, waitForModel, isQuotaMessage, _resetQuotaState } from '@/lib/ai/quota'

const body = (quotaId: string, retry: string) => JSON.stringify({ error: { code: 429, status: 'RESOURCE_EXHAUSTED', details: [
  { '@type': 'type.googleapis.com/google.rpc.QuotaFailure', violations: [{ quotaMetric: 'x', quotaId }] },
  { '@type': 'type.googleapis.com/google.rpc.RetryInfo', retryDelay: retry },
] } })

describe('ai quota', () => {
  beforeEach(() => _resetQuotaState())
  it('διακρίνει όριο ανά λεπτό / ανά ημέρα και διαβάζει retryDelay', () => {
    expect(parseQuotaError(body('GenerateRequestsPerMinutePerProjectPerModel-FreeTier', '37s'))).toEqual({ kind: 'minute', retryMs: 37000, quotaId: 'GenerateRequestsPerMinutePerProjectPerModel-FreeTier' })
    expect(parseQuotaError(body('GenerateRequestsPerDayPerProjectPerModel-FreeTier', '12s')).kind).toBe('day')
    expect(parseQuotaError('Resource exhausted. Please retry in 21.5s.').retryMs).toBe(21500)
  })
  it('επαναφορά ημερήσιας ποσόστωσης: επόμενο 08:05 UTC', () => {
    expect(nextDailyReset(new Date('2026-10-14T06:00:00Z')).toISOString()).toBe('2026-10-14T08:05:00.000Z')
    expect(nextDailyReset(new Date('2026-10-14T09:00:00Z')).toISOString()).toBe('2026-10-15T08:05:00.000Z')
  })
  it('εξαντλημένο μοντέλο παρακάμπτεται ως την επαναφορά', () => {
    noteDailyLimit('m', new Date('2026-10-14T06:00:00Z'))
    expect(isExhausted('m', Date.parse('2026-10-14T07:00:00Z'))).toBe(true)
    expect(isExhausted('m', Date.parse('2026-10-14T09:00:00Z'))).toBe(false)
  })
  it('όριο ανά λεπτό: οι επόμενες κλήσεις περιμένουν', async () => {
    let t = 1_000_000
    noteMinuteLimit('m', 10_000, t)
    const slept: number[] = []
    expect(await waitForModel('m', 90_000, () => t, async ms => { slept.push(ms); t += ms })).toBe(true)
    expect(slept[0]).toBeGreaterThanOrEqual(10_000)
    expect(await waitForModel('m', 5_000, () => 1_000_000)).toBe(false)
  })
  it('αναγνώριση μηνυμάτων ορίου', () => {
    expect(isQuotaMessage('Εξαντλήθηκε το ημερήσιο όριο του Gemini')).toBe('day')
    expect(isQuotaMessage('Gemini HTTP 429: RESOURCE_EXHAUSTED')).toBe('minute')
    expect(isQuotaMessage('κάτι άλλο')).toBeNull()
  })
})

import { isReadableText } from '@/lib/documents/text-quality'
describe('isReadableText', () => {
  it('απορρίπτει «σπασμένη» γραμματοσειρά PDF (χαρακτήρες ελέγχου)', () => {
    expect(isReadableText('\u0000 \u0001 \u0002 \u0002 \u0003 \u0004 '.repeat(40))).toBe(false)
    expect(isReadableText('ΠΕΡΙΟΔΙΚΗ ΔΗΛΩΣΗ ΦΠΑ — Σύνολο εκροών 84.098,95 Φόρος εκροών 20.183,75 ΑΦΜ 800785440 EFCC IKE Καλλιθέα 2022')).toBe(true)
    expect(isReadableText('λίγο')).toBe(false)
  })
})
