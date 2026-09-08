import { prisma } from '@/lib/prisma'
import { createNotification } from '@/lib/notifications/service'

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
    select: { id: true, programId: true, name: true, mandatory: true, order: true, program: { select: { title: true } } },
  })
  if (!form) return { created: 0 }

  if (!form.mandatory) {
    // Έγινε προαιρετικό → αφαίρεσε τις ΑΝΟΙΧΤΕΣ (μη υποβληθείσες) εκκρεμότητες.
    await prisma.applicationObligation.deleteMany({
      where: { kind: 'FORM', sourceId: form.id, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    })
    return { created: 0 }
  }

  const apps = await prisma.programApplication.findMany({
    where: { programId: form.programId },
    select: { id: true, trdrId: true, trdr: { select: { NAME: true } } },
  })
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

  const newApps = apps.filter(a => !has.has(a.id))
  const toCreate = newApps.map(a => ({
    applicationId: a.id,
    stage: 'DOCUMENTS' as const,
    kind: 'FORM' as const,
    sourceId: form.id,
    name: form.name,
    mandatory: true,
    status: 'PENDING' as const,
    order: form.order,
  }))
  if (toCreate.length) {
    await prisma.applicationObligation.createMany({ data: toCreate })
    // Ειδοποίηση ανά εταιρία που απέκτησε νέα εκκρεμότητα — εμφανίζεται στο
    // dashboard feed «Ειδοποιήσεις» και είναι clickable στην καρτέλα της (Trdr).
    for (const a of newApps) {
      await createNotification({
        title: `Νέο δικαιολογητικό: ${form.name}`,
        body: `${a.trdr?.NAME ?? 'Εταιρία'} — ${form.program?.title ?? 'πρόγραμμα'}. Δημιουργήθηκε εκκρεμότητα υποβολής.`,
        entityType: 'Trdr',
        entityId: a.trdrId,
        meta: { programId: form.programId, formId: form.id },
      })
    }
  }
  return { created: toCreate.length }
}

/** Αφαίρεση εκκρεμοτήτων FORM ενός εντύπου (κατά τη διαγραφή του) — κρατά τις
 * υποβληθείσες/εγκεκριμένες για ιστορικό, σβήνει μόνο τις ανοιχτές. */
export async function removeFormObligations(formId: string): Promise<void> {
  await prisma.applicationObligation.deleteMany({
    where: { kind: 'FORM', sourceId: formId, status: { in: ['PENDING', 'IN_PROGRESS'] } },
  })
}

/**
 * Seed εκκρεμοτήτων FORM για ΕΝΑ application (όταν εντάσσεται νέα εταιρία) βάσει
 * όλων των υποχρεωτικών εντύπων του προγράμματος. ΑΝΑΓΝΩΡΙΣΗ: αν ο πελάτης έχει
 * ήδη υποβάλει/εγκρίνει έγγραφο ΙΔΙΟΥ τύπου (ίδιο templateId) σε άλλο πρόγραμμα,
 * η νέα εκκρεμότητα δημιουργείται ως «υποβληθείσα» (status SUBMITTED) με αντίγραφο
 * αναφοράς του εγγράφου — ώστε ο διαχειριστής να το ελέγξει/εγκρίνει/απορρίψει
 * αντί να το ξαναζητήσει.
 */
