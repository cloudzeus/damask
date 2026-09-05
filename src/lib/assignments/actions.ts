'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { logActivity } from '@/lib/activity/log'
import { createNotification } from '@/lib/notifications/service'

/**
 * Ανάθεση έργων (ProgramApplication) σε manager + πολλούς υπαλλήλους. Gated
 * application.assign (μόνο ADMIN/SUPER_ADMIN — βλ. ROLE_DEFAULTS). Ο manager είναι
 * το single ProgramApplication.managerId· οι υπάλληλοι-εκτελεστές είναι
 * ApplicationAssignment rows.
 */

export type StaffOption = { id: string; name: string; email: string; role: string }

export async function getAssignableStaff(): Promise<{ managers: StaffOption[]; employees: StaffOption[] }> {
  await requirePermission('application.assign')
  const users = await prisma.user.findMany({
    where: { active: true, role: { name: { in: ['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'SALESMAN'] } } },
    select: { id: true, name: true, email: true, role: { select: { name: true } } },
    orderBy: { name: 'asc' },
  })
  const mapped = users.map(u => ({ id: u.id, name: u.name, email: u.email, role: u.role.name }))
  return {
    managers: mapped.filter(u => ['SUPER_ADMIN', 'ADMIN', 'MANAGER'].includes(u.role)),
    employees: mapped.filter(u => ['MANAGER', 'EMPLOYEE', 'SALESMAN'].includes(u.role)),
  }
}

export type AssignableApplicationRow = {
  id: string
  programId: string
  programTitle: string
  trdrName: string
  lifecycle: string
  managerId: string | null
  managerName: string | null
  employeeIds: string[]
  employeeNames: string[]
  createdAt: string
}

export async function listAssignableApplications(): Promise<AssignableApplicationRow[]> {
  await requirePermission('application.assign')
  const apps = await prisma.programApplication.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      program: { select: { id: true, title: true } },
      trdr: { select: { NAME: true } },
      manager: { select: { name: true } },
    },
    take: 300,
  })
  const ids = apps.map(a => a.id)
  const assignments = await prisma.applicationAssignment.findMany({ where: { applicationId: { in: ids } } })
  const userIds = [...new Set(assignments.map(a => a.userId))]
  const users = await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true } })
  const nameById = new Map(users.map(u => [u.id, u.name]))
  const byApp = new Map<string, string[]>()
  for (const a of assignments) {
    const arr = byApp.get(a.applicationId) ?? []
    arr.push(a.userId)
    byApp.set(a.applicationId, arr)
  }

  return apps.map(a => {
    const empIds = byApp.get(a.id) ?? []
    return {
      id: a.id,
      programId: a.programId,
      programTitle: a.program.title,
      trdrName: a.trdr.NAME,
      lifecycle: a.lifecycle,
      managerId: a.managerId,
      managerName: a.manager?.name ?? null,
      employeeIds: empIds,
      employeeNames: empIds.map(id => nameById.get(id) ?? id),
      createdAt: a.createdAt.toISOString(),
    }
  })
}

export async function assignApplication(input: {
  applicationId: string
  managerId?: string | null
  employeeIds: string[]
}): Promise<{ ok: boolean; error?: string }> {
  const session = await requirePermission('application.assign')
  const app = await prisma.programApplication.findUnique({ where: { id: input.applicationId }, select: { id: true, trdrId: true, programId: true } })
  if (!app) return { ok: false, error: 'Το έργο δεν βρέθηκε.' }

  const employeeIds = [...new Set(input.employeeIds)].filter(Boolean)

  await prisma.$transaction(async tx => {
    await tx.programApplication.update({ where: { id: app.id }, data: { managerId: input.managerId ?? null } })
    await tx.applicationAssignment.deleteMany({ where: { applicationId: app.id } })
    if (employeeIds.length) {
      await tx.applicationAssignment.createMany({
        data: employeeIds.map(userId => ({ applicationId: app.id, userId, assignedById: session.user.id })),
        skipDuplicates: true,
      })
    }
  })

  // Ειδοποίηση στους ανατεθειμένους (in-app).
  await createNotification({
    type: 'GENERIC',
    title: 'Ανάθεση έργου',
    body: `Σου ανατέθηκε έργο (${employeeIds.length + (input.managerId ? 1 : 0)} άτομα).`,
    entityType: 'ProgramApplication',
    entityId: app.id,
    meta: { applicationId: app.id, managerId: input.managerId ?? null, employeeIds },
  })

  await logActivity('application.associate', { entityType: 'ProgramApplication', entityId: app.id, summary: 'Ανάθεση έργου', meta: { managerId: input.managerId ?? null, employees: employeeIds.length } })
  revalidatePath('/assignments')
  return { ok: true }
}
