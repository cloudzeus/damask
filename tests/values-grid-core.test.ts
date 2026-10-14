import { describe, it, expect } from 'vitest'
import { buildValuesGrid, gridToCsv, cellKey } from '@/lib/documents/values-grid-core'

const fields = [{ key: 'turnover', label: 'Κύκλος εργασιών', valueType: 'CURRENCY' }, { key: 'note', label: 'Παρατήρηση', valueType: 'TEXT' }]
const v = (period: string, text: string, fieldKey = 'turnover') => ({ fieldKey, period, value: null, text, verified: false, docId: null })

describe('πίνακας τιμών σειράς (Φ2 ανά μήνα)', () => {
  const g = buildValuesGrid({
    kind: 'MONTHLY', fields,
    values: [v('2021-01', '1.000,50'), v('2021-02', '2.000'), v('2021-04', '500')],
    docs: [{ id: 'd1', period: '2021-01', name: 'Φ2 01', mimeType: 'application/pdf' }, { id: 'd3', period: '2021-03', name: 'Φ2 03', mimeType: null }],
  })
  it('συνεχές διάστημα με τα κενά ορατά', () => {
    expect(g.columns.map(c => c.key)).toEqual(['2021-01', '2021-02', '2021-03', '2021-04'])
    expect(g.summary.missing).toEqual([])
    expect(g.summary.empty).toEqual(['2021-03'])
    expect(g.columns[0].doc?.id).toBe('d1')
  })
  it('σύνολο έτους μόνο για ποσά, με ελληνική μορφή αριθμών', () => {
    expect(g.totals[cellKey('turnover', '2021')]).toBe(3500.5)
    expect(g.totals[cellKey('note', '2021')]).toBeUndefined()
    expect(g.years[0]).toMatchObject({ year: 2021, have: 3, expected: 12 })
  })
  it('CSV με «;», κόμμα δεκαδικών και στήλη συνόλου', () => {
    const csv = gridToCsv(g)
    expect(csv.split('\r\n')[0]).toContain('Σύνολο 2021')
    expect(csv).toContain('1000,5')
    expect(csv).toContain('3500,5')
  })
})

describe('ετήσιο έντυπο (Ε3)', () => {
  it('στήλες έτη, κενό έτος = λείπει, χωρίς σύνολα', () => {
    const g = buildValuesGrid({ kind: 'YEARLY', fields, values: [v('2020', '10.000'), v('2022', '12.000')], docs: [] })
    expect(g.columns.map(c => c.key)).toEqual(['2020', '2021', '2022'])
    expect(g.summary.missing).toEqual(['2021'])
    expect(Object.keys(g.totals)).toHaveLength(0)
  })
  it('χωρίς τιμές και έγγραφα → κενός πίνακας', () => {
    expect(buildValuesGrid({ kind: 'YEARLY', fields, values: [], docs: [] }).columns).toEqual([])
  })
})

describe('μορφή κελιών ανά τύπο', () => {
  it('ημερομηνία από epoch, έτος χωρίς τελείες, ποσό ελληνικά', async () => {
    const { displayOf } = await import('@/lib/documents/values-grid-core')
    expect(displayOf('DATE', { value: Date.UTC(2019, 9, 9), text: null }).text).toMatch(/2019/)
    expect(displayOf('INTEGER', { value: 2018, text: null }).text).toBe('2018')
    expect(displayOf('CURRENCY', { value: null, text: '1.234,5' }).text).toBe('1.234,5')
  })
})

describe('υπόλοιπα', () => {
  it('το πιστωτικό υπόλοιπο δεν αθροίζεται', () => {
    const g = buildValuesGrid({ kind: 'MONTHLY', fields: [{ key: 'bal', label: 'Πιστωτικό υπόλοιπο (κωδ. 502)', valueType: 'CURRENCY' }], values: [v('2021-01', '10', 'bal')], docs: [] })
    expect(g.fields[0].summable).toBe(false)
  })
})
