import { describe, it, expect } from 'vitest'
import { fitToCanvas, CANVAS_SIZE, MARGIN } from '@/lib/image-fit'

describe('fitToCanvas()', () => {
  it('σταθερές: canvas 1920, margin 50', () => {
    expect(CANVAS_SIZE).toBe(1920)
    expect(MARGIN).toBe(50)
  })

  it('landscape 3640x1820 -> dw 1820, dh 910, dx 50, dy 505', () => {
    expect(fitToCanvas(3640, 1820)).toEqual({ dw: 1820, dh: 910, dx: 50, dy: 505 })
  })

  it('portrait 910x1820 -> dw 910, dh 1820, dx 505, dy 50', () => {
    expect(fitToCanvas(910, 1820)).toEqual({ dw: 910, dh: 1820, dx: 505, dy: 50 })
  })

  it('square 100x100 (upscale) -> dw 1820, dh 1820, dx 50, dy 50', () => {
    expect(fitToCanvas(100, 100)).toEqual({ dw: 1820, dh: 1820, dx: 50, dy: 50 })
  })

  it('ήδη 1920x1920 square -> dw 1820, dh 1820, dx 50, dy 50', () => {
    expect(fitToCanvas(1920, 1920)).toEqual({ dw: 1820, dh: 1820, dx: 50, dy: 50 })
  })
})
