/**
 * Ο «Κύκλος εργασιών ΦΠΑ (κωδ. 312)» του Οδηγού Φ2 τροφοδοτεί τον τζίρο εταιρίας (σύνολο πλήρους έτους, όταν είναι
 * νεότερο από Ε3/ΜΜΕ) + αναδρομικός υπολογισμός για όσους έχουν ήδη Φ2. Ασφαλές να ξανατρέξει.
 */
import { prisma } from '@/lib/prisma'
import { rollupSeriesToCompany } from '@/lib/tax/template-auto'

async function main() {
  const f = await prisma.taxFormTemplateField.updateMany({ where: { fieldKey: 'kyklos_ergasion_fpa_kod_312', target: null, template: { documentType: { seriesKind: 'MONTHLY' } } }, data: { target: 'trdr.appAnnualRevenue' } })
  console.log('πεδία με προορισμό:', f.count)
  const tpls = await prisma.taxFormTemplate.findMany({ where: { documentType: { seriesKind: { in: ['MONTHLY', 'QUARTERLY'] } }, fields: { some: { target: 'trdr.appAnnualRevenue' } } }, select: { id: true, name: true } })
  for (const t of tpls) {
    const trdrs = await prisma.trdrFormRecord.findMany({ where: { templateId: t.id }, distinct: ['trdrId'], select: { trdrId: true, trdr: { select: { NAME: true } } } })
    for (const r of trdrs) console.log(t.name, '·', r.trdr.NAME, '→', (await rollupSeriesToCompany(r.trdrId, t.id)) ?? 'χωρίς αλλαγή (όχι νεότερο πλήρες έτος)')
  }
  await prisma.$disconnect()
}
main()
