import { describe, it, expect, vi } from 'vitest'

/**
 * Surface-only test: επιβεβαιώνει ότι κάθε ενέργεια είναι exported συνάρτηση.
 * Mockάρουμε rbac-server/prisma/next-cache/bunny-storage/extract/persist
 * (ίδιο idiom με tests/tax-actions-guard.test.ts) — το πραγματικό
 * @/lib/rbac-server → @/auth → next-auth chain σκοντάφτει σε πρόβλημα
 * resolution του "next/server" κάτω από vitest/vite-node σε αυτό το
 * περιβάλλον, άσχετο με τη σωστότητα του action code.
 */
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['programs.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    program: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'prog-1' })),
      update: vi.fn(async () => ({ id: 'prog-1' })),
      delete: vi.fn(async () => ({ id: 'prog-1' })),
    },
    programApplication: {
      upsert: vi.fn(async () => ({ id: 'app-1' })),
    },
    programExpense: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'exp-1' })),
      update: vi.fn(async () => ({ id: 'exp-1' })),
      findUniqueOrThrow: vi.fn(async () => ({
        id: 'exp-1',
        description: 'x',
        amount: 1,
        vendor: null,
        application: { program: { expenseCats: [] } },
      })),
    },
  },
}))
vi.mock('@/lib/bunny-storage', () => ({
  bunnyUploadPrivate: vi.fn(async ({ key }: { key: string }) => ({ key })),
}))
vi.mock('@/lib/programs/extract', () => ({
  extractProgramFromText: vi.fn(async () => ({ data: {}, model: 'deepseek-chat', tokensUsed: 10, retried: false })),
}))
vi.mock('@/lib/programs/persist', () => ({
  persistExtractedProgram: vi.fn(async () => undefined),
}))
vi.mock('@/lib/programs/categorize', () => ({
  suggestCategory: vi.fn(async () => ({ categoryId: null, reason: null, confidence: null })),
}))

const actions = await import('@/lib/programs/actions')

describe('program actions surface', () => {
  it('exports the program actions', () => {
    for (const k of ['listPrograms', 'createProgram', 'updateProgramMeta', 'deleteProgram', 'extractProgram']) {
      expect(typeof (actions as Record<string, unknown>)[k]).toBe('function')
    }
  })
})
