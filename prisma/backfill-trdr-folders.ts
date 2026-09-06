import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { ensureTrdrCdnFolder } from '../src/lib/trdr/cdn-folder'

/**
 * Backfill: δημιουργεί τον αυτόματο φάκελο CDN (Bunny private) για ΚΑΘΕ υπάρχοντα
 * συναλλασσόμενο που δεν έχει ήδη cdnFolder. Idempotent — μπορεί να ξανατρέξει.
 * Χρήση: npm run db:backfill-trdr-folders
 */
async function main() {
  const trdrs = await prisma.trdr.findMany({
    where: { cdnFolder: null },
    select: { id: true, NAME: true, AFM: true, SODTYPE: true },
    orderBy: { createdAt: 'asc' },
  })
  console.log(`Προς επεξεργασία: ${trdrs.length} συναλλασσόμενοι χωρίς φάκελο.`)

  let ok = 0
  let failed = 0
  for (let i = 0; i < trdrs.length; i++) {
    const t = trdrs[i]
    const path = await ensureTrdrCdnFolder(t.id)
    if (path) {
      ok++
      if (ok % 25 === 0 || i === trdrs.length - 1) console.log(`  ${ok}/${trdrs.length} … (τελευταίο: ${path})`)
    } else {
      failed++
      console.warn(`  ✗ απέτυχε: ${t.NAME} (${t.AFM ?? 'χωρίς ΑΦΜ'})`)
    }
    // Ήπιο throttle ώστε να μη «πλημμυρίσει» το Bunny storage API.
    await new Promise(r => setTimeout(r, 60))
  }

  console.log(`Ολοκληρώθηκε: ${ok} φάκελοι δημιουργήθηκαν, ${failed} απέτυχαν.`)
  if (failed > 0) console.log('Οι αποτυχίες συνήθως σημαίνουν ότι το Bunny δεν έχει ρυθμιστεί (Ρυθμίσεις → BunnyCDN).')
}

main()
  .catch(e => { console.error('backfill απέτυχε:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
