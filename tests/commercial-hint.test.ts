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
  it('αναγνωρίζει εγκριτικά', () => {
    expect(commercialHint('3 = EFCC ΙΚΕ/ΕΓΚΡΙΣΗ/Proposal_CR-4309043 (Έγκριση).pdf')).toBe('APPROVAL')
    expect(commercialHint('Αποτελέσματα Αξιολόγησης.pdf')).toBe('APPROVAL')
    expect(commercialHint('Εγκριτική απόφαση ένταξης.pdf')).toBe('APPROVAL')
    expect(commercialHint('Έγκριση δόμησης.pdf')).toBeNull()
    // Ο φάκελος «ΕΓΚΡΙΣΗ» δεν κάνει κάθε αρχείο του εγκριτικό· ΥΔ μέσα σε «Προσφορές» δεν είναι προσφορά.
    expect(commercialHint('3 = EFCC ΙΚΕ/ΕΓΚΡΙΣΗ/Υπ.Δ. - Αποδοχής Τεχν. Παραρτήματος.docx')).toBeNull()
    expect(commercialHint('Προσφορές/Υπεύθυνη δήλωση προμηθευτή.pdf')).toBeNull()
    expect(commercialHint('Προσφορές/Μηχανήματα/abc.pdf')).toBe('QUOTE')
  })
  it('δεν πιάνει δικαιολογητικά', () => {
    expect(commercialHint('Φ2_03-2025.pdf')).toBeNull()
    expect(commercialHint('Δικαιολογητικά/Ενημερότητα ΕΦΚΑ.pdf')).toBeNull()
    expect(commercialHint('Αποδεικτικό καταβολής.pdf')).toBeNull()
    expect(commercialHint('Βεβαίωση εργοδότη.pdf')).toBeNull()
  })
})

import { periodFromFileName } from '@/lib/documents/series'
describe('periodFromFileName — συνεχόμενος μήνας+έτος', () => {
  it('«Φ2 012022» → 2022-01', () => {
    expect(periodFromFileName('Φ2 012022.pdf', 'MONTHLY')).toBe('2022-01')
    expect(periodFromFileName('F2_202211.pdf', 'MONTHLY')).toBe('2022-11')
    expect(periodFromFileName('Φ2 122022.pdf', 'QUARTERLY')).toBe('2022-Q4')
  })
})
