/**
 * Μέγιστο μέγεθος αρχείου για το Media Gallery (/api/media/upload). Κοινό για
 * client (προ-έλεγχος πριν το upload) και server (413 με σαφές μήνυμα).
 * ⚠ Πρέπει να μένει ≤ experimental.proxyClientMaxBodySize στο next.config.ts —
 * το proxy κάνει buffer το body μέχρι εκείνο το όριο και πάνω από αυτό το κόβει
 * (τότε το formData() αποτυγχάνει).
 */
export const MEDIA_MAX_BYTES = 100 * 1024 * 1024 // 100 MB

export function formatMb(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(bytes < 10 * 1024 * 1024 ? 1 : 0)} MB`
}

export function tooLargeMessage(size: number | null): string {
  const max = formatMb(MEDIA_MAX_BYTES)
  return size != null
    ? `Το αρχείο είναι πολύ μεγάλο (${formatMb(size)}) — μέγιστο επιτρεπτό ${max}.`
    : `Το αρχείο είναι πολύ μεγάλο — μέγιστο επιτρεπτό ${max}.`
}
