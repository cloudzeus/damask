import { describe, it, expect } from 'vitest'
import { PERMISSIONS, ROLE_DEFAULTS, ROLE_ORDER, groupedPermissions } from '@/lib/permissions'

describe('permissions catalog', () => {
  it('has unique keys', () => {
    const keys = PERMISSIONS.map(p => p.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('every role default references existing permissions', () => {
    const keys = new Set(PERMISSIONS.map(p => p.key))
    for (const [role, perms] of Object.entries(ROLE_DEFAULTS)) {
      for (const p of perms) expect(keys.has(p), `${role}: ${p}`).toBe(true)
    }
  })

  it('SUPER_ADMIN has all permissions', () => {
    expect(ROLE_DEFAULTS.SUPER_ADMIN.length).toBe(PERMISSIONS.length)
  })

  it('ADMIN has all permissions except settings.manage', () => {
    expect(ROLE_DEFAULTS.ADMIN.length).toBe(PERMISSIONS.length - 1)
    expect(ROLE_DEFAULTS.ADMIN).not.toContain('settings.manage')
  })
})

describe('ROLE_ORDER', () => {
  it('lists the 8 system roles, SUPER_ADMIN first', () => {
    expect(ROLE_ORDER).toEqual([
      'SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CUSTOMER', 'SUPPLIER', 'ARCHITECT', 'SALESMAN',
    ])
  })
})

describe('groupedPermissions()', () => {
  it('συμπεριλαμβάνει κάθε permission ακριβώς μία φορά', () => {
    const groups = groupedPermissions()
    const flat = groups.flatMap(g => g.items.map(i => i.key))
    expect(flat.length).toBe(PERMISSIONS.length)
    expect(new Set(flat).size).toBe(PERMISSIONS.length)
  })

  it('παράγει τις 4 ενότητες στη σωστή σειρά με τη σωστή ετικέτα ανά permission', () => {
    const groups = groupedPermissions()
    expect(groups.map(g => g.label)).toEqual([
      'Προϊόντα & Κατάλογος',
      'Πελάτες & Παραγγελίες',
      'Διαχείριση',
      'Ευρωπαϊκά Προγράμματα',
      'Μητρώα',
    ])

    const labelOf = (key: string) =>
      groups.find(g => g.items.some(i => i.key === key))?.label

    expect(labelOf('product.edit')).toBe('Προϊόντα & Κατάλογος')
    expect(labelOf('translation.approve')).toBe('Προϊόντα & Κατάλογος')
    expect(labelOf('media.manage')).toBe('Προϊόντα & Κατάλογος')
    expect(labelOf('category.manage')).toBe('Προϊόντα & Κατάλογος')
    expect(labelOf('unit.manage')).toBe('Προϊόντα & Κατάλογος')

    expect(labelOf('customer.edit')).toBe('Πελάτες & Παραγγελίες')
    expect(labelOf('order.approve')).toBe('Πελάτες & Παραγγελίες')
    expect(labelOf('commission.manage')).toBe('Πελάτες & Παραγγελίες')
    expect(labelOf('portal.access')).toBe('Πελάτες & Παραγγελίες')
    expect(labelOf('payment.view')).toBe('Πελάτες & Παραγγελίες')
    expect(labelOf('payment.manage')).toBe('Πελάτες & Παραγγελίες')

    expect(labelOf('container.manage')).toBe('Διαχείριση')
    expect(labelOf('sync.run')).toBe('Διαχείριση')
    expect(labelOf('user.manage')).toBe('Διαχείριση')
    expect(labelOf('settings.manage')).toBe('Διαχείριση')
    expect(labelOf('taxform.manage')).toBe('Διαχείριση')

    expect(labelOf('programs.manage')).toBe('Ευρωπαϊκά Προγράμματα')

    expect(labelOf('regions.view')).toBe('Μητρώα')
    expect(labelOf('kad.view')).toBe('Μητρώα')
  })

  it('διατηρεί τη δηλωμένη σειρά του PERMISSIONS μέσα σε κάθε ομάδα', () => {
    const groups = groupedPermissions()
    const catalog = groups.find(g => g.label === 'Πελάτες & Παραγγελίες')!
    expect(catalog.items.map(i => i.key)).toEqual([
      'customer.view', 'customer.edit',
      'order.view', 'order.create', 'order.approve', 'order.autoapprove',
      'commission.view', 'commission.manage',
      'portal.access',
      'payment.view', 'payment.manage',
    ])
  })
})
