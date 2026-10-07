/**
 * Μία φορά: (1) ονομασίες ΔΟΥ στο DoyRegistry για κάθε κωδικό Trdr.IRSDATA που δεν
 * έχει όνομα (ένα lookup ΑΑΔΕ ανά κωδικό, με τον ΑΦΜ ενός πελάτη που τον έχει)·
 * (2) Χώρα = Ελλάδα όπου λείπει και οι συντεταγμένες είναι μέσα στην Ελλάδα.
 *   node --env-file=.env --import tsx scripts/backfill-doy-country.ts [--dry]
 */
import { prisma } from '../src/lib/prisma'
import { aadeLookup } from '../src/lib/aade'
import { isInGreece, greeceCountryId } from '../src/lib/trdr/country'

async function main() {
  const dry = process.argv.includes('--dry')

  // (1) ΔΟΥ
  const groups = await prisma.trdr.groupBy({ by: ['IRSDATA'], where: { IRSDATA: { not: null } } })
  const codes = groups.map(g => g.IRSDATA!).filter(Boolean)
  const [s1, reg] = await Promise.all([
    prisma.irsdata.findMany({ where: { CODE: { in: codes } }, select: { CODE: true } }),
    prisma.doyRegistry.findMany({ where: { code: { in: codes } }, select: { code: true } }),
  ])
  const known = new Set([...s1.map(r => r.CODE), ...reg.map(r => r.code)])
  const missing = codes.filter(c => !known.has(c))
  console.log(`ΔΟΥ: ${codes.length} κωδικοί, ${missing.length} χωρίς όνομα`)
  let named = 0
  for (const code of missing) {
    const sample = await prisma.trdr.findFirst({ where: { IRSDATA: code, AFM: { not: null } }, select: { AFM: true } })
    if (!sample?.AFM || dry) continue
    try {
      const c = await aadeLookup(sample.AFM)
      if (c?.doy && (c.doyCode === code || !c.doyCode)) {
        await prisma.doyRegistry.upsert({ where: { code }, create: { code, name: c.doy }, update: { name: c.doy } })
        named++
      }
    } catch (err) {
      console.warn(`✗ ${code}: ${err instanceof Error ? err.message : err}`)
    }
    await new Promise(r => setTimeout(r, 400))
  }
  console.log(`ΔΟΥ: ονομάστηκαν ${named}`)

  // (2) Χώρα
  const gr = await greeceCountryId()
  const rows = await prisma.trdr.findMany({ where: { COUNTRY: null, appLat: { not: null }, appLng: { not: null } }, select: { id: true, appLat: true, appLng: true } })
  const inGr = rows.filter(r => isInGreece(r.appLat, r.appLng)).map(r => r.id)
  console.log(`Χώρα: ${rows.length} με συντεταγμένες χωρίς χώρα, ${inGr.length} μέσα στην Ελλάδα`)
  if (!dry && gr != null && inGr.length) {
    const res = await prisma.trdr.updateMany({ where: { id: { in: inGr }, COUNTRY: null }, data: { COUNTRY: gr } })
    console.log(`Χώρα: ενημερώθηκαν ${res.count}`)
  }
  // (3) Χώρα από ΔΟΥ: εγγεγραμμένη σε ελληνική ΔΟΥ ⇒ Ελλάδα (όσοι δεν έχουν συντεταγμένες).
  if (gr != null) {
    const n = await prisma.trdr.count({ where: { COUNTRY: null, IRSDATA: { not: null } } })
    console.log(`Χώρα από ΔΟΥ: ${n} χωρίς χώρα με ελληνική ΔΟΥ`)
    if (!dry && n) {
      const res = await prisma.trdr.updateMany({ where: { COUNTRY: null, IRSDATA: { not: null } }, data: { COUNTRY: gr } })
      console.log(`Χώρα από ΔΟΥ: ενημερώθηκαν ${res.count}`)
    }
  }
  await prisma.$disconnect()
}
main()
