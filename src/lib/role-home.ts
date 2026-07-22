const INTERNAL_ROLES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'SALESMAN'])
const B2B_ROLES = new Set(['ARCHITECT', 'CUSTOMER', 'SUPPLIER'])

/**
 * Πού προωθείται ένας χρήστης μετά τη σύνδεση. Όταν το `b2b` flag είναι γνωστό
 * (από τη session — δουλεύει και για custom ρόλους) το χρησιμοποιούμε άμεσα·
 * αλλιώς fallback στα γνωστά ονόματα των βασικών ρόλων.
 */
export function roleHome(role: string, b2b?: boolean): string {
  if (b2b === true) return '/portal'
  if (b2b === false) return '/dashboard'
  if (INTERNAL_ROLES.has(role)) return '/dashboard'
  if (B2B_ROLES.has(role)) return '/portal'
  return '/login'
}
