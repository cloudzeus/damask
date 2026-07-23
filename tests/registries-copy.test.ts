import { describe, it, expect } from 'vitest'
import { chunk } from '../scripts/copy-registries'

describe('chunk', () => {
  it('χωρίζει έναν πίνακα σε ισομεγέθη κομμάτια', () => {
    expect(chunk([1, 2, 3, 4], 2)).toEqual([[1, 2], [3, 4]])
  })

  it('το τελευταίο κομμάτι μπορεί να είναι μικρότερο', () => {
    expect(chunk([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]])
  })

  it('επιστρέφει ένα μόνο κομμάτι όταν το size >= μήκος πίνακα', () => {
    expect(chunk([1, 2, 3], 10)).toEqual([[1, 2, 3]])
  })

  it('επιστρέφει άδειο πίνακα για κενή είσοδο', () => {
    expect(chunk([], 5)).toEqual([])
  })

  it('πετάει σφάλμα για size <= 0', () => {
    expect(() => chunk([1, 2, 3], 0)).toThrow()
    expect(() => chunk([1, 2, 3], -1)).toThrow()
  })

  it('size 1 παράγει ένα κομμάτι ανά στοιχείο', () => {
    expect(chunk(['a', 'b', 'c'], 1)).toEqual([['a'], ['b'], ['c']])
  })
})
