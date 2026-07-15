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

/** Σειρά εμφάνισης ρόλων σε /roles (κάρτες + στήλες matrix) — όχι αλφαβητική. */
export const ROLE_ORDER = Object.keys(ROLE_DEFAULTS)

/** Ετικέτα ομάδας ανά πρόθεμα permission key — για το matrix /roles. */
const PERMISSION_GROUP_LABELS: Record<string, string> = {
  product: 'Προϊόντα & Κατάλογος',
  translation: 'Προϊόντα & Κατάλογος',
  media: 'Προϊόντα & Κατάλογος',
  category: 'Προϊόντα & Κατάλογος',
  unit: 'Προϊόντα & Κατάλογος',
  customer: 'Πελάτες & Παραγγελίες',
  order: 'Πελάτες & Παραγγελίες',
  commission: 'Πελάτες & Παραγγελίες',
  portal: 'Πελάτες & Παραγγελίες',
  container: 'Διαχείριση',
  sync: 'Διαχείριση',
  user: 'Διαχείριση',
  settings: 'Διαχείριση',
}

export type PermissionGroup = { label: string; items: PermissionDef[] }

/**
 * Ομαδοποιεί το PERMISSIONS catalog ανά πρόθεμα (product/order/user/…) στις
 * 3 ενότητες του permissions matrix, διατηρώντας τη σειρά εμφάνισης της
 * πρώτης ετικέτας που συναντάται (όχι απαραίτητα η σειρά μέσα σε κάθε ομάδα —
 * αυτή ακολουθεί πάντα τη δηλωμένη σειρά του PERMISSIONS).
 */
export function groupedPermissions(): PermissionGroup[] {
  const order: string[] = []
  const buckets = new Map<string, PermissionDef[]>()

  for (const perm of PERMISSIONS) {
    const prefix = perm.key.split('.')[0]
    const label = PERMISSION_GROUP_LABELS[prefix] ?? 'Άλλο'
    if (!buckets.has(label)) {
      buckets.set(label, [])
      order.push(label)
    }
    buckets.get(label)!.push(perm)
  }

  return order.map(label => ({ label, items: buckets.get(label)! }))
}
