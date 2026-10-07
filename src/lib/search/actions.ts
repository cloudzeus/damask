'use server'

import { requirePermission } from '@/lib/rbac-server'
import { searchDocuments, topTags, reindexDocuments, type DocumentHit } from '@/lib/search/documents'
import { scanStorage } from '@/lib/nas/backup'

/** Έξυπνη αναζήτηση εγγράφων (σημασιολογική + κειμένου + ετικέτες) — για όλο το staff. */
export async function searchDocumentsAction(
  query: string,
  filters: { trdrId?: string | null; category?: string | null; tag?: string | null; limit?: number } = {},
): Promise<DocumentHit[]> {
  const session = await requirePermission('customer.view')
  const perms = new Set(session.user.permissions ?? [])
  const hits = await searchDocuments(query.slice(0, 200), filters)
  // Backups βάσης & πρότυπα μόνο για όσους διαχειρίζονται τα αρχεία.
  return perms.has('files.manage') ? hits : hits.filter(h => h.category !== 'db-backup' && h.category !== 'template')
}

export async function topTagsAction(): Promise<{ tag: string; n: number }[]> {
  await requirePermission('customer.view')
  return topTags(40)
}

/** «Ανανέωση ευρετηρίου»: σάρωση αποθήκης + ευρετήριο αναζήτησης (νέα/αλλαγμένα). */
export async function refreshSearchIndexAction(): Promise<{ ok: boolean; message: string }> {
  await requirePermission('files.manage')
  try {
    const s = await scanStorage()
    const r = await reindexDocuments()
    return { ok: true, message: `Ευρετήριο ενημερώθηκε: ${r.docs} έγγραφα (${r.embedded} νέα/αλλαγμένα)· σαρώθηκαν ${s.scanned} αρχεία.` }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ενημέρωση απέτυχε.' }
  }
}
