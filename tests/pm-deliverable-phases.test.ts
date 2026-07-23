import { describe, it, expect } from 'vitest'
import {
  DELIVERABLE_PHASE_ORDER,
  OPTIONAL_PHASES,
  APPLICATION_LEVEL_PHASES,
  deliverablePhaseLabel,
  deliverableStatusLabel,
  effectivePhases,
  previousEffectivePhase,
  buildAutoDependencyPairs,
  hasCycle,
  taskBlocked,
  taskCanClose,
  verifiedFromTasks,
  type DagTask,
} from '@/lib/pm/deliverable-phases'

describe('DELIVERABLE_PHASE_ORDER', () => {
  it('lists the 9 phases in spec order', () => {
    expect(DELIVERABLE_PHASE_ORDER).toEqual([
      'ASSESSMENT',
      'SUBMISSION',
      'APPROVAL',
      'FIRST_PAYMENT',
      'PHASE_A_CERTIFICATION',
      'MODIFICATION',
      'FINAL_PAYMENT',
      'FULL_CERTIFICATION',
      'AUTHORITY_AUDIT',
    ])
  })

  it('OPTIONAL_PHASES = FIRST_PAYMENT, MODIFICATION', () => {
    expect(Array.from(OPTIONAL_PHASES).sort()).toEqual(['FIRST_PAYMENT', 'MODIFICATION'].sort())
  })

  it('APPLICATION_LEVEL_PHASES = ASSESSMENT, APPROVAL, AUTHORITY_AUDIT', () => {
    expect(Array.from(APPLICATION_LEVEL_PHASES).sort()).toEqual(['APPROVAL', 'ASSESSMENT', 'AUTHORITY_AUDIT'].sort())
  })
})

describe('deliverablePhaseLabel', () => {
  it('returns Greek labels for all phases', () => {
    expect(deliverablePhaseLabel('ASSESSMENT')).toBe('Αξιολόγηση')
    expect(deliverablePhaseLabel('SUBMISSION')).toBe('Υποβολή')
    expect(deliverablePhaseLabel('APPROVAL')).toBe('Έγκριση')
    expect(deliverablePhaseLabel('FIRST_PAYMENT')).toBe('Πληρωμή Α΄ δόσης')
    expect(deliverablePhaseLabel('PHASE_A_CERTIFICATION')).toBe('Πιστοποίηση Α΄ φάσης')
    expect(deliverablePhaseLabel('MODIFICATION')).toBe('Τροποποίηση δαπάνης')
    expect(deliverablePhaseLabel('FINAL_PAYMENT')).toBe('Πλήρης αποπληρωμή')
    expect(deliverablePhaseLabel('FULL_CERTIFICATION')).toBe('Πιστοποίηση συνόλου')
    expect(deliverablePhaseLabel('AUTHORITY_AUDIT')).toBe('Έλεγχος αρχής')
  })
})

describe('deliverableStatusLabel', () => {
  it('returns Greek labels for all statuses', () => {
    expect(deliverableStatusLabel('PENDING')).toBe('Εκκρεμεί')
    expect(deliverableStatusLabel('UPLOADED')).toBe('Ανέβηκε')
    expect(deliverableStatusLabel('ACCEPTED')).toBe('Εγκρίθηκε')
    expect(deliverableStatusLabel('REJECTED')).toBe('Απορρίφθηκε')
    expect(deliverableStatusLabel('WAIVED')).toBe('Απαλλαγή')
  })
})

