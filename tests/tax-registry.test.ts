import { describe, it, expect } from 'vitest'
import { allItems } from '@/lib/objects'

describe('form-guides registry item', () => {
  it('is registered with its permissions', () => {
    const item = allItems().find(i => i.key === 'form-guides')
    expect(item?.href).toBe('/tax-templates')
    expect(item?.menuPermission).toBe('taxform.manage')
    expect(item?.permissions.map(p => p.key).sort()).toEqual(['taxform.manage', 'taxform.scan'])
  })
})
