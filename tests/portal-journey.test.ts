import { describe, it, expect } from 'vitest'
import { buildJourney, journeyIndex } from '@/lib/pm/portal-journey'

const base = { opskeSubmitted: false, paymentRequestsInProgress: 0, paymentsPaid: 0 }

describe('portal journey', () => {
  it('δυνητικός σε αξιολόγηση → βήμα 1', () => {
    expect(journeyIndex({ ...base, lifecycle: 'POTENTIAL', stage: 'ASSESSMENT' })).toBe(0)
  })
  it('υποβαλλόμενος με δικαιολογητικά → βήμα «Δικαιολογητικά»', () => {
    expect(journeyIndex({ ...base, lifecycle: 'SUBMITTING', stage: 'DOCUMENTS' })).toBe(1)
  })
  it('υποβολή ΟΠΣΚΕ → «Υποβολή & έγκριση»', () => {
    expect(journeyIndex({ ...base, lifecycle: 'SUBMITTING', stage: 'EXPENSES_DELIVERABLES', opskeSubmitted: true })).toBe(2)
  })
  it('υλοποίηση → πιστοποίηση όταν υπάρχει αίτημα πληρωμής → εκταμίευση όταν πληρώθηκε', () => {
    expect(journeyIndex({ ...base, lifecycle: 'IMPLEMENTATION', stage: 'MONITORING' })).toBe(3)
    expect(journeyIndex({ ...base, lifecycle: 'IMPLEMENTATION', stage: 'MONITORING', paymentRequestsInProgress: 1 })).toBe(4)
    expect(journeyIndex({ ...base, lifecycle: 'MODIFICATIONS', stage: 'MONITORING', paymentsPaid: 1 })).toBe(5)
  })
  it('καταστάσεις βημάτων, επόμενο βήμα και σημείωση τροποποίησης', () => {
    const j = buildJourney({ ...base, lifecycle: 'MODIFICATIONS', stage: 'MONITORING' })
    expect(j.steps.map(s => s.state)).toEqual(['done', 'done', 'done', 'current', 'todo', 'todo'])
    expect(j.next).toMatch(/^Πιστοποίηση/)
    expect(j.now).toMatch(/τροποποίησης/)
    expect(buildJourney({ ...base, lifecycle: 'PAYMENT', stage: 'MONITORING' }).next).toBeNull()
  })
})
