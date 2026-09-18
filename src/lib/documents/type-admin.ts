'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'

/**
 * Διαχείριση **τύπων δικαιολογητικών** (DocumentType) — standalone admin
 * (/document-types, perm `doctype.manage`). Ο τύπος «δένει» πρόγραμμα ↔ αποθήκη
 * πελάτη ↔ αποδελτίωση, ορίζει αν έχει ημ. λήξης, και συνδέεται με έναν ή
 * περισσότερους **Οδηγούς Εντύπων** (TaxFormTemplate) — τα πεδία/περιοχές που
 * σαρώνονται για εξαγωγή τιμών. Μέχρι τώρα οι τύποι δημιουργούνταν μόνο inline
 * (name+expires)· εδώ γίνονται πλήρως διαχειρίσιμοι (active/notes/λήξη + σύνδεση
 * προτύπου) μετά τη δημιουργία.
 */

export type LinkedFormGuide = {
  id: string
  code: string
  name: string
  year: number | null
  status: 'DRAFT' | 'READY'
  fieldCount: number
}

export type DocumentTypeAdminRow = {
  id: string
  name: string
  expires: boolean
  active: boolean
  notes: string | null
  dossierCount: number
  requiredFormCount: number
  templates: LinkedFormGuide[]
}

export type FormGuideOption = {
  id: string
  code: string
  name: string
  year: number | null
  status: 'DRAFT' | 'READY'
  fieldCount: number
  documentTypeId: string | null
}

/** Πλήρης κατάλογος τύπων (και ανενεργοί) με μετρητές χρήσης + συνδεδεμένους Οδηγούς. */
export async function listDocumentTypesAdmin(): Promise<DocumentTypeAdminRow[]> {
  await requirePermission('doctype.manage')
  const rows = await prisma.documentType.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    select: {
      id: true, name: true, expires: true, active: true, notes: true,
      _count: { select: { dossierDocs: true, requiredForms: true } },
      templates: {
        orderBy: [{ year: 'desc' }, { name: 'asc' }],
        select: { id: true, code: true, name: true, year: true, status: true, _count: { select: { fields: true } } },
      },
    },
  })
  return rows.map(r => ({
    id: r.id, name: r.name, expires: r.expires, active: r.active, notes: r.notes,
    dossierCount: r._count.dossierDocs, requiredFormCount: r._count.requiredForms,
    templates: r.templates.map(t => ({ id: t.id, code: t.code, name: t.name, year: t.year, status: t.status, fieldCount: t._count.fields })),
  }))
}

/** Όλοι οι Οδηγοί Εντύπων (για τον picker σύνδεσης) — δείχνει και σε ποιον τύπο ανήκει ήδη ο καθένας. */
export async function listFormGuidesForLink(): Promise<FormGuideOption[]> {
  await requirePermission('doctype.manage')
  const rows = await prisma.taxFormTemplate.findMany({
    orderBy: [{ name: 'asc' }, { year: 'desc' }],
    select: { id: true, code: true, name: true, year: true, status: true, documentTypeId: true, _count: { select: { fields: true } } },
  })
  return rows.map(t => ({ id: t.id, code: t.code, name: t.name, year: t.year, status: t.status, documentTypeId: t.documentTypeId, fieldCount: t._count.fields }))
}

export type DocumentTypeInput = { name: string; expires: boolean; active: boolean; notes: string | null }

function cleanInput(input: DocumentTypeInput): DocumentTypeInput {
  const name = input.name.trim()
  if (!name) throw new Error('Το όνομα του τύπου είναι υποχρεωτικό.')
  return { name, expires: !!input.expires, active: !!input.active, notes: input.notes?.trim() || null }
}

export async function createDocumentTypeAdmin(input: DocumentTypeInput): Promise<{ id: string }> {
  await requirePermission('doctype.manage')
  const data = cleanInput(input)
  const existing = await prisma.documentType.findUnique({ where: { name: data.name }, select: { id: true } })
  if (existing) throw new Error('Υπάρχει ήδη τύπος με αυτό το όνομα.')
  const row = await prisma.documentType.create({ data, select: { id: true } })
  revalidatePath('/document-types')
  return row
}

export async function updateDocumentTypeAdmin(id: string, input: DocumentTypeInput): Promise<void> {
  await requirePermission('doctype.manage')
  const data = cleanInput(input)
  // Μοναδικότητα ονόματος — μην συγκρουστείς με άλλον τύπο.
  const clash = await prisma.documentType.findFirst({ where: { name: data.name, id: { not: id } }, select: { id: true } })
  if (clash) throw new Error('Υπάρχει ήδη άλλος τύπος με αυτό το όνομα.')
  await prisma.documentType.update({ where: { id }, data })
  revalidatePath('/document-types')
}

/** Διαγραφή τύπου. Μπλοκάρεται αν χρησιμοποιείται σε αποθήκη πελάτη (FK Restrict). */
export async function deleteDocumentTypeAdmin(id: string): Promise<void> {
  await requirePermission('doctype.manage')
  const t = await prisma.documentType.findUnique({
    where: { id },
    select: { _count: { select: { dossierDocs: true } } },
  })
  if (!t) return
  if (t._count.dossierDocs > 0) {
    throw new Error(`Ο τύπος χρησιμοποιείται σε ${t._count.dossierDocs} δικαιολογητικά πελατών — δεν διαγράφεται. Απενεργοποίησέ τον αντ' αυτού.`)
  }
  // ProgramRequiredForm.documentTypeId & TaxFormTemplate.documentTypeId είναι SetNull — καθαρίζουν αυτόματα.
  await prisma.documentType.delete({ where: { id } })
  revalidatePath('/document-types')
}

/** Σύνδεση/αποσύνδεση ενός Οδηγού Εντύπων με τύπο (θέτει TaxFormTemplate.documentTypeId). */
export async function setFormGuideDocumentType(templateId: string, documentTypeId: string | null): Promise<void> {
  await requirePermission('doctype.manage')
  await prisma.taxFormTemplate.update({ where: { id: templateId }, data: { documentTypeId } })
  revalidatePath('/document-types')
}
