const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'SALESMAN'])
const B2B_ROLES = new Set(['ARCHITECT', 'CUSTOMER', 'SUPPLIER'])

/** Καθορίζει πού πρέπει να προωθηθεί ένας χρήστης μετά τη σύνδεση, βάσει ρόλου. */
export function roleHome(role: string): string {
  if (INTERNAL_ROLES.has(role)) return '/dashboard'
  if (B2B_ROLES.has(role)) return '/portal'
  return '/login'
}
