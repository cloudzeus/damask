/**
 * Αναδρομικά: γεωκωδικοποίηση (όπου λείπουν συντεταγμένες) + περιφέρεια (όπου λείπει) για πελάτες/υποψήφιους, και
 * στο τέλος δυνητικά προγράμματα για ΟΛΟΥΣ. Ασφαλές να ξανατρέξει. `--dry` = μόνο μέτρηση.
 */
import { prisma } from '@/lib/prisma'
import { ensureTrdrGeocode, ensureTrdrRegion } from '@/lib/trdr/derive'
import { runPotentialMatching } from '@/lib/pm/potential-matching'

async function main() {
  const dry = process.argv.includes('--dry')
  const where = { SODTYPE: 13 }
  const [noRegion, noCoords] = await Promise.all([
    prisma.trdr.findMany({ where: { ...where, regionCode: null }, select: { id: true, NAME: true } }),
    prisma.trdr.count({ where: { ...where, OR: [{ appLat: null }, { appLng: null }], NOT: { AND: [{ ADDRESS: null }, { CITY: null }, { ZIP: null }] } } }),
  ])
  console.log(`χωρίς περιφέρεια: ${noRegion.length} · χωρίς συντεταγμένες (με διεύθυνση): ${noCoords}`)
  if (dry) return prisma.$disconnect()
  let regions = 0, coords = 0
  for (const t of noRegion) {
    if (await ensureTrdrGeocode(t.id)) coords++
    if (await ensureTrdrRegion(t.id)) regions++
    await new Promise(r => setTimeout(r, 1100)) // όριο γεωκωδικοποίησης ~1/δευτ.
  }
  console.log(`περιφέρεια βρέθηκε: ${regions}/${noRegion.length} · συντεταγμένες: ${coords}`)
  const m = await runPotentialMatching()
  console.log(`δυνητικά: ${m.matches} αντιστοιχίσεις (${m.restrictedMatches} με πραγματικό περιορισμό) σε ${m.customers} πελάτες × ${m.programs} προγράμματα`)
  for (const p of m.byProgram.sort((a, b) => b.matches - a.matches)) console.log(`  ${String(p.matches).padStart(4)}  ${p.title.slice(0, 90)}`)
  await prisma.$disconnect()
}
main()
