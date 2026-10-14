import { describe, it, expect } from 'vitest'
import { classifyImplDoc, invoiceNumberHint, folderOf } from '@/lib/pm/impl-doc-classify'

const ben = { beneficiaryName: 'EFCC IKE', beneficiaryAfm: '800785440' }
const c = (fileName: string, relPath = '', extra: Partial<Parameters<typeof classifyImplDoc>[0]> = {}) => classifyImplDoc({ fileName, relPath, ...ben, ...extra })

describe('classifyImplDoc — φάκελος υλοποίησης (πραγματικά ονόματα EFCC)', () => {
  const tda = 'Α ΔΟΣΗ - ΤΕΛΙΚΗ/Αίτηση Τελικού - Επισυναπτόμενα/2.1 - NETSCOPE/ΤΔΑ 14759'
  it('παραστατικό / πληρωμές / εξτρέ / βεβαίωση / λογιστικά / φωτογραφίες', () => {
    expect(c('ΤΔΑ 14759.pdf', tda, { docType: 'invoice', gross: 12152 })).toBe('INVOICE')
    expect(c('Πληρωμή (1) - 4.000.pdf', tda, { docType: 'receipt', issuerName: 'ΤΡΑΠΕΖΑ EUROBANK Α.Ε.' })).toBe('PAYMENT')
    expect(c('Extrait Εθνική - 2024 (6ος).pdf', tda)).toBe('PAYMENT')
    expect(c('Βεβαίωση Netscope - 14759.pdf', tda)).toBe('SUPPLIER_CERT')
    expect(c('Γεν. Ημερολόγιο - ΤΙΜ 14759.pdf', tda)).toBe('ACCOUNTING')
    expect(c('Γενικό Ημερ. - ΤΠΥ 276 & 3.100 (Σφρ).pdf', 'Α ΔΟΣΗ - ΤΕΛΙΚΗ/Ελλείψεις')).toBe('ACCOUNTING')
    expect(c('ΛΟΓ. ΕΓΓ TIM 16019 ΚΑΙ ΠΛΗΡΩΜΕΣ.pdf', '.Λοιπά')).toBe('ACCOUNTING')
    expect(c('ΚΑΡΤΕΛΑ - NETSCOPE.pdf', tda)).toBe('ACCOUNTING')
    expect(c('Φώτο - DSX 5000 (ΤΔΑ 14759).pdf', tda)).toBe('PHOTO')
    expect(c('IMG_20240619_173130.jpg', `${tda}/Fotos DSX 5000`)).toBe('PHOTO')
    expect(c('SN12.jpg', tda)).toBe('PHOTO')
  })
  it('μισθοδοσία', () => {
    const p = 'Α ΔΟΣΗ - ΤΕΛΙΚΗ/Αίτηση Τελικού - Επισυναπτόμενα/10 - Δικαιολογητιικά Προσωπικού'
    expect(c('Μισθοδοτικές (11.2023-10.2024).pdf', p)).toBe('PAYSLIPS')
    expect(c('Αναγγ. Πρόσληψης - ΣΚΟΥΤΑΡΗΣ.pdf', p)).toBe('HIRING')
    expect(c('15 - Προκαταβολή Ιούνιος 2024.pdf', `${p}/Πληρωμές Μισθοδοσίας`)).toBe('PAYROLL_PAYMENT')
    expect(c('ΑΠΔ - Αναλυτικές.pdf', p)).toBe('PAYROLL_OTHER')
    expect(c('Ε4 ΣΥΜΠΛ.ΩΡ. 2 ΜΕ ΑΠ.pdf', '.Λοιπά/ΕΓΓΡΑΦΑ/E4')).toBe('PAYROLL_OTHER')
  })
  it('φάκελος ΕΓΚΡΙΣΗ: εγκριτική μόνο η απόφαση· τιμολόγιο συμβούλου = παραστατικό· συμβάσεις = λοιπά', () => {
    expect(c('Proposal_CR-4309043 (Έγκριση).pdf', 'ΕΓΚΡΙΣΗ', { inboxKind: 'APPROVAL' })).toBe('APPROVAL')
    expect(c('ΤΠΥ-0000000179.pdf', 'ΕΓΚΡΙΣΗ', { inboxKind: 'APPROVAL' })).toBe('INVOICE')
    expect(c('Σύμβαση WWA_Signed.pdf', 'ΕΓΚΡΙΣΗ', { inboxKind: 'APPROVAL' })).toBe('OTHER')
  })
  it('λοιπά: υποδείγματα/Excel', () => {
    expect(c('Υπόδειγμα ΒΕΒΑΙΩΣΗΣ ΕΞΟΠΛΙΣΜΟΥ.docx', '.Λοιπά')).toBe('OTHER')
    expect(c('Τιμολόγια - Επιδότηση.xlsx')).toBe('OTHER')
  })
})

describe('invoiceNumberHint / folderOf', () => {
  it('αριθμός από όνομα/φάκελο', () => {
    expect(invoiceNumberHint('ΤΔΑ 14759/Πληρωμή (1)')).toBe('14759')
    expect(invoiceNumberHint('Netscope - Παραστατικό π1-16019.pdf')).toBe('16019')
    expect(invoiceNumberHint('ΤΠΥ-0000000179.pdf')).toBe('179')
    expect(invoiceNumberHint('Γεν. Ημερολόγιο - ΤΙΜ 14759.pdf')).toBe('14759')
  })
  it('φάκελος', () => expect(folderOf('a/b/c.pdf')).toBe('a/b'))
})
