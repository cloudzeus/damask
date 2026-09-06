import 'dotenv/config'
import { prisma } from '../src/lib/prisma'
import { ensureTrdrCdnFolder, ensureTrdrProgramFolder } from '../src/lib/trdr/cdn-folder'

/**
 * Backfill δομής φακέλων CDN (Bunny private):
 *   1. Για ΚΑΘΕ συναλλασσόμενο: ρίζα + documents/ + EuPrograms/ (idempotent).
 *   2. Για ΚΑΘΕ σύνδεση πελάτη↔προγράμματος (ProgramApplication): φάκελος
 *      EuPrograms/<κωδικός προγράμματος>/.
 * Idempotent — μπορεί να ξανατρέξει. Χρήση: npm run db:backfill-trdr-folders
 */
async function main() {
  // 1) Βασική δομή ανά συναλλασσόμενο (ΟΛΟΙ — ώστε να προστεθούν και τα νέα υποφάκελα).
  const trdrs = await prisma.trdr.findMany({ select: { id: true, NAME: true, AFM: true }, orderBy: { createdAt: 'asc' } })
  console.log(`[1/2] Δομή φακέλων για ${trdrs.length} συναλλασσόμενους…`)
  let ok = 0, failed = 0
  for (let i = 0; i < trdrs.length; i++) {
    const path = await ensureTrdrCdnFolder(trdrs[i].id)
    if (path) { ok++; if (ok % 50 === 0 || i === trdrs.length - 1) console.log(`  ${ok}/${trdrs.length} …`) }
    else { failed++; console.warn(`  ✗ ${trdrs[i].NAME} (${trdrs[i].AFM ?? 'χωρίς ΑΦΜ'})`) }
    await new Promise(r => setTimeout(r, 40))
  }
  console.log(`  → ${ok} ρίζες OK, ${failed} απέτυχαν.`)

  // 2) Φάκελος προγράμματος ανά σύνδεση πελάτη↔προγράμματος.
  const apps = await prisma.programApplication.findMany({ select: { id: true, trdrId: true, programId: true }, orderBy: { createdAt: 'asc' } })
  console.log(`[2/2] Φάκελοι προγραμμάτων για ${apps.length} συνδέσεις…`)
  let pok = 0, pfail = 0
  for (let i = 0; i < apps.length; i++) {
    const path = await ensureTrdrProgramFolder(apps[i].trdrId, apps[i].programId)
    if (path) { pok++; if (pok % 25 === 0 || i === apps.length - 1) console.log(`  ${pok}/${apps.length} … (${path})`) }
    else pfail++
    await new Promise(r => setTimeout(r, 40))
  }
  console.log(`  → ${pok} φάκελοι προγραμμάτων OK, ${pfail} απέτυχαν.`)

  console.log(`Ολοκληρώθηκε. Αν υπάρχουν αποτυχίες, έλεγξε ότι το Bunny έχει ρυθμιστεί (Ρυθμίσεις → BunnyCDN).`)
}

main()
  .catch(e => { console.error('backfill απέτυχε:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
