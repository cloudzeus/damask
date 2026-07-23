import { describe, it, expect } from 'vitest'
import { allItems } from '@/lib/objects'

describe('pm registry item', () => {
  it('is registered', () => {
    const item = allItems().find(i => i.key === 'pm')
    expect(item?.href).toBe('/pm')
    expect(item?.menuPermission).toBe('pm.work')
    expect(item?.permissions.map(p => p.key).sort()).toEqual(['pm.manage', 'pm.work'])
  })
})
