import { describe, it, expect } from 'vitest'
import {
  lineNet, sumLines, vatGroups, computeVat, reconcile, checkInvoiceMath,
} from '@/lib/ocr/invoice-math'
import type { OcrLine, OcrTotals } from '@/lib/ocr/schema'

function line(partial: Partial<OcrLine>): OcrLine {
  return { description: '', quantity: null, unitPrice: null, vatPct: null, total: null, ...partial }
}
function totals(partial: Partial<OcrTotals>): OcrTotals {
  return { net: null, vat: null, gross: null, ...partial }
}

describe('lineNet', () => {
  it('trusts an explicit total over quantity×unitPrice', () => {
    expect(lineNet(line({ quantity: 2, unitPrice: 10, total: 999 }))).toBe(999)
  })
  it('falls back to quantity×unitPrice when total is missing', () => {
    expect(lineNet(line({ quantity: 3, unitPrice: 10 }))).toBe(30)
  })
  it('is 0 when neither total nor quantity/unitPrice are known', () => {
    expect(lineNet(line({}))).toBe(0)
    expect(lineNet(line({ quantity: 3 }))).toBe(0)
  })
})

describe('sumLines', () => {
  it('sums line nets, rounded to cents', () => {
    expect(sumLines([line({ total: 10.005 }), line({ total: 0.005 })])).toBeCloseTo(10.01, 2)
  })
})

describe('vatGroups / computeVat', () => {
  it('groups a single rate', () => {
    const lines = [line({ total: 100, vatPct: 24 }), line({ total: 50, vatPct: 24 })]
    expect(vatGroups(lines)).toEqual([{ rate: 24, net: 150, vat: 36 }])
    expect(computeVat(lines)).toBe(36)
  })
  it('groups multiple rates, sorted ascending by rate', () => {
    const lines = [line({ total: 100, vatPct: 24 }), line({ total: 100, vatPct: 13 }), line({ total: 50, vatPct: 24 })]
    expect(vatGroups(lines)).toEqual([
      { rate: 13, net: 100, vat: 13 },
      { rate: 24, net: 150, vat: 36 },
    ])
    expect(computeVat(lines)).toBe(49)
  })
  it('ignores lines without a vatPct', () => {
    const lines = [line({ total: 100, vatPct: 24 }), line({ total: 999 })]
    expect(vatGroups(lines)).toEqual([{ rate: 24, net: 100, vat: 24 }])
  })
})

describe('reconcile', () => {
  it('reconciles lines→net, VAT and grand total for a single-rate invoice', () => {
    const lines = [line({ total: 100, vatPct: 24 }), line({ total: 50, vatPct: 24 })]
    const r = reconcile(lines, totals({ net: 150, vat: 36, gross: 186 }))
    expect(r.sumNet).toBe(150)
    expect(r.linesVsNet?.ok).toBe(true)
    expect(r.vatOk).toBe(true)
    expect(r.totalOk).toBe(true)
    expect(r.hasMultipleRates).toBe(false)
  })

  it('flags a wrong net (lines vs totals.net)', () => {
    const r = reconcile([line({ total: 100, vatPct: 24 })], totals({ net: 120, vat: 24, gross: 144 }))
    expect(r.linesVsNet?.ok).toBe(false)
  })

  it('flags a wrong VAT', () => {
    const r = reconcile([line({ total: 100, vatPct: 24 })], totals({ net: 100, vat: 13, gross: 113 }))
    expect(r.vatOk).toBe(false)
  })

  it('flags a wrong gross total', () => {
    const r = reconcile([line({ total: 100, vatPct: 24 })], totals({ net: 100, vat: 24, gross: 999 }))
    expect(r.totalOk).toBe(false)
  })

  it('returns null checks when totals fields are absent (e.g. packing_list)', () => {
    const r = reconcile([line({ total: 100 })], totals({}))
    expect(r.linesVsNet).toBeNull()
    expect(r.vatOk).toBeNull()
    expect(r.totalOk).toBeNull()
  })

  it('tolerates sub-cent rounding within TOTALS_TOLERANCE', () => {
    const r = reconcile([line({ total: 29.1, vatPct: 24 })], totals({ net: 29.1, vat: 6.99, gross: 36.1 }))
    expect(r.vatOk).toBe(true) // computed 6.984 rounds to 6.98, within 0.02 of 6.99
  })
})

describe('checkInvoiceMath', () => {
  it('returns no flags for a fully consistent invoice', () => {
    const lines = [line({ total: 100, vatPct: 24 })]
    expect(checkInvoiceMath(lines, totals({ net: 100, vat: 24, gross: 124 }))).toEqual([])
  })

  it('flags lines_vs_net with a Greek message including both amounts', () => {
    const flags = checkInvoiceMath([line({ total: 100, vatPct: 24 })], totals({ net: 150, vat: 36, gross: 186 }))
    const flag = flags.find(f => f.code === 'lines_vs_net')
    expect(flag).toBeDefined()
    expect(flag!.severity).toBe('error')
    expect(flag!.message).toContain('100.00')
    expect(flag!.message).toContain('150.00')
  })

  it('flags vat_mismatch and total_mismatch independently', () => {
    // vat (10) is wrong vs computed (24), AND net+vat (110) doesn't match the stated gross (999) either.
    const flags = checkInvoiceMath([line({ total: 100, vatPct: 24 })], totals({ net: 100, vat: 10, gross: 999 }))
    expect(flags.map(f => f.code).sort()).toEqual(['total_mismatch', 'vat_mismatch'])
  })

  it('is neutral (no flags) when totals are mostly absent — e.g. packing_list', () => {
    const flags = checkInvoiceMath([line({ quantity: 5, description: 'Κιβώτια' })], totals({}))
    expect(flags).toEqual([])
  })
})
