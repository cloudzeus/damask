import { describe, it, expect, vi } from 'vitest'

vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('@/lib/deepseek', () => ({ deepseekChat: vi.fn() }))

import { commercialHint } from '@/lib/documents/smart-classify-core'

describe('commercialHint — προσφορά/παραστατικό από όνομα ή φάκελο', () => {
  it('αναγνωρίζει προσφορές', () => {
    expect(commercialHint('Προσφορές/Μηχανήματα/abc.pdf')).toBe('QUOTE')
    expect(commercialHint('ΠΡΟΣΦΟΡΆ_Κωνσταντίνου.pdf')).toBe('QUOTE')
    expect(commercialHint('quotation-2025.pdf')).toBe('QUOTE')
  })
  it('αναγνωρίζει παραστατικά', () => {
    expect(commercialHint('Τιμολόγια/2025/τιμολόγιο 123.pdf')).toBe('INVOICE')
    expect(commercialHint('ΤΠΥ 00045.pdf')).toBe('INVOICE')
    expect(commercialHint('invoice_445.pdf')).toBe('INVOICE')
  })
  it('δεν πιάνει δικαιολογητικά', () => {
    expect(commercialHint('Φ2_03-2025.pdf')).toBeNull()
    expect(commercialHint('Δικαιολογητικά/Ενημερότητα ΕΦΚΑ.pdf')).toBeNull()
    expect(commercialHint('Αποδεικτικό καταβολής.pdf')).toBeNull()
    expect(commercialHint('Βεβαίωση εργοδότη.pdf')).toBeNull()
  })
})
