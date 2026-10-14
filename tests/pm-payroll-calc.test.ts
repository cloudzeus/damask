import { describe, it, expect } from 'vitest'
import { perEmeCapFrom, summarizePayroll, samePerson, periodFromText } from '@/lib/pm/payroll-calc'

describe('perEmeCapFrom', () => {
  it('διαβάζει το όριο ανά ΕΜΕ από τις σημειώσεις της κατηγορίας', () => {
    expect(perEmeCapFrom('1 ΕΜΕ max 15.000€, 2 ΕΜΕ max 30.000€, 3 ΕΜΕ max 45.000€')).toBe(15000)
    expect(perEmeCapFrom('2 ΕΜΕ έως 24.000 €')).toBe(12000)
    expect(perEmeCapFrom(null)).toBeNull()
  })
})

describe('summarizePayroll', () => {
  const employees = [
    { id: 'a', name: 'ΣΚΟΥΤΑΡΗΣ ΝΙΚΟΣ', projectHire: true, fte: 1 },
    { id: 'b', name: 'ΠΑΛΙΟΣ ΓΙΑΝΝΗΣ', projectHire: false, fte: 1 },
  ]
  const line = (employeeId: string, period: string, gross: number, er: number, net: number, kind = 'τακτικές') => ({ employeeId, period, kind, gross, employerContrib: er, net })
  it('μόνο νέοι εργαζόμενοι στο κόστος· όριο ανά ΕΜΕ· πληρωμές ανά μήνα έναντι καθαρών όλων', () => {
    const s = summarizePayroll({
      employees,
      lines: [line('a', '2024-01', 10000, 2500, 8000), line('a', '2024-02', 5000, 1250, 4000), line('b', '2024-01', 1000, 250, 800), line('b', '2024-02', 1000, 250, 800)],
      payments: [{ period: '2024-01', amount: 8800 }, { period: '2024-02', amount: 2000 }],
      perEmeCap: 15000, approved: 42688.95,
    })
    expect(s.cost).toBe(18750)
    expect(s.employees[0]).toMatchObject({ cost: 18750, cap: 15000, eligible: 15000, months: 2 })
    expect(s.eligible).toBe(15000)
    expect(s.periods.map(p => p.status)).toEqual(['PAID', 'PARTIAL'])
    // Ιαν: πλήρως εξοφλημένος (12.500)· Φεβ: 2000/4800 του 6.250 → 15.104 — αλλά όχι πάνω από το επιλέξιμο (15.000).
    expect(s.paidCost).toBe(15000)
  })
  it('μερική απασχόληση → αναλογικό όριο', () => {
    const s = summarizePayroll({ employees: [{ id: 'a', name: 'Χ', projectHire: true, fte: 0.5 }], lines: [line('a', '2024-01', 10000, 0, 0)], payments: [], perEmeCap: 15000, approved: 100000 })
    expect(s.employees[0].eligible).toBe(7500)
  })
})

describe('samePerson / periodFromText', () => {
  it('ίδιο πρόσωπο με αντεστραμμένο όνομα ή ΑΦΜ', () => {
    expect(samePerson({ name: 'Σκουτάρης Νικόλαος' }, { name: 'ΝΙΚΟΛΑΟΣ ΣΚΟΥΤΑΡΗΣ' })).toBe(true)
    expect(samePerson({ name: 'Α', afm: '123' }, { name: 'Β', afm: '123' })).toBe(true)
    expect(samePerson({ name: 'Α Β', afm: '123' }, { name: 'Α Β', afm: '456' })).toBe(false)
    expect(samePerson({ name: 'ΓΚΑΡΑΖΑΧΟΣ ΠΑΝΑΓΙΩΤΗΣ' }, { name: 'ΚΑΡΑΖΑΧΟΣ ΠΑΝΑΓΙΩΤΗΣ', afm: '142194460' })).toBe(true)
    expect(samePerson({ name: 'ΕΥΣΤΑΘΙΟΥ ΔΑΦΝΗ' }, { name: 'ΕΥΣΤΑΘΙΟΥ ΑΘΑΝΑΣΙΟΣ' })).toBe(false)
  })
  it('μήνας από όνομα αρχείου πληρωμής', () => {
    expect(periodFromText('15 - Προκαταβολή Ιούνιος 2024.pdf')).toBe('2024-06')
    expect(periodFromText('17 - Προκαταβολή Ιούλιος 2024.pdf')).toBe('2024-07')
    expect(periodFromText('14 - Εξόφληση Μαϊου 2024.pdf')).toBe('2024-05')
    expect(periodFromText('1 - Προκαταβολή Νοέμβριος 2023.pdf')).toBe('2023-11')
  })
})
