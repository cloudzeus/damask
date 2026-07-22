import { describe, it, expect } from 'vitest'
import type { DeepSeekOptions } from '@/lib/deepseek'

describe('DeepSeekOptions', () => {
  it('accepts timeoutMs', () => {
    const o: DeepSeekOptions = { timeoutMs: 300000 }
    expect(o.timeoutMs).toBe(300000)
  })
})
