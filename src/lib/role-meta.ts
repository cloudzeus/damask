/**
 * Οπτικά μεταδεδομένα ρόλων — χρωματική κουκκίδα + σύντομη περιγραφή.
 * Χρησιμοποιείται στα role-pills (/users) και στις role-cards (/roles).
 */
export const ROLE_COLOR_VAR: Record<string, string> = {
  ADMIN: 'var(--coral)',
  PURCHASING: 'var(--info)',
  PRODUCT_MANAGER: 'var(--info)',
  SALES: 'var(--success)',
  ARCHITECT: 'var(--success)',
  CUSTOMER: 'var(--warning)',
}

export function roleColorVar(roleName: string): string {
  return ROLE_COLOR_VAR[roleName] ?? 'var(--muted-foreground)'
}

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  ADMIN: 'Πλήρης πρόσβαση',
  PURCHASING: 'Αγορές & containers',
  PRODUCT_MANAGER: 'Προϊόντα & media',
  SALES: 'Πωλήσεις & εγκρίσεις',
  ARCHITECT: 'B2B συνεργάτες',
  CUSTOMER: 'B2B πελάτες',
}
