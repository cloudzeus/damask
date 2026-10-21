'use server'

import { requireApplicationAccess } from '@/lib/pm/access'
import { computeImplOverview, type ImplOverview } from '@/lib/pm/impl-overview-core'

/** «Επισκόπηση» εγκεκριμένου έργου — βλ. impl-overview-core.ts. */
export async function getImplementationOverview(applicationId: string): Promise<ImplOverview> {
  await requireApplicationAccess(applicationId)
  return computeImplOverview(applicationId)
}
