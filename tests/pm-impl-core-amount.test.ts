import { describe, it, expect, vi } from 'vitest'
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
import { amountFromName } from '@/lib/pm/impl-core'

describe('amountFromName', () => {
  it('ποσό από όνομα αρχείου πληρωμής', () => {
    expect(amountFromName('Πληρωμή (2) - 10.000.pdf')).toBe(10000)
    expect(amountFromName('Πληρωμή (3) - 10.502,76.pdf')).toBe(10502.76)
    expect(amountFromName('Πληρωμή (1) - 7.669,40.pdf')).toBe(7669.4)
    expect(amountFromName('Πληρωμή - 1.860.pdf')).toBe(1860)
    expect(amountFromName('Extrait Εθνική - 2024 (6ος).pdf')).toBeNull()
  })
})
