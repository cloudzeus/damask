import type { NotificationRow } from './service'

/**
 * Κοινό mapping ειδοποίησης → διαδρομή & actionable κουμπιά. Χρησιμοποιείται ΚΑΙ
 * από το dashboard ΚΑΙ από την καμπάνα (notifications-bell) ώστε η λογική να
 * είναι μία. Οι ειδοποιήσεις κουβαλούν type/entityType/meta — από αυτά βγάζουμε
 * (α) πού πηγαίνει το «Άνοιγμα» και (β) ποια κουμπιά ενεργειών να δείξουμε.
 */

export type NotifAction = { label: string; href: string; kind: 'primary' | 'ghost' }

function metaOf(n: NotificationRow): Record<string, unknown> {
  return n.meta && typeof n.meta === 'object' ? (n.meta as Record<string, unknown>) : {}
}
const str = (m: Record<string, unknown>, k: string) => (typeof m[k] === 'string' ? (m[k] as string) : undefined)

/** Best-effort «Άνοιγμα» URL μιας ειδοποίησης (ή null αν δεν προκύπτει). */
export function notifTarget(n: NotificationRow): string | null {
  const m = metaOf(n)
  const appId = str(m, 'applicationId'), programId = str(m, 'programId'), trdrId = str(m, 'trdrId')
  if (n.entityType === 'Trdr' && (trdrId || n.entityId)) return `/partners/${trdrId || n.entityId}`
  if (n.entityType === 'Lead' || n.type === 'PUBLIC_LEAD' || n.entityType === 'PublicLeadRequest') return '/leads'
  if ((n.entityType === 'FileRequest' || n.entityType === 'FileRequestItem') && appId && programId) return `/programs/${programId}/applications/${appId}?tab=filereq`
  if (n.entityType === 'ProgramApplication' && appId && programId) return `/programs/${programId}/applications/${appId}`
  if (n.entityType === 'EmailThread' && trdrId) return `/partners/${trdrId}`
  if (appId && programId) return `/programs/${programId}/applications/${appId}`
  if (trdrId) return `/partners/${trdrId}`
  return null
}

/** Actionable κουμπιά ανά ειδοποίηση — πρωτεύουσα ενέργεια με ρήμα (Επικοινωνία /
 * Δες δικαιολογητικά / Καρτέλα πελάτη …) ώστε ο χρήστης να δρα επιτόπου, χωρίς
 * να ψάχνει πού να πάει. Επιστρέφει [] όταν δεν προκύπτει ασφαλής διαδρομή. */
export function notifActions(n: NotificationRow): NotifAction[] {
  const m = metaOf(n)
  const appId = str(m, 'applicationId'), programId = str(m, 'programId'), trdrId = str(m, 'trdrId')

  if (n.entityType === 'Lead' || n.type === 'PUBLIC_LEAD' || n.entityType === 'PublicLeadRequest') {
    return [{ label: 'Επικοινωνία', href: '/leads', kind: 'primary' }]
  }
  if (n.entityType === 'EmailThread' && trdrId) {
    return [{ label: 'Άνοιγμα επικοινωνίας', href: `/partners/${trdrId}`, kind: 'primary' }]
  }
  if (n.entityType === 'Trdr' && (trdrId || n.entityId)) {
    return [{ label: 'Καρτέλα πελάτη', href: `/partners/${trdrId || n.entityId}`, kind: 'primary' }]
  }
  if ((n.entityType === 'FileRequestItem' || n.entityType === 'FileRequest') && appId && programId) {
    return [{ label: 'Δες δικαιολογητικά', href: `/programs/${programId}/applications/${appId}?tab=filereq`, kind: 'primary' }]
  }
  if (n.entityType === 'ProgramApplication' && appId && programId) {
    return [{ label: 'Δες έργο', href: `/programs/${programId}/applications/${appId}`, kind: 'primary' }]
  }
  const t = notifTarget(n)
  return t ? [{ label: 'Άνοιγμα', href: t, kind: 'primary' }] : []
}
