'use server'

import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import {
  askOfficeMemory, coreDocumentTypes, customerCoreStatus, programReadiness,
  type MemoryAnswer, type CoreDocType, type CustomerDocStatus, type Readiness,
} from './core'

/** «Μνήμη γραφείου» — για όλο το προσωπικό (customer.view). */

export async function askMemoryAction(question: string, scope: { trdrId?: string | null } = {}): Promise<MemoryAnswer> {
  const session = await requirePermission('customer.view')
  try {
    return await askOfficeMemory(question, scope, { userId: session.user.id })
  } catch (err) {
    return { answer: err instanceof Error ? `Η αναζήτηση απέτυχε: ${err.message}` : 'Η αναζήτηση απέτυχε.', sources: [] }
  }
}

export async function coreDocumentsAction(): Promise<CoreDocType[]> {
  await requirePermission('customer.view')
  return coreDocumentTypes()
}

export async function customerCoreStatusAction(trdrId: string): Promise<CustomerDocStatus[]> {
  await requirePermission('customer.view')
  return customerCoreStatus(trdrId)
}

export async function programReadinessAction(trdrId: string, programId: string): Promise<Readiness> {
  await requirePermission('customer.view')
  return programReadiness(trdrId, programId)
}

/** Ενεργά προγράμματα + όσα έχει ήδη ο πελάτης — για επιλογή στην «Ετοιμότητα». */
export async function readinessProgramsAction(trdrId: string): Promise<{ id: string; title: string; mine: boolean }[]> {
  await requirePermission('customer.view')
  const [mine, active] = await Promise.all([
    prisma.programApplication.findMany({ where: { trdrId }, select: { program: { select: { id: true, title: true } } } }),
    prisma.program.findMany({ where: { status: 'ACTIVE', requiredForms: { some: {} } }, orderBy: { title: 'asc' }, select: { id: true, title: true } }),
  ])
  const mineIds = new Set(mine.map(m => m.program.id))
  return [...mine.map(m => ({ ...m.program, mine: true })), ...active.filter(p => !mineIds.has(p.id)).map(p => ({ ...p, mine: false }))]
}

/** Αναζήτηση πελάτη για το πεδίο εφαρμογής της ερώτησης. */
export async function searchMemoryCustomers(q: string): Promise<{ id: string; name: string; afm: string | null }[]> {
  await requirePermission('customer.view')
  const s = q.trim()
  if (s.length < 2) return []
  const digits = s.replace(/\D/g, '')
  const rows = await prisma.trdr.findMany({
    where: { SODTYPE: 13, OR: [{ NAME: { contains: s, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ AFM: { contains: digits } }] : [])] },
    orderBy: { NAME: 'asc' }, take: 12, select: { id: true, NAME: true, AFM: true },
  })
  return rows.map(r => ({ id: r.id, name: r.NAME, afm: r.AFM }))
}

/** Ανανέωση της μνήμης (εγγραφές γνώσης + embeddings όσων άλλαξαν). */
export async function refreshMemoryAction(): Promise<{ ok: boolean; message: string }> {
  await requirePermission('customer.view')
  try {
    const { reindexDocuments } = await import('@/lib/search/documents')
    const r = await reindexDocuments()
    return { ok: true, message: `Η μνήμη ενημερώθηκε: ${r.docs} εγγραφές (${r.embedded} νέες/αλλαγμένες).` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ενημέρωση απέτυχε.' }
  }
}
