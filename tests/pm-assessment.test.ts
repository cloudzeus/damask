import { describe, it, expect } from 'vitest'
import { computeAssessmentScore } from '@/lib/pm/assessment'

describe('computeAssessmentScore', () => {
  it('weighted percentage of achieved vs max', () => {
    const r = computeAssessmentScore([{ weight: 2, score: 80, maxScore: 100 }, { weight: 1, score: 40, maxScore: 100 }])
    expect(r.pct).toBeCloseTo(66.67, 1)
    expect(r.achieved).toBe(200)
    expect(r.max).toBe(300)
  })
  it('handles empty / null', () => {
    expect(computeAssessmentScore([]).pct).toBe(0)
    expect(computeAssessmentScore([{ weight: 1, score: null, maxScore: 100 }]).pct).toBe(0)
  })
})
