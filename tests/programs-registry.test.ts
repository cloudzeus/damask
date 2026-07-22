import { describe, it, expect } from 'vitest'
import { allItems } from '@/lib/objects'

describe('programs registry item', () => {
  it('is registered with its permission', () => {
    const item = allItems().find(i => i.key === 'programs')
    expect(item?.href).toBe('/programs')
    expect(item?.menuPermission).toBe('programs.manage')
    expect(item?.permissions.map(p => p.key)).toEqual(['programs.manage'])
  })
})
