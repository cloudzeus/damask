import { describe, it, expect } from 'vitest'
import { STAGE_ORDER, stageLabel, obligationStatusLabel, nextStage } from '@/lib/pm/types'

describe('pm types', () => {
  it('stage order + labels', () => {
    expect(STAGE_ORDER[0]).toBe('ASSESSMENT')
    expect(stageLabel('OPSKE_SUBMISSION')).toMatch(/ΟΠΣΚΕ/)
    expect(obligationStatusLabel('APPROVED')).toMatch(/Εγκρ/)
    expect(nextStage('ASSESSMENT')).toBe('DOCUMENTS')
    expect(nextStage('MONITORING')).toBeNull()
  })
})
