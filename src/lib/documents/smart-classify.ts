'use server'

import { requirePermission } from '@/lib/rbac-server'
import { classifyDocumentCore, type SmartClassifyResult } from './smart-classify-core'

export type { SmartClassifyResult } from './smart-classify-core'

/** Έξυπνη αναγνώριση δικαιολογητικού (βλ. smart-classify-core) — για το staff. */
export async function classifyDocumentSmart(input: {
  trdrId: string
  fileName: string
  text: string
}): Promise<{ ok: true; result: SmartClassifyResult } | { ok: false; message: string }> {
  await requirePermission('customer.edit')
  return classifyDocumentCore(input)
}