describe('effectivePhases', () => {
  it('with no optional used, drops FIRST_PAYMENT and MODIFICATION', () => {
    expect(effectivePhases([])).toEqual([
      'ASSESSMENT', 'SUBMISSION', 'APPROVAL', 'PHASE_A_CERTIFICATION',
      'FINAL_PAYMENT', 'FULL_CERTIFICATION', 'AUTHORITY_AUDIT',
    ])
  })

  it('with FIRST_PAYMENT used, keeps it and still drops MODIFICATION', () => {
    expect(effectivePhases(['FIRST_PAYMENT'])).toEqual([
      'ASSESSMENT', 'SUBMISSION', 'APPROVAL', 'FIRST_PAYMENT', 'PHASE_A_CERTIFICATION',
      'FINAL_PAYMENT', 'FULL_CERTIFICATION', 'AUTHORITY_AUDIT',
    ])
  })

  it('with both optional used, keeps full order', () => {
    expect(effectivePhases(['FIRST_PAYMENT', 'MODIFICATION'])).toEqual(DELIVERABLE_PHASE_ORDER)
  })
})

describe('previousEffectivePhase', () => {
  it('first phase has no previous', () => {
    expect(previousEffectivePhase('ASSESSMENT', [])).toBeNull()
  })

  it('SUBMISSION -> ASSESSMENT', () => {
    expect(previousEffectivePhase('SUBMISSION', [])).toBe('ASSESSMENT')
  })

  it('FINAL_PAYMENT -> PHASE_A_CERTIFICATION when MODIFICATION unused', () => {
    expect(previousEffectivePhase('FINAL_PAYMENT', [])).toBe('PHASE_A_CERTIFICATION')
  })

  it('FINAL_PAYMENT -> MODIFICATION when MODIFICATION used', () => {
    expect(previousEffectivePhase('FINAL_PAYMENT', ['MODIFICATION'])).toBe('MODIFICATION')
  })

  it('PHASE_A_CERTIFICATION -> APPROVAL when FIRST_PAYMENT unused', () => {
    expect(previousEffectivePhase('PHASE_A_CERTIFICATION', [])).toBe('APPROVAL')
  })

  it('PHASE_A_CERTIFICATION -> FIRST_PAYMENT when used', () => {
    expect(previousEffectivePhase('PHASE_A_CERTIFICATION', ['FIRST_PAYMENT'])).toBe('FIRST_PAYMENT')
  })
})

