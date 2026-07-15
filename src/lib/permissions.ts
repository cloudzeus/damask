export type PermissionDef = { key: string; description: string }

export const PERMISSIONS: PermissionDef[] = [
  { key: 'product.view', description: 'Προβολή προϊόντων' },
  { key: 'product.edit', description: 'Επεξεργασία προϊόντων' },
  { key: 'product.publish', description: 'Δημοσίευση προϊόντων' },
  { key: 'translation.edit', description: 'Επεξεργασία μεταφράσεων' },
  { key: 'translation.approve', description: 'Έγκριση μεταφράσεων' },
  { key: 'media.manage', description: 'Διαχείριση media' },
  { key: 'category.manage', description: 'Διαχείριση κατηγοριών/ομάδων' },
  { key: 'unit.manage', description: 'Διαχείριση μονάδων μέτρησης' },
  { key: 'customer.view', description: 'Προβολή πελατών' },
  { key: 'customer.edit', description: 'Επεξεργασία πελατών/επαφών' },
  { key: 'order.view', description: 'Προβολή παραγγελιών' },
  { key: 'order.create', description: 'Δημιουργία παραγγελιών' },
  { key: 'order.approve', description: 'Έγκριση παραγγελιών' },
  { key: 'order.autoapprove', description: 'Παράκαμψη έγκρισης' },
  { key: 'container.manage', description: 'Διαχείριση containers & τιμολόγησης' },
  { key: 'commission.view', description: 'Προβολή προμηθειών (δικών του)' },
  { key: 'commission.manage', description: 'Διαχείριση προμηθειών' },
  { key: 'portal.access', description: 'Πρόσβαση B2B portal' },
  { key: 'sync.run', description: 'Εκτέλεση sync με SoftOne' },
  { key: 'user.manage', description: 'Διαχείριση χρηστών/ρόλων' },
  { key: 'settings.manage', description: 'Ρυθμίσεις συστήματος' },
]

const ALL = PERMISSIONS.map(p => p.key)

export const ROLE_DEFAULTS: Record<string, string[]> = {
  ADMIN: ALL,
  PURCHASING: [
    'product.view', 'unit.manage', 'container.manage',
    'order.view', 'sync.run', 'commission.manage',
  ],
  PRODUCT_MANAGER: [
    'product.view', 'product.edit', 'product.publish',
    'translation.edit', 'translation.approve', 'media.manage',
    'category.manage', 'unit.manage', 'sync.run',
  ],
  SALES: [
    'product.view', 'customer.view', 'customer.edit',
    'order.view', 'order.create', 'order.approve', 'order.autoapprove',
  ],
  ARCHITECT: ['portal.access', 'order.create', 'order.view', 'commission.view'],
  CUSTOMER: ['portal.access', 'order.create', 'order.view'],
}
