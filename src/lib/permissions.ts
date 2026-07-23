import { allItems, type PermissionDef } from '@/lib/objects'

export type { PermissionDef }

/** Full permission catalog — derived from the object registry (single source of truth). */
export const PERMISSIONS: PermissionDef[] = allItems().flatMap(i => i.permissions)

const ALL = PERMISSIONS.map(p => p.key)

/**
 * 8-role model (RBAC v2). Σειρά δήλωσης = ROLE_ORDER (κάρτες + στήλες
 * matrix σε /roles) — SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, CUSTOMER,
 * SUPPLIER, ARCHITECT, SALESMAN. Όλα editable αργότερα μέσω του matrix —
 * αυτά είναι μόνο τα seeds.
 */
export const ROLE_DEFAULTS: Record<string, string[]> = {
  SUPER_ADMIN: ALL,
  ADMIN: ALL.filter(key => key !== 'settings.manage'),
  MANAGER: [
    'product.view', 'product.edit', 'product.publish', 'import.run',
    'translation.edit', 'translation.approve',
    'media.manage', 'category.manage', 'unit.manage', 'container.manage',
    'customer.view', 'customer.edit',
    'order.view', 'order.approve', 'order.autoapprove',
    'commission.manage', 'sync.run',
    'cms.view', 'cms.edit',
    'payment.view', 'payment.manage',
    'pm.work',
    'regions.view', 'kad.view',
  ],
  EMPLOYEE: ['product.view', 'customer.view', 'order.view', 'order.create', 'cms.view', 'pm.work', 'regions.view', 'kad.view'],
  CUSTOMER: ['portal.access', 'order.create', 'order.view'],
  SUPPLIER: ['portal.access', 'order.view'],
  ARCHITECT: ['portal.access', 'order.create', 'order.view', 'commission.view'],
  // ΣΗΜΕΙΩΣΗ (πηγή Viva-payments brief): ο SALESMAN παίρνει μόνο payment.view —
  // η δημιουργία/ακύρωση πληρωμών (payment.manage) μένει σε ADMIN/MANAGER/
  // SUPER_ADMIN. Το πρωτότυπο αίτημα ήταν διφορούμενο («view+manage; view
  // μόνο, manage στα admin/manager») — αν ο SALESMAN πρέπει τελικά να μπορεί
  // να κόβει ο ίδιος κωδικούς πληρωμής σε πελάτες, πρόσθεσε 'payment.manage'
  // εδώ (ή δώσε το μέσα από το /roles UI, ήδη editable).
  SALESMAN: [
    'product.view', 'customer.view', 'customer.edit',
    'order.view', 'order.create', 'order.approve', 'order.autoapprove',
    'commission.view',
    'payment.view',
  ],
}

/** Σειρά εμφάνισης ρόλων σε /roles (κάρτες + στήλες matrix) — όχι αλφαβητική. */
export const ROLE_ORDER = Object.keys(ROLE_DEFAULTS)

/** Ετικέτα ομάδας ανά πρόθεμα permission key — για το matrix /roles. */
const PERMISSION_GROUP_LABELS: Record<string, string> = {
  product: 'Προϊόντα & Κατάλογος',
  import: 'Προϊόντα & Κατάλογος',
  translation: 'Προϊόντα & Κατάλογος',
  media: 'Προϊόντα & Κατάλογος',
  category: 'Προϊόντα & Κατάλογος',
  unit: 'Προϊόντα & Κατάλογος',
  customer: 'Πελάτες & Παραγγελίες',
  order: 'Πελάτες & Παραγγελίες',
  commission: 'Πελάτες & Παραγγελίες',
  portal: 'Πελάτες & Παραγγελίες',
  payment: 'Πελάτες & Παραγγελίες',
  container: 'Διαχείριση',
  sync: 'Διαχείριση',
  user: 'Διαχείριση',
  settings: 'Διαχείριση',
  cms: 'Διαχείριση',
  costs: 'Διαχείριση',
  taxform: 'Διαχείριση',
  programs: 'Ευρωπαϊκά Προγράμματα',
  pm: 'Ευρωπαϊκά Προγράμματα',
  regions: 'Μητρώα',
  kad: 'Μητρώα',
}

export type PermissionGroup = { label: string; items: PermissionDef[] }

/**
 * Ομαδοποιεί το PERMISSIONS catalog ανά πρόθεμα (product/order/user/…) στις
 * ενότητες του permissions matrix, διατηρώντας τη σειρά εμφάνισης της
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
