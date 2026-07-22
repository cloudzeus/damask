import { describe, it, expect } from 'vitest'
import { normalizeApiJson, assertSafeIngestUrl } from '@/lib/ingestion/api-normalize'

describe('normalizeApiJson', () => {
  it('accepts a top-level array', () => {
    const r = normalizeApiJson([{ a: '1', b: 2 }, { a: '3' }])
    expect(r.records).toEqual([{ a: '1', b: '2' }, { a: '3' }])
    expect(r.sourceKeys.map(s => s.key)).toEqual(['a', 'b'])
  })
  it('unwraps {data:[…]} and {items:[…]}', () => {
    expect(normalizeApiJson({ data: [{ x: 1 }] }).records).toEqual([{ x: '1' }])
    expect(normalizeApiJson({ items: [{ y: 'z' }] }).records).toEqual([{ y: 'z' }])
  })
  it('wraps a single object into one record', () => {
    expect(normalizeApiJson({ name: 'A', afm: '1' }).records).toEqual([{ name: 'A', afm: '1' }])
  })
  it('drops nested objects/arrays (flat only) and stringifies scalars', () => {
    const r = normalizeApiJson([{ a: 1, nested: { x: 1 }, arr: [1], nil: null }])
    expect(r.records[0]).toEqual({ a: '1' })
  })
  it('throws on unrecognizable shapes', () => {
    expect(() => normalizeApiJson('hello')).toThrow()
    expect(() => normalizeApiJson(42)).toThrow()
  })
})

describe('assertSafeIngestUrl', () => {
  it('rejects non-https, localhost, and private ranges', () => {
    expect(() => assertSafeIngestUrl('http://example.com')).toThrow()
    expect(() => assertSafeIngestUrl('https://localhost/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://127.0.0.1/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://10.0.0.5/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://192.168.1.1/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://169.254.1.1/x')).toThrow()
  })
  it('accepts a public https url', () => {
    expect(() => assertSafeIngestUrl('https://api.example.com/v1/data')).not.toThrow()
  })
  it('rejects IPv6 loopback/local and IPv4-mapped IPv6', () => {
    expect(() => assertSafeIngestUrl('https://[::1]/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://[fd00::1]/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://[fe80::1]/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://[::ffff:127.0.0.1]/x')).toThrow()
  })
  it('rejects numeric/hex obfuscated hosts', () => {
    expect(() => assertSafeIngestUrl('https://2130706433/x')).toThrow()
    expect(() => assertSafeIngestUrl('https://0x7f000001/x')).toThrow()
  })
})
