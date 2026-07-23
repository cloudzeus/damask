import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))

import { requirePermission } from '@/lib/rbac-server'
import {
  listDeliverableTemplates, saveDeliverableTemplate, deleteDeliverableTemplate,
  reorderDeliverableTemplates, listDeliverableTemplateLibrary, copyDeliverableTemplates,
  suggestDeliverableMatches, applyDeliverableMatch,
} from '@/lib/pm/actions'

describe('deliverable-template actions require programs.manage', () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset()
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
  })
  it('listDeliverableTemplates', async () => { await expect(listDeliverableTemplates('p1')).rejects.toThrow() })
  it('saveDeliverableTemplate', async () => {
    await expect(saveDeliverableTemplate({
      programId: 'p1', name: 'x', appliesTo: 'EXPENSE',
      tasks: [{ phase: 'SUBMISSION', name: 't1', mandatory: true, onSiteVerification: false, minFiles: 1, order: 0 }],
    })).rejects.toThrow()
  })
  it('deleteDeliverableTemplate', async () => { await expect(deleteDeliverableTemplate('t1')).rejects.toThrow() })
  it('reorderDeliverableTemplates', async () => { await expect(reorderDeliverableTemplates('p1', ['a'])).rejects.toThrow() })
  it('listDeliverableTemplateLibrary', async () => { await expect(listDeliverableTemplateLibrary()).rejects.toThrow() })
  it('copyDeliverableTemplates', async () => { await expect(copyDeliverableTemplates('p1', ['t1'])).rejects.toThrow() })
  it('suggestDeliverableMatches', async () => { await expect(suggestDeliverableMatches('p1')).rejects.toThrow() })
  it('applyDeliverableMatch', async () => {
    await expect(applyDeliverableMatch('t1', { action: 'link', sourceTemplateId: 'personnel' })).rejects.toThrow()
  })
})
