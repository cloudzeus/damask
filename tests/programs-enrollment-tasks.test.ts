import { describe, it, expect, vi, beforeEach } from 'vitest'

// NOTE: vi.mock factories run before any top-level `const` in this file is
// initialized (ES module imports always execute first). Referencing plain
// top-level consts from inside a factory hits a TDZ error, so the shared
// mocks must be declared via vi.hoisted() instead.
const { genMock, db } = vi.hoisted(() => ({
  genMock: vi.fn().mockResolvedValue({ addedObligations: 0, addedScores: 0, addedTasks: 3 }),
  db: { programApplication: { upsert: vi.fn().mockResolvedValue({ id: 'app-new' }) } } as any,
}))

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u1' } }) }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/pm/actions', () => ({ generateObligations: (...a: any[]) => genMock(...a) }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))

import { createApplication } from '@/lib/programs/actions'

beforeEach(() => { genMock.mockClear(); genMock.mockResolvedValue({ addedObligations: 0, addedScores: 0, addedTasks: 3 }) })

describe('createApplication auto-generates tasks', () => {
  it('calls generateObligations with the new app id', async () => {
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
    expect(genMock).toHaveBeenCalledWith('app-new')
  })
  it('does not roll back enrollment if generation throws', async () => {
    genMock.mockRejectedValueOnce(new Error('boom'))
    const res = await createApplication({ trdrId: 'tr1', programId: 'p1' })
    expect(res.id).toBe('app-new')
  })
})
