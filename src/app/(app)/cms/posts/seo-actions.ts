'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'

/** Αυτόματη αρθρογραφία (SEO/GEO/AEO) — ρυθμίσεις, ιδέες, «Γράψε τώρα». Gated cms.edit. */

type R = { ok: true; message: string } | { ok: false; message: string }
const done = (message: string): R => { revalidatePath('/cms/posts'); return { ok: true, message } }
const fail = (err: unknown): R => ({ ok: false, message: err instanceof Error ? err.message : String(err) })

export type IdeaRow = { id: string; source: string; sourceUrl: string | null; title: string; summary: string | null; targetKeyword: string | null; score: number; status: string; error: string | null; postId: string | null; postSlug: string | null; postStatus: string | null; createdAt: string }

export async function autopilotState(): Promise<{ settings: import('@/lib/seo-content/engine').AutopilotSettings; ideas: IdeaRow[] }> {
  await requirePermission('cms.view')
  const { getAutopilot } = await import('@/lib/seo-content/engine')
  const [settings, ideas] = await Promise.all([
    getAutopilot(),
    prisma.contentIdea.findMany({ orderBy: [{ updatedAt: 'desc' }], take: 150 }),
  ])
  const posts = await prisma.post.findMany({ where: { id: { in: ideas.map(i => i.postId).filter(Boolean) as string[] } }, select: { id: true, slug: true, status: true } })
  const byId = new Map(posts.map(p => [p.id, p]))
  return {
    settings,
    ideas: ideas.map(i => ({
      id: i.id, source: i.source, sourceUrl: i.sourceUrl, title: i.title, summary: i.summary, targetKeyword: i.targetKeyword, score: i.score, status: i.status, error: i.error,
      postId: i.postId, postSlug: i.postId ? byId.get(i.postId)?.slug ?? null : null, postStatus: i.postId ? byId.get(i.postId)?.status ?? null : null, createdAt: i.createdAt.toISOString(),
    })),
  }
}

export async function saveAutopilotSettings(s: { enabled: boolean; autoPublish: boolean; perWeek: number }): Promise<R> {
  await requirePermission('cms.edit')
  const { saveAutopilot } = await import('@/lib/seo-content/engine')
  await saveAutopilot(s)
  return done(s.enabled ? `Ενεργό: ${s.perWeek} άρθρα/εβδομάδα${s.autoPublish ? ', αυτόματη δημοσίευση' : ', με έγκριση πριν τη δημοσίευση'}.` : 'Η αυτόματη αρθρογραφία σταμάτησε.')
}

export async function harvestNow(): Promise<R> {
  await requirePermission('cms.edit')
  try {
    const { harvestIdeas } = await import('@/lib/seo-content/engine')
    const r = await harvestIdeas()
    return done(r.added ? `${r.added} νέες ιδέες.` : 'Δεν βρέθηκαν νέες σχετικές ανακοινώσεις.')
  } catch (err) { return fail(err) }
}

/** Γράφει άρθρο από την ιδέα στο παρασκήνιο (2-4′). publish=false → «Προς έγκριση». */
export async function writeIdeaNow(ideaId: string, publish: boolean): Promise<R> {
  await requirePermission('cms.edit')
  const idea = await prisma.contentIdea.findUnique({ where: { id: ideaId }, select: { status: true } })
  if (!idea) return { ok: false, message: 'Η ιδέα δεν βρέθηκε.' }
  if (idea.status === 'WRITING') return { ok: false, message: 'Γράφεται ήδη.' }
  await prisma.contentIdea.update({ where: { id: ideaId }, data: { status: 'WRITING', error: null } })
  const { getBoss } = await import('@/lib/queue')
  await getBoss().send('seo-write' /* QUEUE_SEO_WRITE */, { ideaId, publish })
  return done('Το άρθρο γράφεται — θα εμφανιστεί σε 2-4 λεπτά.')
}

export async function setIdeaStatus(ideaId: string, status: 'NEW' | 'SKIPPED'): Promise<R> {
  await requirePermission('cms.edit')
  await prisma.contentIdea.update({ where: { id: ideaId }, data: { status, error: null } })
  return done(status === 'SKIPPED' ? 'Παραλείφθηκε.' : 'Επανήλθε στις ιδέες.')
}

export async function addIdea(input: { title: string; keyword: string }): Promise<R> {
  await requirePermission('cms.edit')
  const title = input.title.trim()
  if (title.length < 8) return { ok: false, message: 'Γράψε το θέμα του άρθρου.' }
  await prisma.contentIdea.create({ data: { source: 'MANUAL', title: title.slice(0, 300), targetKeyword: input.keyword.trim().slice(0, 120) || null, score: 90 } })
  return done('Η ιδέα προστέθηκε (υψηλή προτεραιότητα).')
}

/** Οι 30 ιδέες της ανάλυσης ανταγωνισμού (docs/seo/competitor-analysis-2026-10.md). */
export async function seedCompetitorIdeas(): Promise<R> {
  await requirePermission('cms.edit')
  const { addKeywordIdeas } = await import('@/lib/seo-content/engine')
  const { COMPETITOR_IDEAS } = await import('@/lib/seo-content/keyword-plan')
  const n = await addKeywordIdeas(COMPETITOR_IDEAS)
  return done(n ? `Προστέθηκαν ${n} ιδέες από την ανάλυση ανταγωνισμού.` : 'Υπάρχουν ήδη.')
}

/** Ξανα-αντιστοίχιση φωτογραφιών όλων των AI άρθρων από τα ονόματα αρχείων Envato Elements της Gallery. */
export async function rematchPhotosNow(): Promise<R> {
  await requirePermission('cms.edit')
  try {
    const { rematchAllArticlePhotos } = await import('@/lib/seo-content/image-match')
    const r = await rematchAllArticlePhotos()
    revalidatePath('/nea', 'layout')
    return done(r.updated ? `Άλλαξε η φωτογραφία σε ${r.updated} άρθρα.` : 'Οι φωτογραφίες ταιριάζουν ήδη — καμία αλλαγή.')
  } catch (err) { return fail(err) }
}
