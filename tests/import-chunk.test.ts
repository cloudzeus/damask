import { describe, it, expect } from 'vitest'
import { chunkArray } from '@/lib/import/chunk'

describe('chunkArray()', () => {
  it('χωρίζει σε ίσα κομμάτια όταν διαιρείται ακριβώς', () => {
    const items = Array.from({ length: 6 }, (_, i) => i)
    expect(chunkArray(items, 2)).toEqual([[0, 1], [2, 3], [4, 5]])
  })

  it('το τελευταίο chunk είναι μικρότερο όταν δεν διαιρείται ακριβώς', () => {
    const items = Array.from({ length: 7 }, (_, i) => i)
    const chunks = chunkArray(items, 3)
    expect(chunks).toHaveLength(3)
    expect(chunks[2]).toEqual([6])
  })

  it('1000 γραμμές σε chunks των 1000 → ένα chunk (spec: όριο chunk εισαγωγής)', () => {
    const items = Array.from({ length: 1000 }, (_, i) => i)
    expect(chunkArray(items, 1000)).toHaveLength(1)
  })

  it('2500 γραμμές σε chunks των 1000 → 3 chunks (1000/1000/500)', () => {
    const items = Array.from({ length: 2500 }, (_, i) => i)
    const chunks = chunkArray(items, 1000)
    expect(chunks.map(c => c.length)).toEqual([1000, 1000, 500])
  })

  it('άδειος πίνακας → κανένα chunk', () => {
    expect(chunkArray([], 1000)).toEqual([])
  })

  it('μέγεθος chunk μεγαλύτερο από τον πίνακα → ένα chunk με όλα τα στοιχεία', () => {
    expect(chunkArray([1, 2], 1000)).toEqual([[1, 2]])
  })

  it('πετάει σφάλμα για μη θετικό μέγεθος', () => {
    expect(() => chunkArray([1, 2], 0)).toThrow()
    expect(() => chunkArray([1, 2], -1)).toThrow()
  })

  it('δεν αλλοιώνει τον αρχικό πίνακα', () => {
    const items = [1, 2, 3]
    chunkArray(items, 2)
    expect(items).toEqual([1, 2, 3])
  })
})
