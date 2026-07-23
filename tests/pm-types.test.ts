import { describe, it, expect } from 'vitest'
import { STAGE_ORDER, stageLabel, obligationStatusLabel, nextStage, taskAssignToLabel } from '@/lib/pm/types'

describe('pm types', () => {
  it('stage order + labels', () => {
    expect(STAGE_ORDER[0]).toBe('ASSESSMENT')
    expect(stageLabel('OPSKE_SUBMISSION')).toMatch(/ΟΠΣΚΕ/)
    expect(obligationStatusLabel('APPROVED')).toMatch(/Εγκρ/)
    expect(nextStage('ASSESSMENT')).toBe('DOCUMENTS')
    expect(nextStage('MONITORING')).toBeNull()
  })
})

describe('taskAssignToLabel', () => {
  it('labels each assignTo in Greek', () => {
    expect(taskAssignToLabel('MANAGER')).toBe('Υπεύθυνος έργου')
    expect(taskAssignToLabel('PROCESSOR')).toBe('Διεκπεραιωτής')
    expect(taskAssignToLabel('BOTH')).toBe('Και οι δύο')
  })
})
