import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same vi.hoisted(h.db) idiom as tests/pm-c2g-materialize.test.ts / pm-replace-expense.test.ts.
const h = vi.hoisted(() => ({ db: {} as any }))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn().mockResolvedValue({ user: { id: 'u1', permissions: ['programs.manage'] } }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('next/navigation', () => ({ notFound: vi.fn(() => { throw new Error('NEXT_NOT_FOUND') }) }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { suggestDeliverableMatches, applyDeliverableMatch } from '@/lib/pm/actions'
import { DELIVERABLE_CATALOG } from '@/lib/pm/deliverable-catalog'

function freshDb() {
  h.db.programDeliverableTemplate = {
    findMany: vi.fn(async ({ where }: any) => {
      if (where?.programId === 'p1') {
        return [
          { id: 'g1', name: '01.09 Μισθολογικό κόστος', description: '[Δαπάνες προσωπικού]' },
          { id: 'g2', name: 'Κάτι εντελώς άσχετο', description: null },
        ]
      }
      // "other programs" library query: where.programId = { not: 'p1' }
      return [{ id: 'lib-1', name: 'Δαπάνες προσωπικού (μισθοδοσία)' }]
    }),
    findUniqueOrThrow: vi.fn(),
    update: vi.fn(async ({ where, data }: any) => ({ id: where.id, ...data })),
  }
  h.db.programDeliverableTask = {
    deleteMany: vi.fn(),
    createMany: vi.fn(),
  }
  h.db.$transaction = vi.fn(async (fn: any) => fn(h.db))
}

describe('suggestDeliverableMatches', () => {
  beforeEach(freshDb)

  it('returns [] when the program has no templates', async () => {
    h.db.programDeliverableTemplate.findMany = vi.fn().mockResolvedValue([])
    const r = await suggestDeliverableMatches('p1')
    expect(r).toEqual([])
  })

  it('returns one entry per own template, suggestions from catalog + other programs, self excluded', async () => {
    const r = await suggestDeliverableMatches('p1')
    expect(r).toHaveLength(2)
    expect(r[0].extracted).toEqual({ templateId: 'g1', name: '01.09 Μισθολογικό κόστος' })
    // "01.09 Μισθολογικό κόστος [Δαπάνες προσωπικού]" should match both the
    // catalog "personnel" entry and the other program's library template —
    // and NOT match its own sibling group g2 (never a candidate — only
    // OTHER programs' templates are library candidates).
    const keys = r[0].suggestions.map((s) => s.key)
    expect(keys).toContain('personnel')
    expect(keys).toContain('lib-1')
    expect(keys).not.toContain('g2')
    const sources = new Set(r[0].suggestions.map((s) => s.source))
    expect(sources.has('catalog') || sources.has('library')).toBe(true)
  })

  it('the unrelated group gets no suggestions at all (below-threshold candidates are filtered out)', async () => {
    const r = await suggestDeliverableMatches('p1')
    const unrelated = r.find((x) => x.extracted.templateId === 'g2')!
    expect(unrelated.suggestions).toEqual([])
  })
})

describe('applyDeliverableMatch', () => {
  beforeEach(freshDb)

  it('action=link just sets sourceTemplateId, no task changes', async () => {
    h.db.programDeliverableTemplate.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 't1', programId: 'p1' })
    await applyDeliverableMatch('t1', { action: 'link', sourceTemplateId: 'personnel' })
    expect(h.db.programDeliverableTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { sourceTemplateId: 'personnel' },
    })
    expect(h.db.programDeliverableTask.deleteMany).not.toHaveBeenCalled()
    expect(h.db.programDeliverableTask.createMany).not.toHaveBeenCalled()
  })

  it('action=replaceWithCatalog overwrites tasks from the catalog entry, keeps sourceTemplateId=catalogKey', async () => {
    h.db.programDeliverableTemplate.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 't1', programId: 'p1' })
    const licenses = DELIVERABLE_CATALOG.find((c) => c.key === 'licenses')!
    await applyDeliverableMatch('t1', { action: 'replaceWithCatalog', catalogKey: 'licenses' })

    expect(h.db.programDeliverableTask.deleteMany).toHaveBeenCalledWith({ where: { templateId: 't1' } })
    expect(h.db.programDeliverableTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { sourceTemplateId: 'licenses' },
    })
    const created = h.db.programDeliverableTask.createMany.mock.calls[0][0].data
    expect(created).toHaveLength(licenses.tasks.length)
    expect(created[0]).toMatchObject({ templateId: 't1', name: licenses.tasks[0].name, phase: licenses.tasks[0].phase, order: 0 })
  })

  it('action=replaceWithCatalog throws on an unknown catalog key', async () => {
    h.db.programDeliverableTemplate.findUniqueOrThrow = vi.fn().mockResolvedValue({ id: 't1', programId: 'p1' })
    await expect(applyDeliverableMatch('t1', { action: 'replaceWithCatalog', catalogKey: 'nope' })).rejects.toThrow()
    expect(h.db.programDeliverableTask.deleteMany).not.toHaveBeenCalled()
  })

  it('action=replaceWithLibrary overwrites tasks from the source template, sourceTemplateId=its id', async () => {
    h.db.programDeliverableTemplate.findUniqueOrThrow = vi.fn()
      .mockResolvedValueOnce({ id: 't1', programId: 'p1' }) // the target template lookup
      .mockResolvedValueOnce({
        id: 'lib-1',
        tasks: [
          { phase: 'SUBMISSION', name: 'Προσφορά', mandatory: true, onSiteVerification: false, minFiles: 1 },
          { phase: 'FINAL_PAYMENT', name: 'Τιμολόγιο', mandatory: true, onSiteVerification: false, minFiles: 1 },
        ],
      })
    await applyDeliverableMatch('t1', { action: 'replaceWithLibrary', libraryTemplateId: 'lib-1' })

    expect(h.db.programDeliverableTemplate.update).toHaveBeenCalledWith({
      where: { id: 't1' },
      data: { sourceTemplateId: 'lib-1' },
    })
    const created = h.db.programDeliverableTask.createMany.mock.calls[0][0].data
    expect(created).toEqual([
      { phase: 'SUBMISSION', name: 'Προσφορά', mandatory: true, onSiteVerification: false, minFiles: 1, order: 0, templateId: 't1' },
      { phase: 'FINAL_PAYMENT', name: 'Τιμολόγιο', mandatory: true, onSiteVerification: false, minFiles: 1, order: 1, templateId: 't1' },
    ])
  })
})
