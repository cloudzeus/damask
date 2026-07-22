import { describe, it, expect } from 'vitest'
import { buildCategorizeMessages, type CatInput } from '@/lib/programs/category-prompt'

describe('buildCategorizeMessages', () => {
  it('lists categories + expense and asks for JSON {categoryId,reason,confidence}', () => {
    const input: CatInput = {
      categories: [
        { id: 'c1', name: 'Εξοπλισμός', maxPercentage: 50, mandatory: false },
        { id: 'c2', name: 'Μισθολογικό κόστος', maxPercentage: 20, mandatory: true },
      ],
      expense: { description: 'Αγορά laptop Dell', amount: 1200, vendor: 'ΠΛΑΙΣΙΟ' },
    }
    const msgs = buildCategorizeMessages(input)
    expect(msgs[0].role).toBe('system')
    const joined = msgs.map(m => m.content).join('\n')
    expect(joined).toContain('c1')
    expect(joined).toContain('Εξοπλισμός')
    expect(joined).toContain('Αγορά laptop Dell')
    expect(joined).toMatch(/categoryId/)
    expect(joined).toMatch(/confidence/)
  })
})
