'use server'

import { revalidatePath } from 'next/cache'
import { requireApplicationAccess } from '@/lib/pm/access'
import { logActivity } from '@/lib/activity/log'
import { reconcileApplicationObligations, type ReconcileResult } from '@/lib/pm/obligations-reconcile'

/** «Έλεγχος από τα δικαιολογητικά» — άμεση συμφιλίωση των εκκρεμοτήτων ενός έργου με την αποθήκη της εταιρίας (με AI). */
export async function reconcileObligationsNow(applicationId: string): Promise<ReconcileResult> {
  const { session } = await requireApplicationAccess(applicationId)
  const r = await reconcileApplicationObligations(applicationId, { ai: true })
  await logActivity('obligations.reconcile', { entityType: 'application', entityId: applicationId, userId: session.user.id, meta: { covered: r.covered.length, waived: r.waived, series: r.series } })
  revalidatePath('/programs')
  return r
}
