import { describe, it, expect } from 'vitest'
import { matchInvoice, certNeededFor } from '@/lib/pm/invoice-match'

const invoice = { total: 12152, date: '2024-05-20', supplier: 'NETSCOPE Α.Ε.', supplierAfm: '099999999', number: 'ΤΔΑ 14759' }
const pay = (amount: number | null, date: string, payee = 'NETSCOPE ΑΕ') => ({ amount, date, payee })

describe('matchInvoice', () => {
  it('χωρίς πληρωμή → χωρίς ετυμηγορία', () => {
    expect(matchInvoice({ invoice, payments: [], cert: null }).verdict).toBeNull()
  })
  it('3 δόσεις που αθροίζουν στο σύνολο → OK', () => {
    const r = matchInvoice({ invoice, payments: [pay(4000, '2024-06-10'), pay(4000, '2024-08-01'), pay(4152, '2024-11-04')], cert: null })
    expect(r.verdict).toBe('OK')
    expect(r.checks[0].text).toContain('σε 3 πληρωμές')
  })
  it('μερική εξόφληση → PARTIAL με υπόλοιπο', () => {
    const r = matchInvoice({ invoice, payments: [pay(4000, '2024-06-10')], cert: null })
    expect(r.verdict).toBe('PARTIAL')
    expect(r.checks.some(c => c.text.includes('υπόλοιπο'))).toBe(true)
  })
  it('πληρωμή σε άλλον δικαιούχο → MISMATCH', () => {
    expect(matchInvoice({ invoice, payments: [pay(12152, '2024-06-10', 'ΠΑΠΑΔΟΠΟΥΛΟΣ ΓΕΩΡΓΙΟΣ')], cert: null }).verdict).toBe('MISMATCH')
  })
  it('υπερπληρωμή → MISMATCH', () => {
    expect(matchInvoice({ invoice, payments: [pay(13000, '2024-06-10')], cert: null }).verdict).toBe('MISMATCH')
  })
  it('λείπει βεβαίωση όταν απαιτείται → PARTIAL· βεβαίωση για άλλο παραστατικό → MISMATCH', () => {
    const payments = [pay(12152, '2024-06-10')]
    expect(matchInvoice({ invoice, payments, cert: { present: false } }).verdict).toBe('PARTIAL')
    expect(matchInvoice({ invoice, payments, cert: { present: true, invoiceNumbers: ['16019'] } }).verdict).toBe('MISMATCH')
    expect(matchInvoice({ invoice, payments, cert: { present: true, invoiceNumbers: ['14759'] } }).verdict).toBe('OK')
  })
})

describe('certNeededFor', () => {
  it('εξοπλισμός/όργανα ναι — μισθοδοσία/έμμεσες/υπηρεσίες όχι', () => {
    expect(certNeededFor('Μηχανήματα – Εξοπλισμός (Συμβατικές Δαπάνες)', 'ΠΡΟΜΗΘΕΙΑ ΟΡΓΑΝΩΝ ΜΕΤΡΗΣΗΣ')).toBe(true)
    expect(certNeededFor('Μισθολογικό κόστος νέων εργαζομένων (1-3 ΕΜΕ)', 'Δαπάνες νέου προσωπικού')).toBe(false)
    expect(certNeededFor('Έμμεσες δαπάνες', 'ΕΜΜΕΣΕΣ ΔΑΠΑΝΕΣ')).toBe(false)
    expect(certNeededFor('Συμβουλευτικές υπηρεσίες παρακολούθησης επενδυτικού σχεδίου', 'Παρακολούθηση της υλοποίησης')).toBe(false)
  })
})
