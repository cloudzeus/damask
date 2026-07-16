/** Μορφοποίηση ποσών/tokens για τη σελίδα /costs — τα AI costs είναι συχνά κλάσματα του λεπτού, γι' αυτό έως 4 δεκαδικά (όχι τα συνηθισμένα 2 του formatEuro). */
export function formatEur(value: number): string {
  return value.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', minimumFractionDigits: 2, maximumFractionDigits: 4 })
}

export function formatUsd(value: number): string {
  return `$${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })}`
}

export function formatTokens(value: number): string {
  return value.toLocaleString('el-GR')
}

export const SCOPE_LABELS: Record<string, string> = {
  OCR_TEXT: 'OCR (κείμενο)',
  OCR_VISION: 'OCR (εικόνα)',
  TRANSLATION: 'Μετάφραση',
  CMS_GENERATE: 'CMS δημιουργία',
  OTHER: 'Άλλο',
}

export function scopeLabel(scope: string): string {
  return SCOPE_LABELS[scope] ?? scope
}

export function formatDuration(ms: number | null): string {
  if (ms == null) return '—'
  if (ms < 1000) return `${ms}ms`
  return `${(ms / 1000).toFixed(1)}s`
}

/** Μονάδες υπηρεσιών API (emails/GB/συναλλαγές/…) — δεκαδικά μόνο για GB, ακέραιο αλλού. */
export function formatUnits(value: number, unitLabel: string): string {
  const decimals = unitLabel === 'GB' ? 2 : 0
  return `${value.toLocaleString('el-GR', { minimumFractionDigits: 0, maximumFractionDigits: decimals })} ${unitLabel}`
}
