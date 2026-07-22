// SERVER: writes an ExtractedProgram (AI extraction result) into the
// relational Program tables. Pure mapping lives in persist-map.ts (no prisma
// import there — kept unit-testable without a DB adapter); this file does
// the actual prisma.$transaction.

import { prisma } from '@/lib/prisma'
import type { ExtractedProgram } from '@/lib/programs/types'
import { toProgramScalars, toRelatedRows } from '@/lib/programs/persist-map'

export { parseIsoDate, toProgramScalars, toRelatedRows } from '@/lib/programs/persist-map'

/**
 * Αντικαθιστά ΟΛΑ τα related rows ενός Program με βάση το ExtractedProgram
 * (πλήρες overwrite — όχι merge). Καλείται μετά από (re-)extraction.
 * Σειρά διαγραφών: deliverables ΠΡΙΝ phases (FK deliverable.phaseId → phase.id).
 * Σειρά δημιουργιών: phases πρώτα, ώστε τα deliverables να συνδέσουν
 * phaseName → phaseId από τα μόλις-δημιουργημένα phases.
 */
export async function persistExtractedProgram(programId: string, e: ExtractedProgram): Promise<void> {
  const scalars = toProgramScalars(e)
  const rows = toRelatedRows(e)

  await prisma.$transaction(async tx => {
    await tx.program.update({
      where: { id: programId },
      data: { ...scalars, extractStatus: 'DONE' },
    })

    // Delete existing related rows — deliverables BEFORE phases (FK).
    await tx.programDeliverable.deleteMany({ where: { programId } })
    await tx.programExpenseCategory.deleteMany({ where: { programId } })
    await tx.programKad.deleteMany({ where: { programId } })
    await tx.programBonus.deleteMany({ where: { programId } })
    await tx.programCriterion.deleteMany({ where: { programId } })
    await tx.programDeadline.deleteMany({ where: { programId } })
    await tx.programPhase.deleteMany({ where: { programId } })
    await tx.programRegion.deleteMany({ where: { programId } })
    await tx.programEligibleLegalForm.deleteMany({ where: { programId } })
    await tx.programRequiredForm.deleteMany({ where: { programId } })

    if (rows.expenseCats.length) {
      await tx.programExpenseCategory.createMany({
        data: rows.expenseCats.map(c => ({ ...c, programId })),
      })
    }
    if (rows.kads.length) {
      await tx.programKad.createMany({ data: rows.kads.map(k => ({ ...k, programId })) })
    }
    if (rows.bonuses.length) {
      await tx.programBonus.createMany({ data: rows.bonuses.map(b => ({ ...b, programId })) })
    }
    if (rows.criteria.length) {
      await tx.programCriterion.createMany({ data: rows.criteria.map(c => ({ ...c, programId })) })
    }
    if (rows.deadlines.length) {
      await tx.programDeadline.createMany({ data: rows.deadlines.map(d => ({ ...d, programId })) })
    }
    if (rows.regions.length) {
      await tx.programRegion.createMany({ data: rows.regions.map(r => ({ ...r, programId })) })
    }
    if (rows.legalForms.length) {
      await tx.programEligibleLegalForm.createMany({ data: rows.legalForms.map(f => ({ ...f, programId })) })
    }
    if (rows.requiredForms.length) {
      // NOTE: extraction never sets templateId — the user links a required
      // form to a «Οδηγός Εντύπου» (TaxFormTemplate) later via updateRequiredForm.
      await tx.programRequiredForm.createMany({ data: rows.requiredForms.map(r => ({ ...r, programId })) })
    }

    // Phases first, then deliverables resolve phaseName → phaseId.
    const phaseIdByName = new Map<string, string>()
    for (const p of rows.phases) {
      const created = await tx.programPhase.create({ data: { name: p.name, order: p.order, programId } })
      phaseIdByName.set(p.name, created.id)
    }
    if (rows.deliverables.length) {
      await tx.programDeliverable.createMany({
        data: rows.deliverables.map(d => ({
          name: d.name,
          description: d.description,
          mandatory: d.mandatory,
          order: d.order,
          programId,
          phaseId: d.phaseName ? (phaseIdByName.get(d.phaseName) ?? null) : null,
        })),
      })
    }
  })
}
