import { describe, it, expect, vi } from 'vitest'

/**
 * Surface-only test: επιβεβαιώνει ότι κάθε ProgramRequiredForm ενέργεια
 * είναι exported συνάρτηση. Ίδιο idiom με tests/programs-actions-guard.test.ts
 * (mockάρουμε rbac-server/prisma/next-cache — το πραγματικό rbac-server →
 * auth → next-auth chain σκοντάφτει σε module-resolution πρόβλημα κάτω από
 * vitest/vite-node, άσχετο με τη σωστότητα του action code).
 */
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['programs.manage'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    programRequiredForm: {
      findMany: vi.fn(async () => []),
      count: vi.fn(async () => 0),
      create: vi.fn(async () => ({ id: 'rf-1', programId: 'prog-1' })),
      update: vi.fn(async () => ({ id: 'rf-1', programId: 'prog-1' })),
      delete: vi.fn(async () => ({ id: 'rf-1', programId: 'prog-1' })),
    },
    taxFormTemplate: {
      findMany: vi.fn(async () => []),
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

describe('program required-forms actions surface', () => {
  it('exports the required-forms actions', () => {
    for (const k of ['listProgramRequiredForms', 'addRequiredForm', 'updateRequiredForm', 'removeRequiredForm', 'listTaxTemplateOptions']) {
      expect(typeof (actions as Record<string, unknown>)[k]).toBe('function')
    }
  })
})
