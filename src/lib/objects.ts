import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard, Package, FolderTree, Ruler, Handshake, ClipboardList,
  Container, Settings, Shield, UserCog, Upload, Images, Newspaper, Scale,
  Cookie, CreditCard, ScanText, Coins, FileText, Landmark,
} from 'lucide-react'

export type PermissionDef = { key: string; description: string }

export type ObjectItem = {
  key: string
  href: string
  label: string
  icon: LucideIcon
  menuPermission: string | null
  permissions: PermissionDef[]
  core?: boolean
  softone?: { object: string }
}

export type ObjectModule = { key: string; label: string; items: ObjectItem[] }

export const OBJECT_REGISTRY: ObjectModule[] = [
  { key: 'daily', label: 'Καθημερινά', items: [
    { key: 'dashboard', href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard, menuPermission: null, permissions: [], core: true },
  ] },
  { key: 'catalog', label: 'Προϊόντα & Κατάλογος', items: [
    { key: 'products', href: '/products', label: 'Προϊόντα', icon: Package, menuPermission: 'product.view', softone: { object: 'MTRL' }, permissions: [
      { key: 'product.view', description: 'Προβολή προϊόντων' },
      { key: 'product.edit', description: 'Επεξεργασία προϊόντων' },
      { key: 'product.publish', description: 'Δημοσίευση προϊόντων' },
      { key: 'translation.edit', description: 'Επεξεργασία μεταφράσεων' },
      { key: 'translation.approve', description: 'Έγκριση μεταφράσεων' },
    ] },
    { key: 'categories', href: '/categories', label: 'Κατηγορίες', icon: FolderTree, menuPermission: 'category.manage', permissions: [
      { key: 'category.manage', description: 'Διαχείριση κατηγοριών/ομάδων' },
    ] },
    { key: 'units', href: '/units', label: 'Μονάδες μέτρησης', icon: Ruler, menuPermission: 'unit.manage', permissions: [
      { key: 'unit.manage', description: 'Διαχείριση μονάδων μέτρησης' },
    ] },
  ] },
  { key: 'partners', label: 'Συναλλασσόμενοι', items: [
    { key: 'partners', href: '/partners', label: 'Συναλλασσόμενοι', icon: Handshake, menuPermission: 'customer.view', softone: { object: 'TRDR' }, permissions: [
      { key: 'customer.view', description: 'Προβολή πελατών' },
      { key: 'customer.edit', description: 'Επεξεργασία πελατών/επαφών' },
    ] },
  ] },
  { key: 'orders', label: 'Παραγγελίες & Πωλήσεις', items: [
    { key: 'orders', href: '/orders', label: 'Παραγγελίες', icon: ClipboardList, menuPermission: 'order.view', permissions: [
      { key: 'order.view', description: 'Προβολή παραγγελιών' },
      { key: 'order.create', description: 'Δημιουργία παραγγελιών' },
      { key: 'order.approve', description: 'Έγκριση παραγγελιών' },
      { key: 'order.autoapprove', description: 'Παράκαμψη έγκρισης' },
      { key: 'commission.view', description: 'Προβολή προμηθειών (δικών του)' },
      { key: 'commission.manage', description: 'Διαχείριση προμηθειών' },
      { key: 'portal.access', description: 'Πρόσβαση B2B portal' },
    ] },
  ] },
  { key: 'payments', label: 'Πληρωμές', items: [
    { key: 'payments', href: '/payments', label: 'Πληρωμές', icon: CreditCard, menuPermission: 'payment.view', permissions: [
      { key: 'payment.view', description: 'Προβολή πληρωμών (Viva)' },
      { key: 'payment.manage', description: 'Διαχείριση πληρωμών — δημιουργία, ακύρωση, ρυθμίσεις Viva' },
    ] },
  ] },
  { key: 'logistics', label: 'Logistics', items: [
    { key: 'containers', href: '/containers', label: 'Containers', icon: Container, menuPermission: 'container.manage', permissions: [
      { key: 'container.manage', description: 'Διαχείριση containers & τιμολόγησης' },
    ] },
  ] },
  { key: 'importing', label: 'Εισαγωγή', items: [
    { key: 'import', href: '/import', label: 'Εισαγωγή Excel', icon: Upload, menuPermission: 'import.run', permissions: [
      { key: 'import.run', description: 'Εκτέλεση εισαγωγών Excel' },
    ] },
  ] },
  { key: 'media', label: 'Media', items: [
    { key: 'media', href: '/media', label: 'Media Gallery', icon: Images, menuPermission: 'media.manage', permissions: [
      { key: 'media.manage', description: 'Διαχείριση media' },
    ] },
    { key: 'ocr-demo', href: '/ocr-demo', label: 'OCR (δοκιμή)', icon: ScanText, menuPermission: 'media.manage', permissions: [] },
  ] },
  { key: 'cms', label: 'CMS', items: [
    { key: 'cms-posts', href: '/cms/posts', label: 'Νέα', icon: Newspaper, menuPermission: 'cms.view', permissions: [
      { key: 'cms.view', description: 'Προβολή CMS' },
      { key: 'cms.edit', description: 'Διαχείριση άρθρων/CMS' },
    ] },
    { key: 'cms-legal', href: '/cms/legal', label: 'Νομικά', icon: Scale, menuPermission: 'cms.view', permissions: [] },
    { key: 'cms-consents', href: '/cms/consents', label: 'Συγκαταθέσεις', icon: Cookie, menuPermission: 'cms.view', permissions: [] },
  ] },
  { key: 'admin', label: 'Διαχείριση', items: [
    { key: 'users', href: '/users', label: 'Χρήστες', icon: UserCog, menuPermission: 'user.manage', core: true, permissions: [
      { key: 'user.manage', description: 'Διαχείριση χρηστών/ρόλων' },
    ] },
    { key: 'roles', href: '/roles', label: 'Ρόλοι & Δικαιώματα', icon: Shield, menuPermission: 'user.manage', core: true, permissions: [] },
    { key: 'costs', href: '/costs', label: 'Κόστη', icon: Coins, menuPermission: 'costs.view', core: true, permissions: [
      { key: 'costs.view', description: 'Προβολή κόστους AI/API (SUPER_ADMIN βλέπει markup, ADMIN μόνο το τελικό κόστος)' },
    ] },
    { key: 'settings', href: '/settings', label: 'Ρυθμίσεις', icon: Settings, menuPermission: 'settings.manage', core: true, permissions: [
      { key: 'settings.manage', description: 'Ρυθμίσεις συστήματος' },
      { key: 'sync.run', description: 'Εκτέλεση sync με SoftOne' },
    ] },
    { key: 'form-guides', href: '/tax-templates', label: 'Οδηγοί Εντύπων', icon: FileText, menuPermission: 'taxform.manage', permissions: [
      { key: 'taxform.manage', description: 'Διαχείριση οδηγών εντύπων' },
      { key: 'taxform.scan', description: 'Σάρωση OCR εντύπων σε συναλλασσόμενο' },
    ] },
    { key: 'programs', href: '/programs', label: 'Προγράμματα', icon: Landmark, menuPermission: 'programs.manage', permissions: [
      { key: 'programs.manage', description: 'Διαχείριση προγραμμάτων & δαπανών' },
    ] },
  ] },
]

