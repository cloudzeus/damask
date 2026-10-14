'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { isSeriesKind } from '@/lib/documents/series'
import { buildValuesGrid, type GridKind, type ValuesGrid } from '@/lib/documents/values-grid-core'

/**
 * «Πίνακας τιμών» ενός Οδηγού για έναν πελάτη: σειρές (Φ2 ανά μήνα) ή ετήσια έντυπα (Ε3/Ε1 ανά έτος), με την
 * πηγή κάθε τιμής (δικαιολογητικό) για προβολή. Το `documentTypeId` (αν υπάρχει) δίνει και τα έγγραφα ανά περίοδο.
 */
export type ValuesGridView = ValuesGrid & {
  templateId: string
  templateName: string
  documentTypeId: string | null
  typeName: string | null
  /** Δικαιολογητικά του τύπου που δεν έχουν διαβαστεί ακόμη. */
  unread: number
}

async function gridFor(trdrId: string, tpl: { id: string; name: string; documentTypeId: string | null; documentType: { name: string; seriesKind: string | null } | null; fields: { fieldKey: string; label: string; valueType: string }[] }): Promise<ValuesGridView> {
  const sk = tpl.documentType?.seriesKind
  const kind: GridKind = isSeriesKind(sk) && sk !== 'LIST' ? sk : 'YEARLY'
  const series = kind !== 'YEARLY'
  const [values, docs, records] = await Promise.all([
    prisma.trdrFinancialValue.findMany({
      where: { trdrId, fieldKey: { in: tpl.fields.map(f => f.fieldKey) }, ...(series ? { templateId: tpl.id, period: { not: '' } } : { period: '' }) },
      select: { fieldKey: true, year: true, period: true, value: true, valueText: true, verified: true, templateId: true, sourceRecord: { select: { dossierDocId: true } } },
    }),
    tpl.documentTypeId
      ? prisma.trdrDossierDocument.findMany({ where: { trdrId, documentTypeId: tpl.documentTypeId }, select: { id: true, name: true, mimeType: true, period: true, createdAt: true }, orderBy: { createdAt: 'desc' } })
      : Promise.resolve([]),
    prisma.trdrFormRecord.findMany({ where: { trdrId, templateId: tpl.id, dossierDocId: { not: null } }, select: { dossierDocId: true, year: true, period: true } }),
  ])
  // Ετήσια: η τιμή ανήκει στο ΕΤΟΣ· το έγγραφο κάθε έτους από την εγγραφή ανάγνωσης.
  const docMeta = new Map(docs.map(d => [d.id, d]))
  const gridDocs = series
    ? docs.filter(d => d.period).map(d => ({ id: d.id, period: d.period!, name: d.name, mimeType: d.mimeType }))
    : records.flatMap(r => { const d = r.dossierDocId ? docMeta.get(r.dossierDocId) : null; return d ? [{ id: d.id, period: String(r.year), name: d.name, mimeType: d.mimeType }] : [] })
  // Ετήσιες τιμές του ίδιου fieldKey από άλλο έντυπο: προτιμάται του ίδιου Οδηγού.
  const own = series ? values : [...values].sort((a, b) => Number(b.templateId === tpl.id) - Number(a.templateId === tpl.id))
  const seen = new Set<string>()
  const gridValues = own.flatMap(v => {
    const period = series ? v.period : String(v.year)
    const k = `${v.fieldKey}|${period}`
    if (seen.has(k)) return []
    seen.add(k)
    return [{ fieldKey: v.fieldKey, period, value: v.value == null ? null : Number(v.value), text: v.valueText, verified: v.verified, docId: v.sourceRecord?.dossierDocId ?? null }]
  })
  const read = new Set(records.map(r => r.dossierDocId))
  const grid = buildValuesGrid({ kind, fields: tpl.fields.map(f => ({ key: f.fieldKey, label: f.label, valueType: f.valueType })), values: gridValues, docs: gridDocs })
  return {
    ...grid,
    templateId: tpl.id, templateName: tpl.name, documentTypeId: tpl.documentTypeId, typeName: tpl.documentType?.name ?? null,
    unread: docs.filter(d => !read.has(d.id)).length,
  }
}

const TPL_SELECT = {
  id: true, name: true, documentTypeId: true,
  documentType: { select: { name: true, seriesKind: true } },
  fields: { orderBy: { order: 'asc' as const }, select: { fieldKey: true, label: true, valueType: true } },
}

/** Πίνακας τιμών για έναν τύπο δικαιολογητικού (π.χ. Φ2) — null αν ο τύπος δεν έχει Οδηγό με πεδία. */
export async function getValuesGridForType(trdrId: string, documentTypeId: string): Promise<ValuesGridView | null> {
  await requirePermission('customer.view')
  const tpl = await prisma.taxFormTemplate.findFirst({ where: { documentTypeId }, orderBy: [{ status: 'desc' }, { updatedAt: 'desc' }], select: TPL_SELECT })
  if (!tpl?.fields.length) return null
  return gridFor(trdrId, tpl)
}

/** Όλοι οι πίνακες τιμών του πελάτη (ένας ανά Οδηγό με τιμές) — για την καρτέλα «Οικονομικά στοιχεία». */
export async function listValuesGrids(trdrId: string): Promise<ValuesGridView[]> {
  await requirePermission('customer.view')
  const used = await prisma.trdrFormRecord.findMany({ where: { trdrId }, distinct: ['templateId'], select: { templateId: true } })
  if (!used.length) return []
  const tpls = await prisma.taxFormTemplate.findMany({ where: { id: { in: used.map(u => u.templateId) } }, orderBy: { name: 'asc' }, select: TPL_SELECT })
  const grids = await Promise.all(tpls.filter(t => t.fields.length).map(t => gridFor(trdrId, t)))
  return grids.filter(g => g.columns.length > 0)
}
