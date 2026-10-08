'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { setSetting } from '@/lib/settings'
import { CAPABILITIES_KEY, DEFAULT_CAPABILITIES, generateProgramIdeas, getCapabilities, type ProgramIdeasResult } from './ideas'

export type IdeaSetRow = { id: string; status: 'RUNNING' | 'DONE' | 'ERROR'; result: ProgramIdeasResult | null; error: string | null; createdAt: string; capabilities: string | null }

const toRow = (r: { id: string; status: string; result: unknown; error: string | null; createdAt: Date; capabilities: string | null }): IdeaSetRow => ({
  id: r.id, status: r.status as IdeaSetRow['status'], result: (r.result as ProgramIdeasResult | null) ?? null, error: r.error, createdAt: r.createdAt.toISOString(), capabilities: r.capabilities,
})

export async function getLatestIdeas(programId: string): Promise<{ latest: IdeaSetRow | null; capabilities: string; isDefault: boolean }> {
  await requirePermission('programs.manage')
  const [r, caps] = await Promise.all([
    prisma.programIdeaSet.findFirst({ where: { programId }, orderBy: { createdAt: 'desc' } }),
    getCapabilities(),
  ])
  return { latest: r ? toRow(r) : null, capabilities: caps, isDefault: caps === DEFAULT_CAPABILITIES }
}

export async function getIdeaSet(id: string): Promise<IdeaSetRow | null> {
  await requirePermission('programs.manage')
  const r = await prisma.programIdeaSet.findUnique({ where: { id } })
  return r ? toRow(r) : null
}

/** Νέα παραγωγή ιδεών (~1′, στο παρασκήνιο) με το τρέχον «αντικείμενο». */
export async function startProgramIdeas(programId: string): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const running = await prisma.programIdeaSet.findFirst({ where: { programId, status: 'RUNNING', createdAt: { gt: new Date(Date.now() - 10 * 60_000) } }, select: { id: true } })
  if (running) return running
  const set = await prisma.programIdeaSet.create({ data: { programId, capabilities: await getCapabilities(), createdById: session.user.id }, select: { id: true } })
  void generateProgramIdeas(set.id).catch(err => console.error('[program-ideas] failed', err))
  return set
}

/** Το «αντικείμενό μας» — κοινό για όλα τα προγράμματα. */
export async function saveCapabilities(text: string): Promise<void> {
  await requirePermission('programs.manage')
  await setSetting(CAPABILITIES_KEY, text.trim() || DEFAULT_CAPABILITIES)
}
