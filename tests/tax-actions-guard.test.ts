import { describe, it, expect, vi } from 'vitest'

/**
 * Surface-only test: επιβεβαιώνει ότι κάθε ενέργεια είναι exported συνάρτηση.
 * Mockάρουμε rbac-server/prisma/next-cache όπως τα υπόλοιπα *-actions.test.ts
 * (π.χ. tests/media-actions.test.ts) — το πραγματικό @/lib/rbac-server →
 * @/auth → next-auth chain σκοντάφτει σε πρόβλημα resolution του "next/server"
 * κάτω από vitest/vite-node σε αυτό το περιβάλλον, άσχετο με τη σωστότητα
 * του action code.
 */
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => ({
    user: { id: 'admin-1', role: 'ADMIN', permissions: ['taxform.manage', 'taxform.scan'], trdrId: null },
  })),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    taxFormTemplate: {
      findMany: vi.fn(async () => []),
      create: vi.fn(async () => ({ id: 'tpl-1' })),
      update: vi.fn(async () => ({ id: 'tpl-1' })),
      delete: vi.fn(async () => ({ id: 'tpl-1' })),
    },
  },
}))
vi.mock('@/lib/bunny-storage', () => ({
  bunnyUploadPrivate: vi.fn(async ({ key }: { key: string }) => ({ key })),
}))

const actions = await import('@/lib/tax/actions')

describe('tax actions surface', () => {
  it('exports the template CRUD + upload actions', () => {
    for (const k of ['listTemplates', 'listReadyTemplates', 'createTemplate', 'updateTemplateMeta', 'deleteTemplate', 'uploadSample']) {
      expect(typeof (actions as Record<string, unknown>)[k]).toBe('function')
    }
  })
})
