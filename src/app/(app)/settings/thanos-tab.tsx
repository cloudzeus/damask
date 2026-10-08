import { prisma } from '@/lib/prisma'
import { ThanosKnowledge, type LessonItem, type TurnItem } from './thanos-knowledge'

const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000)

/** Καρτέλα «Thanos — γνώση»: τι έμαθε ο Thanos από τις συζητήσεις + έγκριση/διόρθωση. */
export async function ThanosTab() {
  const weekAgo = daysAgo(7)
  const [lessons, turns, total, week, up, down, pending] = await Promise.all([
    prisma.thanosLesson.findMany({ orderBy: [{ updatedAt: 'desc' }], take: 300, select: { id: true, question: true, answer: true, programId: true, status: true, source: true, uses: true, createdAt: true } }),
    prisma.thanosTurn.findMany({ orderBy: { createdAt: 'desc' }, take: 60, select: { id: true, userId: true, mode: true, question: true, reply: true, rating: true, note: true, cached: true, createdAt: true } }),
    prisma.thanosTurn.count(),
    prisma.thanosTurn.count({ where: { createdAt: { gte: weekAgo } } }),
    prisma.thanosTurn.count({ where: { rating: 1 } }),
    prisma.thanosTurn.count({ where: { rating: -1 } }),
    prisma.thanosTurn.count({ where: { distilledAt: null, cached: false } }),
  ])
  const [programs, users] = await Promise.all([
    prisma.program.findMany({ where: { id: { in: [...new Set(lessons.map(l => l.programId).filter(Boolean) as string[])] } }, select: { id: true, title: true } }),
    prisma.user.findMany({ where: { id: { in: [...new Set(turns.map(t => t.userId))] } }, select: { id: true, name: true } }),
  ])
  const programTitle = new Map(programs.map(p => [p.id, p.title]))
  const userName = new Map(users.map(u => [u.id, u.name]))

  const lessonItems: LessonItem[] = lessons.map(l => ({
    id: l.id, question: l.question, answer: l.answer, status: l.status, source: l.source, uses: l.uses,
    program: l.programId ? programTitle.get(l.programId) ?? null : null, createdAt: l.createdAt.toISOString(),
  }))
  const turnItems: TurnItem[] = turns.map(t => ({
    id: t.id, user: userName.get(t.userId) ?? '—', mode: t.mode, question: t.question, reply: t.reply,
    rating: t.rating, note: t.note, cached: t.cached, createdAt: t.createdAt.toISOString(),
  }))
  return (
    <ThanosKnowledge
      lessons={lessonItems}
      turns={turnItems}
      stats={{ total, week, up, down, pending, active: lessons.filter(l => l.status === 'ACTIVE').length, suggested: lessons.filter(l => l.status === 'SUGGESTED').length }}
    />
  )
}
