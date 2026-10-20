/**
 * Αναδρομικά για ΟΛΟΥΣ τους πελάτες/υποψήφιους που δεν πέρασαν ποτέ από ΑΑΔΕ/ΓΕΜΗ: ΑΑΔΕ + ΚΑΔ + ΓΕΜΗ (χωρίς έγγραφα)
 * + γεωκωδικοποίηση + περιφέρεια, και στο τέλος δυνητικά προγράμματα για όλους. Συνεχίζει από όπου σταμάτησε
 * (επιλέγει μόνο όσους λείπουν ακόμη). Ρυθμός ~1 πελάτης/2 δευτ. (όρια ΑΑΔΕ/ΓΕΜΗ/γεωκωδικοποίησης).
 */
import { prisma } from '@/lib/prisma'
import { ensureTrdrRegistries, ensureTrdrGeocode, ensureTrdrRegion } from '@/lib/trdr/derive'
import { runPotentialMatching } from '@/lib/pm/potential-matching'

async function main() {
  const rows = await prisma.trdr.findMany({
    where: { SODTYPE: 13, AFM: { not: null }, OR: [{ aadeSyncedAt: null }, { gemiSyncedAt: null }] },
    select: { id: true, NAME: true }, orderBy: { createdAt: 'desc' },
  })
  console.log(`[start] ${new Date().toISOString()} · πελάτες: ${rows.length}`)
  const t = { aade: 0, gemi: 0, geo: 0, region: 0, errors: 0 }
  for (const [i, r] of rows.entries()) {
    try {
      const reg = await ensureTrdrRegistries(r.id)
      if (reg.aade) t.aade++
      if (reg.gemi) t.gemi++
      if (await ensureTrdrGeocode(r.id)) t.geo++
      if (await ensureTrdrRegion(r.id)) t.region++
    } catch (err) { t.errors++; console.log(`[err] ${r.NAME}: ${err instanceof Error ? err.message.slice(0, 120) : err}`) }
    if ((i + 1) % 25 === 0) console.log(`[${i + 1}/${rows.length}] ΑΑΔΕ ${t.aade} · ΓΕΜΗ ${t.gemi} · συντεταγμένες ${t.geo} · περιφέρεια ${t.region} · σφάλματα ${t.errors}`)
    await new Promise(res => setTimeout(res, 1500))
  }
  console.log(`[done] ΑΑΔΕ ${t.aade} · ΓΕΜΗ ${t.gemi} · συντεταγμένες ${t.geo} · περιφέρεια ${t.region} · σφάλματα ${t.errors}`)
  const m = await runPotentialMatching()
  console.log(`[potential] ${m.matches} αντιστοιχίσεις (${m.restrictedMatches} με περιορισμό) σε ${m.customers} ενεργούς πελάτες`)
  await prisma.$disconnect()
}
main()
