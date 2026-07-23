import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/rbac-server', () => ({ requirePermission: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: {} }))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))

import { requirePermission } from '@/lib/rbac-server'
import {
  listProgramTaskTemplates, createProgramTaskTemplate, updateProgramTaskTemplate,
  deleteProgramTaskTemplate, reorderProgramTaskTemplates,
} from '@/lib/pm/actions'

describe('task-template actions require programs.manage', () => {
  beforeEach(() => {
    vi.mocked(requirePermission).mockReset()
    vi.mocked(requirePermission).mockRejectedValue(new Error('forbidden'))
  })
  it('listProgramTaskTemplates', async () => { await expect(listProgramTaskTemplates('p1')).rejects.toThrow() })
  it('createProgramTaskTemplate', async () => { await expect(createProgramTaskTemplate({ programId: 'p1', stage: 'DOCUMENTS', title: 'x', assignTo: 'PROCESSOR', mandatory: true, dueOffsetDays: null })).rejects.toThrow() })
  it('updateProgramTaskTemplate', async () => { await expect(updateProgramTaskTemplate('t1', { title: 'y' })).rejects.toThrow() })
  it('deleteProgramTaskTemplate', async () => { await expect(deleteProgramTaskTemplate('t1')).rejects.toThrow() })
  it('reorderProgramTaskTemplates', async () => { await expect(reorderProgramTaskTemplates('p1', 'DOCUMENTS', ['t1'])).rejects.toThrow() })
})
