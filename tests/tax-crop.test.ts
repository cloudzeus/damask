import { describe, it, expect } from 'vitest'
import { bboxToPixelRect } from '@/lib/tax/crop'

describe('bboxToPixelRect', () => {
  it('maps a normalized bbox to integer pixel rect within the page', () => {
    expect(bboxToPixelRect([0.1, 0.2, 0.3, 0.4], 1000, 2000)).toEqual({ sx: 100, sy: 400, sw: 300, sh: 800 })
  })
  it('clamps to page bounds', () => {
    expect(bboxToPixelRect([0.9, 0.9, 0.5, 0.5], 100, 100)).toEqual({ sx: 90, sy: 90, sw: 10, sh: 10 })
  })
})
