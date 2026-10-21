import { describe, it, expect } from 'vitest'
import { combineRequiredDocs } from '@/lib/assessment/combine'

describe('συνολική ανάλυση — κοινά δικαιολογητικά', () => {
  const a = [
    { name: 'Φορολογική ενημερότητα', stage: 'Υποβολή', issuer: 'ΑΑΔΕ', status: 'OK' as const, note: '' },
    { name: 'Ασφαλιστική ενημερότητα', stage: 'Υποβολή', issuer: 'e-ΕΦΚΑ', status: 'MISSING' as const, note: 'Από e-ΕΦΚΑ' },
    { name: 'Επενδυτικό σχέδιο', stage: 'Υποβολή', issuer: null, status: 'TO_PREPARE' as const, note: '' },
  ]
  const b = [
    { name: 'Αποδεικτικό φορολογικής ενημερότητας σε ισχύ', stage: 'Υποβολή', issuer: 'myAADE', status: 'MISSING' as const, note: '' },
    { name: 'Ασφαλιστική ενημερότητα (e-ΕΦΚΑ)', stage: 'Υποβολή', issuer: null, status: 'EXPIRED' as const, note: '' },
    { name: 'Άδεια λειτουργίας', stage: 'Ένταξη', issuer: 'Δήμος', status: 'MISSING' as const, note: '' },
  ]
  const r = combineRequiredDocs([{ programTitle: 'Π1', docs: a }, { programTitle: 'Π2', docs: b }])
  it('ίδιο έγγραφο με άλλη διατύπωση = μία γραμμή με όλα τα προγράμματα', () => {
    const tax = r.find(d => /φορολογ/i.test(d.name))!
    expect(tax.programs).toEqual(['Π1', 'Π2'])
    expect(tax.name).toBe('Φορολογική ενημερότητα')
    expect(r.filter(d => /ασφαλιστ/i.test(d.name))).toHaveLength(1)
  })
  it('υπάρχει για ένα πρόγραμμα → υπάρχει· αλλιώς το πιο επείγον', () => {
    expect(r.find(d => /φορολογ/i.test(d.name))!.status).toBe('OK')
    expect(r.find(d => /ασφαλιστ/i.test(d.name))!.status).toBe('EXPIRED')
  })
  it('κοινά πρώτα, μοναδικά μετά', () => {
    expect(r.slice(0, 2).every(d => d.programs.length === 2)).toBe(true)
    expect(r).toHaveLength(4)
  })
})