export function allItems(): ObjectItem[] {
  return OBJECT_REGISTRY.flatMap(m => m.items)
}

export function coreItemKeys(): string[] {
  return allItems().filter(i => i.core).map(i => i.key)
}

export function itemByKey(key: string): ObjectItem | undefined {
  return allItems().find(i => i.key === key)
}

/** Effective enabled item keys = (stored ∩ known) ∪ core. */
export function effectiveEnabledKeys(stored: string[]): Set<string> {
  const known = new Set(allItems().map(i => i.key))
  const eff = new Set(stored.filter(k => known.has(k)))
  for (const k of coreItemKeys()) eff.add(k)
  return eff
}

export type NavModule = { group: string; items: { href: string; label: string; icon: LucideIcon }[] }

/** Sidebar nav: modules→items filtered by (enabled OR core) AND permission; empty modules dropped. */
export function buildNav(effective: Set<string>, permissions: string[]): NavModule[] {
  return OBJECT_REGISTRY.map(m => ({
    group: m.label,
    items: m.items
      .filter(i => (i.core || effective.has(i.key)) && (i.menuPermission === null || permissions.includes(i.menuPermission)))
      .map(i => ({ href: i.href, label: i.label, icon: i.icon })),
  })).filter(m => m.items.length > 0)
}

export type PermGroup = { label: string; items: PermissionDef[] }

/** Roles-matrix groups: one per module, containing owned permissions of enabled (or core) items only. */
export function groupedPermissionsFor(effective: Set<string>): PermGroup[] {
  return OBJECT_REGISTRY.map(m => ({
    label: m.label,
    items: m.items
      .filter(i => i.core || effective.has(i.key))
      .flatMap(i => i.permissions),
  })).filter(g => g.items.length > 0)
}