describe('buildAutoDependencyPairs', () => {
  it('same-expense tasks depend on mandatory tasks of previous phase, same expense', () => {
    const tasks: DagTask[] = [
      { id: 'assess-app', phase: 'ASSESSMENT', expenseId: null, mandatory: true },
      { id: 'sub-e1', phase: 'SUBMISSION', expenseId: 'e1', mandatory: true },
      { id: 'appr-e1', phase: 'APPROVAL', expenseId: null, mandatory: true },
      { id: 'final-e1', phase: 'FINAL_PAYMENT', expenseId: 'e1', mandatory: true },
    ]
    const pairs = buildAutoDependencyPairs(tasks, [])
    // sub-e1 has no same-expense ASSESSMENT tasks (ASSESSMENT is app-level) -> falls back to app-level
    expect(pairs).toContainEqual({ dependentId: 'sub-e1', prerequisiteId: 'assess-app' })
    // appr-e1 (app-level) depends on mandatory SUBMISSION tasks (its own "expense" is null; SUBMISSION has no null-expense tasks so falls back... but SUBMISSION has no app-level tasks either)
  })

  it('cross-links application-level ASSESSMENT to expense-scoped SUBMISSION tasks of multiple expenses', () => {
    const tasks: DagTask[] = [
      { id: 'assess-app', phase: 'ASSESSMENT', expenseId: null, mandatory: true },
      { id: 'sub-e1', phase: 'SUBMISSION', expenseId: 'e1', mandatory: true },
      { id: 'sub-e2', phase: 'SUBMISSION', expenseId: 'e2', mandatory: true },
    ]
    const pairs = buildAutoDependencyPairs(tasks, [])
    expect(pairs).toContainEqual({ dependentId: 'sub-e1', prerequisiteId: 'assess-app' })
    expect(pairs).toContainEqual({ dependentId: 'sub-e2', prerequisiteId: 'assess-app' })
  })

  it('same-expense mandatory tasks of previous phase take priority over the app-level fallback', () => {
    // Contrived phase/expenseId combination purely to isolate the priority rule: when a
    // same-expense mandatory prerequisite exists, the app-level ones are NOT also pulled in.
    const tasks: DagTask[] = [
      { id: 'sub-e1', phase: 'SUBMISSION', expenseId: 'e1', mandatory: true },
      { id: 'sub-app', phase: 'SUBMISSION', expenseId: null, mandatory: true },
      { id: 'appr-e1', phase: 'APPROVAL', expenseId: 'e1', mandatory: true },
    ]
    const pairs = buildAutoDependencyPairs(tasks, [])
    expect(pairs.filter((p) => p.dependentId === 'appr-e1')).toEqual([
      { dependentId: 'appr-e1', prerequisiteId: 'sub-e1' },
    ])
  })

  it('falls back to app-level mandatory tasks when the previous phase has no same-expense tasks', () => {
    const tasks: DagTask[] = [
      { id: 'sub-app', phase: 'SUBMISSION', expenseId: null, mandatory: true },
      { id: 'appr-e1', phase: 'APPROVAL', expenseId: 'e1', mandatory: true },
    ]
    const pairs = buildAutoDependencyPairs(tasks, [])
    expect(pairs.filter((p) => p.dependentId === 'appr-e1')).toEqual([
      { dependentId: 'appr-e1', prerequisiteId: 'sub-app' },
    ])
  })

  it('non-mandatory tasks of the previous phase are never used as prerequisites', () => {
    const tasks: DagTask[] = [
      { id: 'assess-app', phase: 'ASSESSMENT', expenseId: null, mandatory: false },
      { id: 'sub-e1', phase: 'SUBMISSION', expenseId: 'e1', mandatory: true },
    ]
    const pairs = buildAutoDependencyPairs(tasks, [])
    expect(pairs).toEqual([])
  })

  it('skips phases with no previous (ASSESSMENT has no prerequisites)', () => {
    const tasks: DagTask[] = [{ id: 'assess-app', phase: 'ASSESSMENT', expenseId: null, mandatory: true }]
    expect(buildAutoDependencyPairs(tasks, [])).toEqual([])
  })

  it('is deterministic given the same input', () => {
    const tasks: DagTask[] = [
      { id: 'assess-app', phase: 'ASSESSMENT', expenseId: null, mandatory: true },
      { id: 'sub-e1', phase: 'SUBMISSION', expenseId: 'e1', mandatory: true },
      { id: 'sub-e2', phase: 'SUBMISSION', expenseId: 'e2', mandatory: true },
    ]
    const a = buildAutoDependencyPairs(tasks, [])
    const b = buildAutoDependencyPairs(tasks, [])
    expect(a).toEqual(b)
  })
})

describe('hasCycle', () => {
  it('false for an acyclic chain', () => {
    expect(
      hasCycle([
        { dependentId: 'b', prerequisiteId: 'a' },
        { dependentId: 'c', prerequisiteId: 'b' },
      ]),
    ).toBe(false)
  })

  it('true for a direct cycle', () => {
    expect(
      hasCycle([
        { dependentId: 'a', prerequisiteId: 'b' },
        { dependentId: 'b', prerequisiteId: 'a' },
      ]),
    ).toBe(true)
  })

  it('true for an indirect cycle', () => {
    expect(
      hasCycle([
        { dependentId: 'a', prerequisiteId: 'b' },
        { dependentId: 'b', prerequisiteId: 'c' },
        { dependentId: 'c', prerequisiteId: 'a' },
      ]),
    ).toBe(true)
  })

  it('false for empty edges', () => {
    expect(hasCycle([])).toBe(false)
  })
})

