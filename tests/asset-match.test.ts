import { describe, it, expect } from 'vitest'
import { matchAll, assetRequired, type AssetItem, type ExpenseForMatch } from '@/lib/pm/asset-match'

const items: AssetItem[] = [
  { code: '14-09-058', description: '2 GHZ DSX2-8000 CERTIFIBER OLTS QUAD', date: '2024-05-02', qty: 1, value: 24599, docNo: null, serial: null },
  { code: '14-09-062', description: 'CRC-181QI/KPL-N6 GREE PULAR', date: '2024-05-16', qty: 3, value: 629.21, docNo: null, serial: null },
  { code: '14-09-063', description: 'CRC-181QI/KPL-N6 GREE PULAR OUT', date: '2024-05-16', qty: 3, value: 947.16, docNo: null, serial: null },
  { code: '14-03-01-010', description: 'DELL Server R430 S/N 9BL1YK2-20291532338', date: '2021-06-09', qty: 1, value: 4963, docNo: null, serial: null },
]
const exp = (p: Partial<ExpenseForMatch>): ExpenseForMatch => ({ id: Math.random().toString(36), description: 'Εξοπλισμός', categoryName: 'Μηχανήματα – Εξοπλισμός', net: 0, invoiceNumber: null, invoiceDate: null, lineTexts: [], serials: [], ...p })

describe('asset-match', () => {
  it('ίδια ημερομηνία + αξία → OK', () => {
    const [m] = matchAll([exp({ net: 24599, invoiceNumber: '512', invoiceDate: '2024-05-02', lineTexts: ['DSX2-8000 CertiFiber'] })], items)
    expect(m.status).toBe('OK')
    expect(m.items[0].code).toBe('14-09-058')
  })
  it('τιμολόγιο με πολλά είδη ίδιας ημερομηνίας → άθροισμα', () => {
    const [m] = matchAll([exp({ net: 1576.37, invoiceNumber: 'Α77', invoiceDate: '2024-05-15' })], items)
    expect(m.status).toBe('OK')
    expect(m.items).toHaveLength(2)
  })
  it('σειριακός αριθμός', () => {
    const [m] = matchAll([exp({ net: 4963, invoiceNumber: '9', invoiceDate: '2021-06-01', serials: ['9BL1YK2'] })], items)
    expect(m.items[0].code).toBe('14-03-01-010')
    expect(m.status).toBe('DATE_DIFF')
  })
  it('δεν βρέθηκε / δεν απαιτείται', () => {
    const [a, b] = matchAll([exp({ net: 999, invoiceNumber: '1', invoiceDate: '2024-01-01' }), exp({ net: 20000, categoryName: 'Δαπάνες προβολής και εξωστρέφειας' })], items)
    expect(a.status).toBe('NOT_FOUND')
    expect(b.status).toBe('NOT_REQUIRED')
    expect(assetRequired('Μισθολογικό κόστος νέων εργαζομένων', '')).toBe(false)
  })
})
