import { describe, it, expect, vi, beforeEach } from 'vitest'

// Same vi.hoisted(h.db) idiom as tests/trdr-gemi-sync.test.ts.
const h = vi.hoisted(() => ({ db: {} as any, permissions: ['regions.view', 'regions.manage', 'kad.view', 'kad.manage'] as string[] }))

vi.mock('@/lib/rbac-server', () => ({
  requirePermission: vi.fn(async (perm: string) => {
    if (!h.permissions.includes(perm)) throw new Error(`Forbidden: απαιτείται ${perm}`)
    return { user: { id: 'u1', permissions: h.permissions } }
  }),
}))
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }))
vi.mock('@/lib/prisma', () => ({ prisma: h.db }))

import { requirePermission } from '@/lib/rbac-server'
import {
  regionCreateAction,
  regionUpdateAction,
  regionDeleteAction,
  kadCreateAction,
  kadUpdateAction,
  kadDeleteAction,
} from '@/lib/registries/actions'

function freshDb() {
  h.permissions = ['regions.view', 'regions.manage', 'kad.view', 'kad.manage']
  h.db.region = {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }: any) => data),
    update: vi.fn(async ({ where, data }: any) => ({ ...where, ...data })),
    delete: vi.fn(async () => ({})),
  }
  h.db.kadCode = {
    findUnique: vi.fn(async () => null),
    create: vi.fn(async ({ data }: any) => data),
    update: vi.fn(async ({ where, data }: any) => ({ ...where, ...data })),
    delete: vi.fn(async () => ({})),
  }
  h.db.trdrKad = { count: vi.fn(async () => 0) }
}

beforeEach(freshDb)

describe('regionCreateAction', () => {
  it('gates on regions.manage (regions.view alone is not enough)', async () => {
    h.permissions = ['regions.view']
    await expect(regionCreateAction({ code: '111', nameEL: 'Χ' })).rejects.toThrow('regions.manage')
    expect(h.db.region.create).not.toHaveBeenCalled()
  })

  it('creates a root region at level 3 with path = code', async () => {
    await regionCreateAction({ code: '111', nameEL: 'ΑΜΘ', nameEN: 'EMT' })
    expect(vi.mocked(requirePermission)).toHaveBeenCalledWith('regions.manage')
    const data = h.db.region.create.mock.calls[0][0].data
    expect(data).toMatchObject({ code: '111', nameEL: 'ΑΜΘ', nameEN: 'EMT', level: 3, parentCode: null, path: '111' })
  })

  it('creates a child under a parent: level = parent+1, path extends the parent path, prefix enforced', async () => {
    h.db.region.findUnique = vi.fn(async ({ where }: any) =>
      where.code === '111' ? { code: '111', level: 3, path: '111' } : null)
    await regionCreateAction({ code: '11102', nameEL: 'Δράμα', parentCode: '111' })
    const data = h.db.region.create.mock.calls[0][0].data
    expect(data).toMatchObject({ code: '11102', level: 4, parentCode: '111', path: '111>11102' })
  })

  it('rejects a child code that does not extend the parent code (σχήμα Καλλικράτη)', async () => {
    h.db.region.findUnique = vi.fn(async ({ where }: any) =>
      where.code === '111' ? { code: '111', level: 3, path: '111' } : null)
    await expect(regionCreateAction({ code: '99902', nameEL: 'Χ', parentCode: '111' })).rejects.toThrow('111')
    expect(h.db.region.create).not.toHaveBeenCalled()
  })

  it('rejects a duplicate code', async () => {
    h.db.region.findUnique = vi.fn(async () => ({ code: '111' }))
    await expect(regionCreateAction({ code: '111', nameEL: 'Χ' })).rejects.toThrow('ήδη')
  })

  it('rejects adding children under a Δήμο (level 5)', async () => {
    h.db.region.findUnique = vi.fn(async ({ where }: any) =>
      where.code === '1110202' ? { code: '1110202', level: 5, path: '111>11102>1110202' } : null)
    await expect(regionCreateAction({ code: '111020201', nameEL: 'Χ', parentCode: '1110202' })).rejects.toThrow('επίπεδο 5')
  })
})

describe('regionUpdateAction', () => {
  it('updates names/coords/isActive without touching code/level/path', async () => {
    h.db.region.findUnique = vi.fn(async () => ({ code: '111', level: 3 }))
    await regionUpdateAction({ code: '111', nameEL: 'Νέο', nameEN: null, latitude: 41.1, longitude: 24.9, isActive: false })
    const call = h.db.region.update.mock.calls[0][0]
    expect(call.where).toEqual({ code: '111' })
    expect(call.data).toMatchObject({ nameEL: 'Νέο', nameEN: null, latitude: 41.1, longitude: 24.9, isActive: false })
    expect(call.data).not.toHaveProperty('code')
    expect(call.data).not.toHaveProperty('level')
    expect(call.data).not.toHaveProperty('path')
  })

  it('throws for an unknown code', async () => {
    await expect(regionUpdateAction({ code: '999', nameEL: 'Χ' })).rejects.toThrow('999')
  })
})

