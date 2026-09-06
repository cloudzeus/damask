'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

/**
 * Φόρτος εργασίας & αναθέσεων ανά χρήστη (υπάλληλοι/managers/admins). Gated
 * application.assign (admin/super-admin). Μετρά: έργα ως manager, έργα ως
 * εκτελεστής, σύνολο distinct έργων, και ανοιχτές εργασίες (ApplicationObligation).
 */

const OPEN_OBLIGATION = ['PENDING', 'IN_PROGRESS', 'SUBMITTED'] as const

export type WorkloadRow = {
  id: string
  name: string
  email: string
  role: string
  asManager: number
  asExecutor: number
  totalApps: number
  openTasks: number
}

export async function getWorkload(): Promise<WorkloadRow[]> {
  await requirePermission('application.assign')

  const [users, apps, assigns, obligations] = await Promise.all([
    prisma.user.findMany({
      where: { active: true, role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'SALESMAN'] } } },
      select: { id: true, name: true, email: true, role: { select: { name: true } } },
      orderBy: { name: 'asc' },
    }),
    prisma.programApplication.findMany({ select: { id: true, managerId: true } }),
    prisma.applicationAssignment.findMany({ select: { applicationId: true, userId: true } }),
    prisma.applicationObligation.findMany({ where: { status: { in: [...OPEN_OBLIGATION] } }, select: { assigneeId: true } }),
  ])

  const managerCount = new Map<string, number>()
  const appsByUser = new Map<string, Set<string>>()
  const addApp = (userId: string | null, appId: string) => {
    if (!userId) return
    const set = appsByUser.get(userId) ?? new Set<string>()
    set.add(appId)
    appsByUser.set(userId, set)
  }
  for (const a of apps) {
    if (a.managerId) {
      managerCount.set(a.managerId, (managerCount.get(a.managerId) ?? 0) + 1)
      addApp(a.managerId, a.id)
    }
  }
  const executorCount = new Map<string, number>()
  for (const a of assigns) {
    executorCount.set(a.userId, (executorCount.get(a.userId) ?? 0) + 1)
    addApp(a.userId, a.applicationId)
  }
  const openTasks = new Map<string, number>()
  for (const o of obligations) {
    if (o.assigneeId) openTasks.set(o.assigneeId, (openTasks.get(o.assigneeId) ?? 0) + 1)
  }

  return users.map(u => ({
    id: u.id,
    name: u.name,
    email: u.email,
    role: u.role.name,
    asManager: managerCount.get(u.id) ?? 0,
    asExecutor: executorCount.get(u.id) ?? 0,
    totalApps: appsByUser.get(u.id)?.size ?? 0,
    openTasks: openTasks.get(u.id) ?? 0,
  }))
}
