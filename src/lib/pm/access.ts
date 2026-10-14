import { notFound } from 'next/navigation'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { visibleApplicationWhere } from '@/lib/pm/scoping'

/** (Plain helper — ΟΧΙ action.) Πρόσβαση σε έργο: pm.work/pm.manage + ορατότητα (διαχειριστής/διεκπεραιωτής). */
export async function requireApplicationAccess(applicationId: string) {
  let session
  try { session = await requirePermission('pm.work') } catch { session = await requirePermission('pm.manage') }
  const app = await prisma.programApplication.findFirst({
    where: { id: applicationId, ...visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) },
    select: { id: true, programId: true, trdrId: true },
  })
  if (!app) notFound()
  return { session, app }
}

export async function requireExpenseAccess(expenseId: string) {
  const e = await prisma.programExpense.findUnique({ where: { id: expenseId }, select: { applicationId: true } })
  if (!e) notFound()
  return requireApplicationAccess(e.applicationId)
}
