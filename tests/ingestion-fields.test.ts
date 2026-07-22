import { describe, it, expect } from 'vitest'
import { afmField, emailField, intEnumField } from '@/lib/ingestion/fields'

describe('afmField', () => {
  const f = afmField({ key: 'afm', label: 'ΑΦΜ', required: true })
  it('accepts plain, EL-prefixed, and spaced AFMs', () => {
    expect(f.parse('094014201')).toEqual({ value: '094014201', error: null })
    expect(f.parse('EL094014201')).toEqual({ value: '094014201', error: null })
    expect(f.parse('EL 094014201')).toEqual({ value: '094014201', error: null })
    expect(f.parse('094 014 201')).toEqual({ value: '094014201', error: null })
  })
  it('rejects wrong length + empty-when-required', () => {
    expect(f.parse('123').error).toBeTruthy()
    expect(f.parse('   ').error).toBeTruthy()
  })
  it('optional empty → null, no error', () => {
    const o = afmField({ key: 'afm', label: 'ΑΦΜ' })
    expect(o.parse('')).toEqual({ value: null, error: null })
  })
})

describe('emailField', () => {
  const f = emailField({ key: 'email', label: 'Email' })
  it('accepts valid, rejects malformed incl. trailing/double dots', () => {
    expect(f.parse('info@damask.gr')).toEqual({ value: 'info@damask.gr', error: null })
    expect(f.parse('nope').error).toBeTruthy()
    expect(f.parse('a@b.c.').error).toBeTruthy()
    expect(f.parse('a@b..com').error).toBeTruthy()
  })
  it('optional empty → null', () => { expect(f.parse('')).toEqual({ value: null, error: null }) })
})

describe('intEnumField', () => {
  const f = intEnumField({ key: 'sodtype', label: 'Τύπος', allowed: [12, 13], defaultValue: 13 })
  it('empty → default; valid passes; invalid errors', () => {
    expect(f.parse('')).toEqual({ value: 13, error: null })
    expect(f.parse('12')).toEqual({ value: 12, error: null })
    expect(f.parse('99').error).toBeTruthy()
  })
})
