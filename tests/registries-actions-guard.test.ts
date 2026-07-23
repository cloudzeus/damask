import { describe, it, expect, vi } from 'vitest'

/**
 * Surface-only guard test: επιβεβαιώνει ότι ΚΑΘΕ registries action απορρίπτει
 * (throws) όταν το requirePermission αποτυγχάνει — δηλαδή ότι το gate είναι
 * πραγματικά καλωδιωμένο πριν από οποιαδήποτε lib κλήση. Ίδιο idiom με
 * tests/pm-actions-guard.test.ts: mockάρουμε rbac-server/prisma/next-cache/
 * next-navigation — το πραγματικό @/lib/rbac-server → @/auth → next-auth
 * chain σκοντάφτει σε πρόβλημα resolution του "next/server" κάτω από
 * vitest/vite-node σε αυτό το περιβάλλον, άσχετο με τη σωστότητα του action
 * code.
 */
vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async () => {
    throw new Error('Forbidden')
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))

const actions = await import('@/lib/registries/actions')

describe('registries actions guard', () => {
  it('regionChildrenAction rejects without regions.view', async () => {
    await expect(actions.regionChildrenAction()).rejects.toThrow()
  })

  it('regionDecodeAction rejects without regions.view', async () => {
    await expect(actions.regionDecodeAction('x')).rejects.toThrow()
  })

  it('regionMatchAction rejects without regions.view', async () => {
    await expect(actions.regionMatchAction({})).rejects.toThrow()
  })

  it('kadChildrenAction rejects without kad.view', async () => {
    await expect(actions.kadChildrenAction()).rejects.toThrow()
  })

  it('kadDecodeAction rejects without kad.view', async () => {
    await expect(actions.kadDecodeAction('62')).rejects.toThrow()
  })

  it('kadSearchAction rejects without kad.view', async () => {
    await expect(actions.kadSearchAction('q')).rejects.toThrow()
  })
})
