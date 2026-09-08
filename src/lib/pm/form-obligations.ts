import { prisma } from '@/lib/prisma'

/**
 * Διάδοση «Εντύπων που χρειάζονται» (ProgramRequiredForm) → εκκρεμότητες
 * (ApplicationObligation kind=FORM) σε ΟΛΕΣ τις εταιρίες που έχουν ενταχθεί στο
 * πρόγραμμα (ProgramApplication). Έτσι, όταν ο διαχειριστής βάλει υποχρεωτικό ένα
 * δικαιολογητικό, δημιουργείται εκκρεμότητα σε κάθε εταιρία του προγράμματος.
 * Plain module — καλείται από τα 'use server' actions (μετά τον permission gate).
 */

/** Δημιουργεί εκκρεμότητα FORM για κάθε application του προγράμματος που δεν την έχει.
 * Αν το form ΔΕΝ είναι mandatory, καθαρίζει τις PENDING εκκρεμότητές του. */
export async function propagateRequiredFormObligation(formId: string): Promise<{ created: number }> {
  const form = await prisma.programRequiredForm.findUnique({
    where: { id: formId },
    select: { id: true, programId: true, name: true, mandatory: true, order: true },
  })
  if (!form) return { created: 0 }

  if (!form.mandatory) {
    // Έγινε προαιρετικό → αφαίρεσε τις ΑΝΟΙΧΤΕΣ (μη υποβληθείσες) εκκρεμότητες.
    await prisma.applicationObligation.deleteMany({
      where: { kind: 'FORM', sourceId: form.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    })
    return { created: 0 }
  }

  const apps = await prisma.programApplication.findMany({ where: { programId: form.programId }, select: { id: true } })
  if (apps.length === 0) return { created: 0 }
  const appIds = apps.map(a => a.id)

  const existing = await prisma.applicationObligation.findMany({
    where: { applicationId: { in: appIds }, kind: 'FORM', sourceId: form.id },
    select: { applicationId: true, id: true },
  })
  const has = new Set(existing.map(e => e.applicationId))

  // Ενημέρωσε το όνομα σε τυχόν υπάρχουσες (rename εντύπου).
  if (existing.length) {
    await prisma.applicationObligation.updateMany({
      where: { id: { in: existing.map(e => e.id) } },
      data: { name: form.name },
    })
  }

  const toCreate = appIds
    .filter(id => !has.has(id))
    .map(applicationId => ({
      applicationId,
      stage: 'DOCUMENTS' as const,
      kind: 'FORM' as const,
      sourceId: form.id,
      name: form.name,
      mandatory: true,
      status: 'PENDING' as const,
      order: form.order,
    }))
  if (toCreate.length) await prisma.applicationObligation.createMany({ data: toCreate })
  return { created: toCreate.length }
}

/** Αφαίρεση εκκρεμοτήτων FORM ενός εντύπου (κατά τη διαγραφή του) — κρατά τις
 * υποβληθείσες/εγκεκριμένες για ιστορικό, σβήνει μόνο τις ανοιχτές. */
export async function removeFormObligations(formId: string): Promise<void> {
  await prisma.applicationObligation.deleteMany({
    where: { kind: 'FORM', sourceId: formId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
  })
}

/** Seed εκκρεμοτήτων FORM για ΕΝΑ application (π.χ. όταν εντάσσεται νέα εταιρία)
 * βάσει όλων των υποχρεωτικών εντύπων του προγράμματος. */
export async function seedFormObligationsForApplication(applicationId: string, programId: string): Promise<{ created: number }> {
  const forms = await prisma.programRequiredForm.findMany({
    where: { programId, mandatory: true },
    select: { id: true, name: true, order: true },
  })
  if (forms.length === 0) return { created: 0 }
  const existing = await prisma.applicationObligation.findMany({
    where: { applicationId, kind: 'FORM' },
    select: { sourceId: true },
  })
  const has = new Set(existing.map(e => e.sourceId))
  const toCreate = forms
    .filter(f => !has.has(f.id))
    .map(f => ({
      applicationId,
      stage: 'DOCUMENTS' as const,
      kind: 'FORM' as const,
      sourceId: f.id,
      name: f.name,
      mandatory: true,
      status: 'PENDING' as const,
      order: f.order,
    }))
  if (toCreate.length) await prisma.applicationObligation.createMany({ data: toCreate })
  return { created: toCreate.length }
}