describe('regionDeleteAction', () => {
  it('blocks when the region has children', async () => {
    h.db.region.findUnique = vi.fn(async () => ({ code: '111', _count: { children: 5, trdrs: 0 } }))
    await expect(regionDeleteAction('111')).rejects.toThrow('υποδιαιρέσεις')
    expect(h.db.region.delete).not.toHaveBeenCalled()
  })

  it('blocks when the region is referenced by Trdrs', async () => {
    h.db.region.findUnique = vi.fn(async () => ({ code: '1110202', _count: { children: 0, trdrs: 3 } }))
    await expect(regionDeleteAction('1110202')).rejects.toThrow('συναλλασσόμενους')
    expect(h.db.region.delete).not.toHaveBeenCalled()
  })

  it('deletes a leaf region with no references', async () => {
    h.db.region.findUnique = vi.fn(async () => ({ code: '1110202', _count: { children: 0, trdrs: 0 } }))
    await regionDeleteAction('1110202')
    expect(h.db.region.delete).toHaveBeenCalledWith({ where: { code: '1110202' } })
  })
})

describe('kadCreateAction', () => {
  it('gates on kad.manage', async () => {
    h.permissions = ['kad.view']
    await expect(kadCreateAction({ code: '43.21', title: 'Χ' })).rejects.toThrow('kad.manage')
  })

  it('creates a child inheriting level+1, sector and path from the parent; codeWithoutDots derived', async () => {
    h.db.kadCode.findUnique = vi.fn(async ({ where }: any) =>
      where.code === '43.21' ? { code: '43.21', level: 4, path: 'ΣΤ>43>43.2>43.21', sector: 'ΣΤ', sectorLetter: 'ΣΤ' } : null)
    await kadCreateAction({ code: '43.21.00', title: 'Ηλεκτρικές εγκαταστάσεις', parentCode: '43.21' })
    const data = h.db.kadCode.create.mock.calls[0][0].data
    expect(data).toMatchObject({
      code: '43.21.00',
      codeWithoutDots: '432100',
      title: 'Ηλεκτρικές εγκαταστάσεις',
      description: 'Ηλεκτρικές εγκαταστάσεις',
      level: 5,
      parentCode: '43.21',
      path: 'ΣΤ>43>43.2>43.21>43.21.00',
      sector: 'ΣΤ',
      sectorLetter: 'ΣΤ',
    })
  })

  it('creates a root sector at level 1 (γράμμα, χωρίς ψηφία → codeWithoutDots null)', async () => {
    await kadCreateAction({ code: 'Α', title: 'Γεωργία' })
    const data = h.db.kadCode.create.mock.calls[0][0].data
    expect(data).toMatchObject({ code: 'Α', codeWithoutDots: null, level: 1, parentCode: null, path: 'Α' })
  })

  it('rejects a duplicate code', async () => {
    h.db.kadCode.findUnique = vi.fn(async () => ({ code: '43.21' }))
    await expect(kadCreateAction({ code: '43.21', title: 'Χ' })).rejects.toThrow('ήδη')
  })
})

describe('kadUpdateAction', () => {
  it('updates the title and keeps the legacy description in sync', async () => {
    h.db.kadCode.findUnique = vi.fn(async () => ({ code: '43.21' }))
    await kadUpdateAction({ code: '43.21', title: 'Νέος τίτλος', isActive: false })
    const call = h.db.kadCode.update.mock.calls[0][0]
    expect(call.data).toEqual({ title: 'Νέος τίτλος', description: 'Νέος τίτλος', isActive: false })
  })
})

describe('kadDeleteAction', () => {
  it('blocks when the code has children', async () => {
    h.db.kadCode.findUnique = vi.fn(async () => ({ code: '43.21', codeWithoutDots: '4321', _count: { children: 2 } }))
    await expect(kadDeleteAction('43.21')).rejects.toThrow('υποδιαιρέσεις')
  })

  it('blocks when the code is used by TrdrKad rows (soft reference, dotted ή χωρίς τελείες)', async () => {
    h.db.kadCode.findUnique = vi.fn(async () => ({ code: '43.21.00', codeWithoutDots: '432100', _count: { children: 0 } }))
    h.db.trdrKad.count = vi.fn(async () => 4)
    await expect(kadDeleteAction('43.21.00')).rejects.toThrow('4 συναλλασσόμενους')
    expect(h.db.trdrKad.count).toHaveBeenCalledWith({
      where: { OR: [{ code: '43.21.00' }, { codeWithoutDots: '432100' }] },
    })
    expect(h.db.kadCode.delete).not.toHaveBeenCalled()
  })

  it('deletes an unused leaf code', async () => {
    h.db.kadCode.findUnique = vi.fn(async () => ({ code: '43.21.00', codeWithoutDots: '432100', _count: { children: 0 } }))
    await kadDeleteAction('43.21.00')
    expect(h.db.kadCode.delete).toHaveBeenCalledWith({ where: { code: '43.21.00' } })
  })
})