describe('taskBlocked', () => {
  it('blocked when a prerequisite is PENDING', () => {
    const edges = [{ dependentId: 't2', prerequisiteId: 't1' }]
    const result = taskBlocked('t2', edges, { t1: 'PENDING' })
    expect(result).toEqual({ blocked: true, blockingIds: ['t1'] })
  })

  it('not blocked when the prerequisite is ACCEPTED', () => {
    const edges = [{ dependentId: 't2', prerequisiteId: 't1' }]
    const result = taskBlocked('t2', edges, { t1: 'ACCEPTED' })
    expect(result).toEqual({ blocked: false, blockingIds: [] })
  })

  it('not blocked when the prerequisite is WAIVED', () => {
    const edges = [{ dependentId: 't2', prerequisiteId: 't1' }]
    const result = taskBlocked('t2', edges, { t1: 'WAIVED' })
    expect(result).toEqual({ blocked: false, blockingIds: [] })
  })

  it('blocked when the prerequisite is REJECTED or UPLOADED', () => {
    const edges = [{ dependentId: 't2', prerequisiteId: 't1' }]
    expect(taskBlocked('t2', edges, { t1: 'REJECTED' }).blocked).toBe(true)
    expect(taskBlocked('t2', edges, { t1: 'UPLOADED' }).blocked).toBe(true)
  })

  it('lists all blocking prerequisite ids, not just the first', () => {
    const edges = [
      { dependentId: 't3', prerequisiteId: 't1' },
      { dependentId: 't3', prerequisiteId: 't2' },
    ]
    const result = taskBlocked('t3', edges, { t1: 'PENDING', t2: 'ACCEPTED' })
    expect(result).toEqual({ blocked: true, blockingIds: ['t1'] })
  })

  it('no prerequisites -> not blocked', () => {
    expect(taskBlocked('t1', [], {})).toEqual({ blocked: false, blockingIds: [] })
  })
})

describe('taskCanClose', () => {
  it('true when files exactly equal minFiles', () => {
    expect(taskCanClose({ status: 'UPLOADED', filesCount: 2, minFiles: 2 })).toBe(true)
  })

  it('false when files are fewer than minFiles', () => {
    expect(taskCanClose({ status: 'UPLOADED', filesCount: 1, minFiles: 2 })).toBe(false)
  })

  it('true when files exceed minFiles', () => {
    expect(taskCanClose({ status: 'UPLOADED', filesCount: 3, minFiles: 2 })).toBe(true)
  })

  it('WAIVED tasks can close regardless of file count', () => {
    expect(taskCanClose({ status: 'WAIVED', filesCount: 0, minFiles: 1 })).toBe(true)
  })
})

describe('verifiedFromTasks', () => {
  it('true when all mandatory certification tasks are ACCEPTED', () => {
    expect(
      verifiedFromTasks([
        { phase: 'PHASE_A_CERTIFICATION', mandatory: true, status: 'ACCEPTED' },
        { phase: 'FULL_CERTIFICATION', mandatory: true, status: 'ACCEPTED' },
      ]),
    ).toBe(true)
  })

  it('true when mandatory tasks are WAIVED', () => {
    expect(verifiedFromTasks([{ phase: 'FULL_CERTIFICATION', mandatory: true, status: 'WAIVED' }])).toBe(true)
  })

  it('false when one mandatory certification task is still PENDING', () => {
    expect(
      verifiedFromTasks([
        { phase: 'PHASE_A_CERTIFICATION', mandatory: true, status: 'ACCEPTED' },
        { phase: 'FULL_CERTIFICATION', mandatory: true, status: 'PENDING' },
      ]),
    ).toBe(false)
  })

  it('true when there are no certification tasks at all', () => {
    expect(verifiedFromTasks([])).toBe(true)
  })

  it('ignores non-mandatory certification tasks', () => {
    expect(
      verifiedFromTasks([
        { phase: 'FULL_CERTIFICATION', mandatory: false, status: 'PENDING' },
      ]),
    ).toBe(true)
  })

  it('ignores tasks from non-certification phases', () => {
    expect(
      verifiedFromTasks([{ phase: 'SUBMISSION', mandatory: true, status: 'PENDING' }]),
    ).toBe(true)
  })
})
