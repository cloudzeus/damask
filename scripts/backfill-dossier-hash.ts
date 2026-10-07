/**
 * Μία φορά (C3): υπολογίζει SHA-256 για τα ήδη ανεβασμένα δικαιολογητικά πελατών
 * (TrdrDossierDocument.contentHash = null) κατεβάζοντάς τα από το Bunny.
 *   node --env-file=.env --import tsx scripts/backfill-dossier-hash.ts [--dry]
 */
import crypto from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { bunnyDownload } from '../src/lib/bunny-storage'

async function main() {
  const dry = process.argv.includes('--dry')
  const rows = await prisma.trdrDossierDocument.findMany({ where: { contentHash: null }, select: { id: true, storageKey: true } })
  console.log(`${rows.length} δικαιολογητικά χωρίς hash${dry ? ' (dry run)' : ''}`)
  let ok = 0, failed = 0
  for (const r of rows) {
    if (dry) continue
    try {
      const buf = await bunnyDownload(r.storageKey)
      await prisma.trdrDossierDocument.update({ where: { id: r.id }, data: { contentHash: crypto.createHash('sha256').update(buf).digest('hex') } })
      ok++
    } catch (err) {
      failed++
      console.warn(`✗ ${r.id}: ${err instanceof Error ? err.message : err}`)
    }
  }
  console.log(`ok=${ok} failed=${failed}`)
  await prisma.$disconnect()
}
main()
