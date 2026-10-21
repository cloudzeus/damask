/**
 * Πλήρεις λίστες επιλέξιμων ΚΑΔ από το «Παράρτημα … Επιλέξιμοι (ΚΑΔ)» του αποθηκευμένου οδηγού (όλο το PDF) για τα
 * προγράμματα όπου η αποδελτίωση τις έκοψε. Αλλάζει ΜΟΝΟ τους ΚΑΔ (ProgramKad + extractedData.kads/kadRule) — όχι
 * άλλα στοιχεία (χειροκίνητες αλλαγές μένουν). Μετά: δυνητικά προγράμματα για όλους. `--dry` = μόνο αναφορά.
 */
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { kadAnnexForProgram } from '@/lib/programs/kad-extract'
import { runPotentialMatching } from '@/lib/pm/potential-matching'

async function main() {
  const dry = process.argv.includes('--dry')
  const ps = await prisma.program.findMany({ where: { status: { not: 'CLOSED' } }, select: { id: true, title: true, extractedData: true, _count: { select: { kads: true } } } })
  let changed = 0
  for (const p of ps) {
    const annex = await kadAnnexForProgram(p.id)
    if (!annex || annex.length <= p._count.kads) continue
    console.log(`${p._count.kads} → ${annex.length} · ${p.title.slice(0, 80)}`)
    if (dry) continue
    await prisma.$transaction([
      prisma.programKad.deleteMany({ where: { programId: p.id } }),
      prisma.programKad.createMany({ data: annex.map(k => ({ programId: p.id, code: k.code, description: k.description })) }),
      prisma.program.update({ where: { id: p.id }, data: { extractedData: { ...((p.extractedData ?? {}) as object), kads: annex, kadRule: 'ONLY_LISTED' } as Prisma.InputJsonValue } }),
    ])
    changed++
  }
  if (changed) {
    const m = await runPotentialMatching()
    console.log(`δυνητικά: ${m.matches} (${m.restrictedMatches} με περιορισμό) σε ${m.customers} πελάτες`)
    for (const b of m.byProgram.filter(x => ps.some(p => p.id === x.programId))) console.log(`  ${String(b.matches).padStart(4)} · ${b.title.slice(0, 80)}`)
  }
  await prisma.$disconnect()
}
main()
