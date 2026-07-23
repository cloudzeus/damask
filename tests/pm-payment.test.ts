import { describe, it, expect } from 'vitest'
import { expenseEligibleForPayment, paymentRequestTotal, canTransition, type PaymentEligibilityInput } from '@/lib/pm/payment'

const e = (o: Partial<PaymentEligibilityInput> = {}): PaymentEligibilityInput => ({ status: 'ACTIVE', confirmed: true, verified: true, paymentRequestId: null, ...o })

describe('expenseEligibleForPayment', () => {
  it('eligible when active+confirmed+verified+unassigned', () => {
    expect(expenseEligibleForPayment(e())).toEqual({ eligible: true, reason: null })
  })
  it('REPLACED → not eligible', () => { expect(expenseEligibleForPayment(e({ status: 'REPLACED' })).eligible).toBe(false) })
  it('not confirmed → not eligible', () => { expect(expenseEligibleForPayment(e({ confirmed: false })).reason).toBeTruthy() })
  it('not verified → not eligible', () => { expect(expenseEligibleForPayment(e({ verified: false })).reason).toBeTruthy() })
  it('in another request → not eligible', () => { expect(expenseEligibleForPayment(e({ paymentRequestId: 'other' })).eligible).toBe(false) })
  it('in THIS request → eligible', () => { expect(expenseEligibleForPayment(e({ paymentRequestId: 'r1' }), 'r1').eligible).toBe(true) })
})
describe('paymentRequestTotal', () => {
  it('sums', () => { expect(paymentRequestTotal([100, 50.5, 0])).toBeCloseTo(150.5) })
  it('empty → 0', () => { expect(paymentRequestTotal([])).toBe(0) })
})
describe('canTransition', () => {
  it('valid edges', () => {
    expect(canTransition('DRAFT', 'SUBMITTED')).toBe(true)
    expect(canTransition('SUBMITTED', 'APPROVED')).toBe(true)
    expect(canTransition('SUBMITTED', 'REJECTED')).toBe(true)
    expect(canTransition('APPROVED', 'PAID')).toBe(true)
    expect(canTransition('REJECTED', 'DRAFT')).toBe(true)
  })
  it('invalid edges', () => {
    expect(canTransition('DRAFT', 'PAID')).toBe(false)
    expect(canTransition('PAID', 'DRAFT')).toBe(false)
    expect(canTransition('APPROVED', 'SUBMITTED')).toBe(false)
  })
})