export async function seedFormObligationsForApplication(applicationId: string, programId: string): Promise<{ created: number; recognized: number }> {
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { trdrId: true } })
  if (!app) return { created: 0, recognized: 0 }

  const forms = await prisma.programRequiredForm.findMany({
    where: { programId, mandatory: true },
    select: { id: true, name: true, order: true, templateId: true, documentTypeId: true },
  })
  if (forms.length === 0) return { created: 0, recognized: 0 }

  const existing = await prisma.applicationObligation.findMany({ where: { applicationId, kind: 'FORM' }, select: { sourceId: true } })
  const has = new Set(existing.map(e => e.sourceId))
  const pending = forms.filter(f => !has.has(f.id))

  // Matching με την ΑΠΟΘΗΚΗ του πελάτη (TrdrDossierDocument): αν η εταιρία έχει
  // ήδη έγγραφο ίδιου τύπου ΣΕ ΙΣΧΥ (μη ληγμένο) → δεν το ξαναζητάμε.
  const now = Date.now()
  const dossierTypeIds = [...new Set(pending.map(f => f.documentTypeId).filter((t): t is string => !!t))]
  const dossierByType = new Map<string, { name: string; storageKey: string; mimeType: string | null; sizeBytes: number | null; expiresAt: Date | null }>()
  if (dossierTypeIds.length) {
    const dossierDocs = await prisma.trdrDossierDocument.findMany({
      where: { trdrId: app.trdrId, documentTypeId: { in: dossierTypeIds } },
      orderBy: { createdAt: 'desc' },
      select: { documentTypeId: true, name: true, storageKey: true, mimeType: true, sizeBytes: true, expiresAt: true },
    })
    for (const d of dossierDocs) {
      const valid = !d.expiresAt || d.expiresAt.getTime() > now
      if (valid && !dossierByType.has(d.documentTypeId)) {
        dossierByType.set(d.documentTypeId, { name: d.name, storageKey: d.storageKey, mimeType: d.mimeType, sizeBytes: d.sizeBytes, expiresAt: d.expiresAt })
      }
    }
  }
  const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

  // Αναγνώριση εγγράφων ίδιου τύπου (templateId) από ΑΛΛΑ έργα του ΙΔΙΟΥ πελάτη.
  const templateIds = [...new Set(pending.map(f => f.templateId).filter((t): t is string => !!t))]
  const recognizedByTemplate = new Map<string, { name: string; storageKey: string; mimeType: string | null; size: number | null }>()
  if (templateIds.length) {
    const docs = await prisma.applicationDocument.findMany({
      where: {
        application: { trdrId: app.trdrId, id: { not: applicationId } },
        obligation: { kind: 'FORM', sourceId: { in: (await prisma.programRequiredForm.findMany({ where: { templateId: { in: templateIds } }, select: { id: true } })).map(r => r.id) } },
      },
      orderBy: { uploadedAt: 'desc' },
      select: { name: true, storageKey: true, mimeType: true, size: true, obligation: { select: { sourceId: true } } },
    })
    // map sourceId(form) → templateId
    const formTpl = new Map<string, string>((await prisma.programRequiredForm.findMany({ where: { templateId: { in: templateIds } }, select: { id: true, templateId: true } })).map(r => [r.id, r.templateId as string] as [string, string]))
    for (const d of docs) {
      const sid = d.obligation?.sourceId
      const tpl = sid ? formTpl.get(sid) : undefined
      if (tpl && !recognizedByTemplate.has(tpl)) recognizedByTemplate.set(tpl, { name: d.name, storageKey: d.storageKey, mimeType: d.mimeType, size: d.size })
    }
  }

  let created = 0
  let recognized = 0
  for (const f of pending) {
    // Προτεραιότητα 1: αποθήκη πελάτη (valid έγγραφο ίδιου τύπου).
    const fromDossier = f.documentTypeId ? dossierByType.get(f.documentTypeId) : undefined
    // Προτεραιότητα 2: αναγνώριση από άλλο πρόγραμμα (templateId).
    const match = fromDossier ?? (f.templateId ? recognizedByTemplate.get(f.templateId) : undefined)
    if (match) {
      const validNote = fromDossier
        ? `Υπάρχει ήδη στην αποθήκη της εταιρίας${fromDossier.expiresAt ? ` (σε ισχύ έως ${dateFmt.format(fromDossier.expiresAt)})` : ''} — έλεγξε & ενέκρινε.`
        : 'Αναγνωρίστηκε από άλλο πρόγραμμα — έλεγξε & ενέκρινε ή απόρριψε.'
      const size = fromDossier ? fromDossier.sizeBytes : (match as { size: number | null }).size
      await prisma.applicationObligation.create({
        data: {
          applicationId, stage: 'DOCUMENTS', kind: 'FORM', sourceId: f.id, name: f.name,
          mandatory: true, status: 'SUBMITTED', order: f.order,
          notes: validNote,
          documents: { create: { applicationId, name: match.name, storageKey: match.storageKey, mimeType: match.mimeType, size, expiresAt: fromDossier?.expiresAt ?? null } },
        },
      })
      recognized++
    } else {
      await prisma.applicationObligation.create({
        data: { applicationId, stage: 'DOCUMENTS', kind: 'FORM', sourceId: f.id, name: f.name, mandatory: true, status: 'PENDING', order: f.order },
      })
    }
    created++
  }
  return { created, recognized }
}
