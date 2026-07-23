import { describe, it, expect, vi, beforeEach } from 'vitest'

/**
 * Guard test: the 4 gated actions in @/lib/prospects/actions all start with
 * requirePermission('programs.manage') and must reject when it rejects —
 * mirrors tests/pm-c2b-actions-guard.test.ts / tests/pm-c2f-actions-guard.test.ts
 * idiom (mock rbac-server to reject, assert every export rejects). prisma is
 * mocked to `{}` — if any of these actions ever touch prisma BEFORE the
 * requirePermission gate, calling an unmocked delegate throws a distinct
 * TypeError, not the "forbidden" Error we assert on, so this also catches
 * gate-ordering regressions.
 */
vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/programs/actions', () => ({ createApplication: vi.fn() }))

import { requirePermission } from '@/lib/rbac-server'
import { findProspects, sendProgramNewsletter, listProgramLeads, createOpportunityApplication } from '@/lib/prospects/actions'

beforeEach(() => {
  vi.mocked(requirePermission).mockReset()
  vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
})

describe('prospects actions enforce programs.manage', () => {
  it('findProspects rejects', async () => {
    await expect(findProspects('prog-1', { kad: true, region: true, legalForm: true })).rejects.toThrow()
  })

  it('sendProgramNewsletter rejects', async () => {
    await expect(sendProgramNewsletter('prog-1', ['trdr-1'])).rejects.toThrow()
  })

  it('listProgramLeads rejects', async () => {
    await expect(listProgramLeads('prog-1')).rejects.toThrow()
  })

  it('createOpportunityApplication rejects', async () => {
    await expect(createOpportunityApplication('lead-1')).rejects.toThrow()
  })
})
