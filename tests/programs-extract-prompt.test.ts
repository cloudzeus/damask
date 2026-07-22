import { describe, it, expect } from 'vitest'
import { PROGRAM_SYSTEM_PROMPT, PROGRAM_JSON_SHAPE } from '@/lib/programs/extract-prompt'

describe('program prompt', () => {
  it('is a substantial Greek prompt mentioning key anchors + JSON', () => {
    expect(PROGRAM_SYSTEM_PROMPT.length).toBeGreaterThan(1000)
    expect(PROGRAM_SYSTEM_PROMPT).toMatch(/ΕΣΠΑ|ΚΑΔ|δαπαν/i)
    expect(PROGRAM_SYSTEM_PROMPT).toMatch(/JSON/i)
    expect(PROGRAM_JSON_SHAPE).toMatch(/expenseCategories/)
  })
})
