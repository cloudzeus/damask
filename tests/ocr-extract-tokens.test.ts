import { describe, it, expect } from 'vitest'
import type { ExtractResult } from '@/lib/ocr/extract'

describe('ExtractResult shape', () => {
  it('includes tokensUsed (number|null)', () => {
    const r: ExtractResult = {
      data: {} as ExtractResult['data'], mismatches: [], model: 'gemini-2.5-flash', usedFallback: false, tokensUsed: 1234,
    }
    expect(r.tokensUsed).toBe(1234)
  })
})
