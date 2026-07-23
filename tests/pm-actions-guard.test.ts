import { describe, it, expect, vi } from 'vitest'

/**
 * Surface-only test: επιβεβαιώνει ότι κάθε ενέργεια είναι exported συνάρτηση.
 * Mockάρουμε rbac-server/prisma/next-cache/next-navigation/bunny-storage
 * (ίδιο idiom με tests/programs-actions-guard.test.ts / tests/tax-actions-guard.test.ts)
 * — το πραγματικό @/lib/rbac-server → @/auth → next-auth chain σκοντάφτει σε
 * πρόβλημα resolution του "next/server" κάτω από vitest/vite-node σε αυτό το
 * περιβάλλον, άσχετο με τη σωστότητα του action code.
 */
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'user-1', role: 'ADMIN', permissions: ['pm.work', 'pm.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    programApplication: {
      findFirst: vi.fn(async () => ({ id: 'app-1', programId: 'prog-1', stage: 'ASSESSMENT' })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'app-1',
        trdrId: 'trdr-1',
        programId: 'prog-1',
        stage: 'ASSESSMENT',
        managerId: null,
        processorId: null,
        assessmentScore: null,
        assessmentMaxScore: null,
        assessmentVerdict: 'PENDING',
        opskeStatus: null,
        opskeRef: null,
        opskeSubmittedAt: null,
        trdr: { NAME: 'ACME' },
        program: { title: 'Πρόγραμμα' },
        manager: null,
        processor: null,
      })),
      findMany: vi.fn(async () => []),
      update: vi.fn(async () => ({ id: 'app-1' })),
    },
    program: {
      findUniqueOrThrow: vi.fn(async () => ({ id: 'prog-1', criteria: [], deliverables: [], requiredForms: [] })),
    },
    user: {
      findMany: vi.fn(async () => []),
    },
    applicationObligation: {
      findMany: vi.fn(async () => []),
      findUniqueOrThrow: vi.fn(async () => ({ applicationId: 'app-1' })),
      createMany: vi.fn(async () => ({ count: 0 })),
      create: vi.fn(async () => ({ id: 'obl-1' })),
      update: vi.fn(async () => ({ id: 'obl-1' })),
      delete: vi.fn(async () => ({ id: 'obl-1' })),
      count: vi.fn(async () => 0),
    },
    applicationCriterionScore: {
      findMany: vi.fn(async () => []),
      findUniqueOrThrow: vi.fn(async () => ({ applicationId: 'app-1' })),
      createMany: vi.fn(async () => ({ count: 0 })),
      update: vi.fn(async () => ({ id: 'score-1' })),
    },
    applicationDocument: {
      findMany: vi.fn(async () => []),
      findUniqueOrThrow: vi.fn(async () => ({ applicationId: 'app-1' })),
      create: vi.fn(async () => ({ id: 'doc-1' })),
      delete: vi.fn(async () => ({ id: 'doc-1' })),
    },
  },
}))
vi.mock('@/lib/bunny-storage', () => ({
  bunnyUploadPrivate: vi.fn(async ({ key }: { key: string }) => ({ key })),
}))

const actions = await import('@/lib/pm/actions')

describe('pm actions surface', () => {
  it('exports the Task 6 actions', () => {
    for (const k of [
      'getApplication',
      'listVisibleApplications',
      'assignApplication',
      'listInternalUsers',
      'generateObligations',
      'listCriterionScores',
      'saveCriterionScore',
      'recomputeAssessment',
      'setAssessmentVerdict',
    ]) {
      expect(typeof (actions as Record<string, unknown>)[k]).toBe('function')
    }
  })
})
