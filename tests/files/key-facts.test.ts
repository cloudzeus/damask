import { describe, it, expect } from 'vitest'
import { splitGlance } from '@/app/(public)/_components/key-facts'

const body = `Εισαγωγή.\n\n## Με μια ματιά\n\n| Στοιχείο | Λεπτομέρεια |\n|---|---|\n| Επενδυτικά δάνεια | 20.000 € έως 8.000.000 € |\n| Άτοκο τμήμα | 40% του δανείου |\n| Δικαιούχοι | ΜμΕ σε όλη την Ελλάδα |\n\n## Επόμενη ενότητα\n\nΚείμενο.`

describe('splitGlance', () => {
  it('βρίσκει τον πίνακα «Με μια ματιά» και κρατά το υπόλοιπο άρθρο', () => {
    const g = splitGlance(body)!
    expect(g.rows).toEqual([
      { label: 'Επενδυτικά δάνεια', value: '20.000 € έως 8.000.000 €' },
      { label: 'Άτοκο τμήμα', value: '40% του δανείου' },
      { label: 'Δικαιούχοι', value: 'ΜμΕ σε όλη την Ελλάδα' },
    ])
    expect(g.before.trim()).toBe('Εισαγωγή.')
    expect(g.after.startsWith('## Επόμενη ενότητα')).toBe(true)
  })
  it('χωρίς ενότητα → null', () => { expect(splitGlance('## Άλλο\n\nκείμενο')).toBeNull() })
})
