import { describe, it, expect } from 'vitest'
import {
  decideTrdrSodtype,
  matchLineToProducts,
  buildTrdrCreateFromInvoice,
  buildProductCreateFromLine,
} from '@/lib/invoice-flows/prep'

describe('decideTrdrSodtype', () => {
  it('maps purchase → 12 (Προμηθευτής)', () => {
    expect(decideTrdrSodtype('purchase')).toBe(12)
  })
  it('maps sale → 13 (Πελάτης)', () => {
    expect(decideTrdrSodtype('sale')).toBe(13)
  })
})

describe('matchLineToProducts', () => {
  const products = [
    { id: 'p1', code: 'ABC-123', name: 'Εντελώς Άσχετο Προϊόν' },
    { id: 'p2', code: 'XYZ-999', name: 'Καρέκλα Οξιάς Ξύλινη' },
  ]

  it('matches on exact code (case/trim-insensitive) even when the name differs', () => {
    const result = matchLineToProducts({ code: ' abc-123 ', name: 'Κάτι Άλλο' }, products)
    expect(result?.id).toBe('p1')
  })

  it('falls back to fuzzy name match when no code (or no code match) is given', () => {
    const result = matchLineToProducts({ name: 'Ξύλινη Καρέκλα Οξιάς' }, products)
    expect(result?.id).toBe('p2')
  })

  it('returns null when the best name similarity is below the shared threshold', () => {
    const result = matchLineToProducts({ name: 'Τελείως Διαφορετικό Πράγμα Ζ' }, products)
    expect(result).toBeNull()
  })

  it('returns null with no candidate products', () => {
    expect(matchLineToProducts({ name: 'Καρέκλα Οξιάς Ξύλινη' }, [])).toBeNull()
  })

  it('returns null when the line has neither a usable code nor a name', () => {
    expect(matchLineToProducts({ name: '' }, products)).toBeNull()
  })
})

describe('buildTrdrCreateFromInvoice', () => {
  const party = {
    name: 'Προμηθευτής ΑΕ',
    afm: '094014201',
    address: 'Οδός 1',
    city: 'Αθήνα',
    zip: '10559',
    phones: ['2101234567'],
    emails: ['info@example.gr'],
    website: 'https://example.gr',
    sodtype: 12 as const,
  }

  it('builds Trdr create data straight from OCR fields when no ΑΑΔΕ patch is given', () => {
    const data = buildTrdrCreateFromInvoice(party)
    expect(data.TRDR).toBeNull()
    expect(data.SODTYPE).toBe(12)
    expect(data.ISPROSP).toBe(0)
    expect(data.NAME).toBe('Προμηθευτής ΑΕ')
    expect(data.AFM).toBe('094014201')
    expect(data.ADDRESS).toBe('Οδός 1')
    expect(data.CITY).toBe('Αθήνα')
    expect(data.ZIP).toBe('10559')
    expect(data.PHONE01).toBe('2101234567')
    expect(data.EMAIL).toBe('info@example.gr')
    expect(data.WEBPAGE).toBe('https://example.gr')
  })

  it('overrides with non-null ΑΑΔΕ patch fields (ΑΑΔΕ is the more authoritative source)', () => {
    const data = buildTrdrCreateFromInvoice(party, {
      NAME: 'Επίσημη Επωνυμία ΑΕ',
      ADDRESS: 'Επίσημη Οδός 5',
      ZIP: '11111',
      CITY: null,
      foundingDate: new Date('2000-01-01'),
      aadeStatus: 'ΕΝΕΡΓΟΣ ΑΦΜ',
      aadeFirmKind: 'Κανονικό Καθεστώς',
      appLegalForm: 'ΑΕ',
    })
    expect(data.NAME).toBe('Επίσημη Επωνυμία ΑΕ')
    expect(data.ADDRESS).toBe('Επίσημη Οδός 5')
    expect(data.ZIP).toBe('11111')
    // null στο patch ΔΕΝ σβήνει την ήδη γνωστή OCR τιμή (omit-nulls merge)
    expect(data.CITY).toBe('Αθήνα')
    expect(data.foundingDate).toEqual(new Date('2000-01-01'))
    expect(data.aadeStatus).toBe('ΕΝΕΡΓΟΣ ΑΦΜ')
    expect(data.aadeFirmKind).toBe('Κανονικό Καθεστώς')
    expect(data.appLegalForm).toBe('ΑΕ')
  })

  it('omits phones/emails/website when the party has none', () => {
    const data = buildTrdrCreateFromInvoice({
      name: 'Χωρίς Στοιχεία', afm: null, sodtype: 13,
    })
    expect(data.PHONE01).toBeNull()
    expect(data.EMAIL).toBeNull()
    expect(data.WEBPAGE).toBeNull()
    expect(data.SODTYPE).toBe(13)
  })
})

describe('buildProductCreateFromLine', () => {
  it('uppercases and trims an OCR-provided code', () => {
    const data = buildProductCreateFromLine({ code: ' sku-001 ', name: 'Καρέκλα' })
    expect(data.code).toBe('SKU-001')
    expect(data.isActive).toBe(true)
    expect(data.status).toBe('DRAFT')
    expect(data.translations.create).toEqual([{ locale: 'el', name: 'Καρέκλα' }])
  })

  it('derives a code from the name (slugified, uppercased, OCR- prefixed) when no code is given', () => {
    const data = buildProductCreateFromLine({ name: 'Καρέκλα Οξιάς' })
    expect(data.code.startsWith('OCR-')).toBe(true)
    expect(data.code).toBe(data.code.toUpperCase())
    expect(data.translations.create[0].name).toBe('Καρέκλα Οξιάς')
  })

  it('falls back to a friendly Greek placeholder name when the line has no name', () => {
    const data = buildProductCreateFromLine({ name: '' })
    expect(data.translations.create[0].name).toBe('Είδος από τιμολόγιο')
    expect(data.code.startsWith('OCR-')).toBe(true)
  })
})
