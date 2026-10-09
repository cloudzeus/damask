import { describe, it, expect } from 'vitest'
import { documentHint } from '@/lib/file-requests/doc-hints'

describe('documentHint', () => {
  it('εξηγεί τα συνηθισμένα δικαιολογητικά', () => {
    expect(documentHint('Φορολογική ενημερότητα')).toMatch(/myAADE/)
    expect(documentHint('Ασφαλιστική ενημερότητα')).toMatch(/e-ΕΦΚΑ/)
    expect(documentHint('Έντυπο Ε3 2025')).toMatch(/TAXISnet/)
    expect(documentHint('Πιστοποιητικό ΓΕΜΗ')).toMatch(/businessportal/)
  })
  it('null για άγνωστο έγγραφο', () => { expect(documentHint('Κάτι άλλο εντελώς')).toBeNull() })
})
