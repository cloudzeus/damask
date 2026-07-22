import { describe, it, expect } from 'vitest'
import {
  OBJECT_REGISTRY, allItems, coreItemKeys, effectiveEnabledKeys,
  buildNav, groupedPermissionsFor,
} from '@/lib/objects'

describe('registry integrity', () => {
  it('has unique item keys and unique permission keys', () => {
    const items = allItems()
    const itemKeys = items.map(i => i.key)
    expect(new Set(itemKeys).size).toBe(itemKeys.length)
    const permKeys = items.flatMap(i => i.permissions.map(p => p.key))
    expect(new Set(permKeys).size).toBe(permKeys.length)
  })
  it('every menuPermission that is non-null is owned by some item', () => {
    const owned = new Set(allItems().flatMap(i => i.permissions.map(p => p.key)))
    for (const i of allItems()) {
      if (i.menuPermission) expect(owned.has(i.menuPermission)).toBe(true)
    }
  })
})

describe('effectiveEnabledKeys', () => {
  it('always includes core keys and ignores unknown stored keys', () => {
    const eff = effectiveEnabledKeys(['products', 'bogus'])
    expect(eff.has('products')).toBe(true)
    expect(eff.has('bogus')).toBe(false)
    for (const k of coreItemKeys()) expect(eff.has(k)).toBe(true)
  })
  it('core keys are effective even when stored list is empty', () => {
    const eff = effectiveEnabledKeys([])
    expect(eff.has('dashboard')).toBe(true)
    expect(eff.has('settings')).toBe(true)
    expect(eff.has('products')).toBe(false)
  })
})

describe('buildNav', () => {
  it('hides an item when its object is disabled even if permission is held', () => {
    const nav = buildNav(effectiveEnabledKeys([]), ['product.view'])
    const hrefs = nav.flatMap(m => m.items.map(i => i.href))
    expect(hrefs).not.toContain('/products')
    expect(hrefs).toContain('/dashboard')
  })
  it('hides an item when permission is missing even if object is enabled', () => {
    const nav = buildNav(effectiveEnabledKeys(['products']), [])
    const hrefs = nav.flatMap(m => m.items.map(i => i.href))
    expect(hrefs).not.toContain('/products')
  })
  it('shows an enabled+permitted item and omits empty modules', () => {
    const nav = buildNav(effectiveEnabledKeys(['products']), ['product.view'])
    const hrefs = nav.flatMap(m => m.items.map(i => i.href))
    expect(hrefs).toContain('/products')
    expect(nav.every(m => m.items.length > 0)).toBe(true)
  })
})

describe('groupedPermissionsFor', () => {
  it('excludes disabled objects’ permissions and always keeps core (settings)', () => {
    const groups = groupedPermissionsFor(effectiveEnabledKeys([]))
    const keys = groups.flatMap(g => g.items.map(i => i.key))
    expect(keys).not.toContain('product.view')
    expect(keys).toContain('settings.manage')
  })
  it('includes an enabled object’s permissions', () => {
    const groups = groupedPermissionsFor(effectiveEnabledKeys(['products']))
    const keys = groups.flatMap(g => g.items.map(i => i.key))
    expect(keys).toContain('product.view')
    expect(keys).toContain('translation.edit')
  })
})
