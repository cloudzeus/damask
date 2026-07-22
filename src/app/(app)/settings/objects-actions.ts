'use server'

import { revalidatePath } from 'next/cache'
import { requireSuperAdmin } from '@/lib/rbac-server'
import { setEnabledObjectKeys } from '@/lib/objects-server'
import type { ActionResult } from './actions'

/** Persist the SUPER_ADMIN's enabled-object selection. Core keys are implicit. */
export async function saveEnabledObjects(keys: string[]): Promise<ActionResult> {
  await requireSuperAdmin('settings.manage')
  await setEnabledObjectKeys(keys)
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Οι διαθέσιμες οντότητες αποθηκεύτηκαν.' }
}
