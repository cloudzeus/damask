'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { ACTIONS, CATEGORY_LABELS } from '@/lib/activity/registry'
import type { ActivityCategory } from '@prisma/client'

/**
 * Analytics δραστηριότητας χρηστών (σελίδα /activity, gate 'activity.view').
 * Aggregation γίνεται σε JS πάνω σε rows φιλτραρισμένα κατά date-range (bounded),
 * ώστε να έχουμε ευέλικτο per-user + per-category + ημερήσιο breakdown χωρίς
 * πολλαπλά groupBy queries.
 */

export type UserActivitySummary = {
  userId: string | null
  userName: string
  count: number
  points: number
  byCategory: Record<string, { count: number; points: number }>
  lastAt: string | null
}
export type DailyPoint = { date: string; count: number; points: number }
export type ActivityAnalytics = {
  users: UserActivitySummary[]
  daily: DailyPoint[]
  totals: { count: number; points: number; users: number }
  categories: { key: string; label: string }[]
}

function dateRange(from?: string, to?: string) {
  const toD = to ? new Date(`${to}T23:59:59.999`) : new Date()
  const fromD = from ? new Date(`${from}T00:00:00`) : new Date(Date.now() - 29 * 86_400_000)
  return { fromD, toD }
}

export async function getActivityAnalytics(input: { from?: string; to?: string; userId?: string }): Promise<ActivityAnalytics> {
  await requirePermission('activity.view')
  const { fromD, toD } = dateRange(input.from, input.to)

  const rows = await prisma.activityLog.findMany({
    where: { createdAt: { gte: fromD, lte: toD }, ...(input.userId ? { userId: input.userId } : {}) },
    select: { userId: true, weight: true, category: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  })

  const byUser = new Map<string, UserActivitySummary>()
  const byDay = new Map<string, DailyPoint>()
  let totalCount = 0
  let totalPoints = 0

  for (const r of rows) {
    const uid = r.userId ?? '—'
    let u = byUser.get(uid)
    if (!u) {
      u = { userId: r.userId, userName: r.user?.name ?? '(διαγραμμένος/σύστημα)', count: 0, points: 0, byCategory: {}, lastAt: null }
      byUser.set(uid, u)
    }
    u.count++
    u.points += r.weight
    const cat = r.category as string
    u.byCategory[cat] ??= { count: 0, points: 0 }
    u.byCategory[cat].count++
    u.byCategory[cat].points += r.weight

    const iso = r.createdAt.toISOString()
    if (!u.lastAt || iso > u.lastAt) u.lastAt = iso
    const day = iso.slice(0, 10)
    let d = byDay.get(day)
    if (!d) { d = { date: day, count: 0, points: 0 }; byDay.set(day, d) }
    d.count++
    d.points += r.weight

    totalCount++
    totalPoints += r.weight
  }

  return {
    users: [...byUser.values()].sort((a, b) => b.points - a.points),
    daily: [...byDay.values()].sort((a, b) => a.date.localeCompare(b.date)),
    totals: { count: totalCount, points: totalPoints, users: byUser.size },
    categories: (Object.keys(CATEGORY_LABELS) as ActivityCategory[]).map(k => ({ key: k, label: CATEGORY_LABELS[k] })),
  }
}

export type ActivityLogRow = {
  id: string
  userName: string
  label: string
  categoryLabel: string
  weight: number
  summary: string | null
  createdAt: string
}

export async function getActivityLog(input: { from?: string; to?: string; userId?: string; limit?: number }): Promise<ActivityLogRow[]> {
  await requirePermission('activity.view')
  const { fromD, toD } = dateRange(input.from, input.to)
  const rows = await prisma.activityLog.findMany({
    where: { createdAt: { gte: fromD, lte: toD }, ...(input.userId ? { userId: input.userId } : {}) },
    select: { id: true, action: true, category: true, weight: true, summary: true, createdAt: true, user: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(input.limit ?? 300, 1000),
  })
  return rows.map(r => ({
    id: r.id,
    userName: r.user?.name ?? '(διαγραμμένος/σύστημα)',
    label: ACTIONS[r.action as keyof typeof ACTIONS]?.label ?? r.action,
    categoryLabel: CATEGORY_LABELS[r.category],
    weight: r.weight,
    summary: r.summary,
    createdAt: r.createdAt.toISOString(),
  }))
}
