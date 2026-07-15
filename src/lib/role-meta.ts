/**
 * Οπτικά μεταδεδομένα ρόλων — χρωματική κουκκίδα + σύντομη περιγραφή.
 * Χρησιμοποιείται στα role-pills (/users) και στις role-cards (/roles).
 */
export const ROLE_COLOR_VAR: Record<string, string> = {
  SUPER_ADMIN: 'var(--coral)',
  ADMIN: 'var(--coral-light)',
  MANAGER: 'var(--info)',
  EMPLOYEE: 'var(--info-light)',
  SALESMAN: 'var(--success)',
  ARCHITECT: 'var(--success)',
  CUSTOMER: 'var(--warning)',
  SUPPLIER: 'var(--warning)',
}

export function roleColorVar(roleName: string): string {
  return ROLE_COLOR_VAR[roleName] ?? 'var(--muted-foreground)'
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  SUPER_ADMIN: 'Πλήρης πρόσβαση',
  ADMIN: 'Διαχείριση',
  MANAGER: 'Διευθυντής',
  EMPLOYEE: 'Υπάλληλος',
  SALESMAN: 'Πωλητής',
  ARCHITECT: 'Αρχιτέκτονας',
  CUSTOMER: 'Πελάτης B2B',
  SUPPLIER: 'Προμηθευτής',
}
