import { describe, it, expect } from 'vitest'
import { getClientIp, FALLBACK_IP } from '@/lib/client-ip'

function headersFrom(values: Record<string, string | null>) {
  return { get: (name: string) => values[name.toLowerCase()] ?? null }
}

describe('getClientIp', () => {
  it('διαβάζει μία μόνο IP από x-forwarded-for', () => {
    const headers = headersFrom({ 'x-forwarded-for': '203.0.113.7' })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('παίρνει το ΠΡΩΤΟ (client) στοιχείο μιας αλυσίδας proxy — "client, proxy1, proxy2"', () => {
    const headers = headersFrom({ 'x-forwarded-for': '203.0.113.7, 70.41.3.18, 150.172.238.178' })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('κόβει τα κενά γύρω από κάθε στοιχείο της αλυσίδας', () => {
    const headers = headersFrom({ 'x-forwarded-for': '  203.0.113.7  ,70.41.3.18' })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('προσπερνά κενά (empty) στοιχεία στην αρχή της αλυσίδας', () => {
    const headers = headersFrom({ 'x-forwarded-for': ' , 203.0.113.7' })
    expect(getClientIp(headers)).toBe('203.0.113.7')
  })

  it('πέφτει σε x-real-ip όταν λείπει το x-forwarded-for', () => {
    const headers = headersFrom({ 'x-forwarded-for': null, 'x-real-ip': '198.51.100.23' })
    expect(getClientIp(headers)).toBe('198.51.100.23')
  })

  it('υποστηρίζει IPv6 διευθύνσεις', () => {
    const headers = headersFrom({ 'x-forwarded-for': '2001:db8::1' })
    expect(getClientIp(headers)).toBe('2001:db8::1')
  })

  it('πέφτει στο FALLBACK_IP όταν δεν υπάρχει κανένα header (local/dev χωρίς proxy)', () => {
    const headers = headersFrom({})
    expect(getClientIp(headers)).toBe(FALLBACK_IP)
    expect(FALLBACK_IP).toBe('127.0.0.1')
  })

  it('πέφτει στο FALLBACK_IP όταν τα headers είναι κενά strings', () => {
    const headers = headersFrom({ 'x-forwarded-for': '', 'x-real-ip': '' })
    expect(getClientIp(headers)).toBe(FALLBACK_IP)
  })
})
