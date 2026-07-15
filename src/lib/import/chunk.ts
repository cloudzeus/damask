/**
 * Χωρίζει έναν πίνακα σε chunks σταθερού μεγέθους — χρησιμοποιείται από το Import
 * Engine (spec §11α) ώστε τα server actions validateImportChunk/executeImport να
 * δουλεύουν πάνω σε κομμάτια των 1000 γραμμών (Prisma query μεγέθη λογικά, request
 * payload μέσα στο serverActions.bodySizeLimit — βλ. next.config.ts).
 */
export function chunkArray<T>(items: readonly T[], size: number): T[][] {
  if (!Number.isInteger(size) || size <= 0) {
    throw new Error('Το μέγεθος chunk πρέπει να είναι θετικός ακέραιος.')
  }
  if (items.length === 0) return []
  const out: T[][] = []
  for (let i = 0; i < items.length; i += size) {
    out.push(items.slice(i, i + size))
  }
  return out
}
