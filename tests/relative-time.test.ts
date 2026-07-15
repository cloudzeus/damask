import { describe, it, expect } from 'vitest'
import { relativeTime } from '@/lib/relative-time'

const NOW = new Date('2026-07-15T12:00:00')

describe('relativeTime()', () => {
  it('«μόλις τώρα» για κάτι μέσα στο τελευταίο λεπτό', () => {
    expect(relativeTime(new Date('2026-07-15T11:59:31'), NOW)).toBe('μόλις τώρα')
    expect(relativeTime(NOW, NOW)).toBe('μόλις τώρα')
  })

  it('πλήρη λεπτά με το σύμβολο ′', () => {
    expect(relativeTime(new Date('2026-07-15T11:59:00'), NOW)).toBe('πριν 1′')
    expect(relativeTime(new Date('2026-07-15T11:57:00'), NOW)).toBe('πριν 3′')
    expect(relativeTime(new Date('2026-07-15T11:01:00'), NOW)).toBe('πριν 59′')
  })

  it('ώρες, με σωστό ενικό/πληθυντικό', () => {
    expect(relativeTime(new Date('2026-07-15T11:00:00'), NOW)).toBe('πριν 1 ώρα')
    expect(relativeTime(new Date('2026-07-15T09:15:00'), NOW)).toBe('πριν 2 ώρες')
    expect(relativeTime(new Date('2026-07-15T00:05:00'), NOW)).toBe('πριν 11 ώρες')
  })

  it('«χθες HH:MM» για την προηγούμενη ημερολογιακή ημέρα', () => {
    expect(relativeTime(new Date('2026-07-14T18:40:00'), NOW)).toBe('χθες 18:40')
    expect(relativeTime(new Date('2026-07-14T23:59:00'), NOW)).toBe('χθες 23:59')
    expect(relativeTime(new Date('2026-07-14T09:05:00'), NOW)).toBe('χθες 09:05')
  })

  it('ημερομηνία DD/MM/YYYY για ό,τι είναι πριν από χθες', () => {
    expect(relativeTime(new Date('2026-07-13T12:00:00'), NOW)).toBe('13/07/2026')
    expect(relativeTime(new Date('2025-01-02T08:00:00'), NOW)).toBe('02/01/2025')
  })

  it('δέχεται string input με το ίδιο αποτέλεσμα όπως Date', () => {
    expect(relativeTime('2026-07-15T11:57:00', NOW)).toBe('πριν 3′')
  })

  it('τα λεπτά έχουν προτεραιότητα ακόμα κι όταν διασχίζουν τα μεσάνυχτα', () => {
    const midnight = new Date('2026-07-15T00:05:00')
    expect(relativeTime(new Date('2026-07-14T23:50:00'), midnight)).toBe('πριν 15′')
  })

  it('ανθεκτικό σε ελαφρύ μελλοντικό clock skew', () => {
    expect(relativeTime(new Date('2026-07-15T12:00:05'), NOW)).toBe('μόλις τώρα')
  })
})
