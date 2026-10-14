import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { nameMatchScore } from '@/lib/pm/obligations-reconcile'

describe('ισοδύναμοι τύποι δικαιολογητικών', () => {
  it('ίδιο «υπόδειγμα Γ» → ισχυρό ταίριασμα', () => {
    expect(nameMatchScore(['Υπεύθυνη Δήλωση προηγούμενων επιχορηγήσεων (υπόδειγμα Γ Παραρτήματος V)'], 'Υπόδειγμα Γ: Δήλωση Σώρευσης Ενισχύσεων')).toBeGreaterThanOrEqual(0.9)
  })
  it('διαφορετικό υπόδειγμα → όχι', () => {
    expect(nameMatchScore(['Υπεύθυνη Δήλωση Ν.1599/86 (υπόδειγμα Α Παραρτήματος VIII)'], 'Υπόδειγμα Γ: Δήλωση Σώρευσης Ενισχύσεων')).toBe(0)
  })
  it('άσχετα έγγραφα δεν ταιριάζουν με κανόνες', () => {
    expect(nameMatchScore(['Άδεια λειτουργίας σε ισχύ'], 'Υπεύθυνη δήλωση του Ν.1599/1986')).toBeLessThan(0.6)
  })
})
