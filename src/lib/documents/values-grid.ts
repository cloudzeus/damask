'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { gridFor, loadValuesGrids, TPL_SELECT, type ValuesGridView } from '@/lib/documents/values-grid-load'

export type { ValuesGridView }

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
  return loadValuesGrids(trdrId)
}
