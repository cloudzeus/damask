import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { relativeTime } from '@/lib/relative-time'
import { ConsentsTable, type ConsentRow } from './consents-table'

const RANGE_DAYS: Record<string, number | null> = { '7': 7, '30': 30, all: null }

function rangeFromSearchParam(raw: string | undefined): '7' | '30' | 'all' {
  return raw === '7' || raw === 'all' ? raw : '30'
}

export default async function CmsConsentsPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  await requirePermission('cms.view')
  const { range: rawRange } = await searchParams
  const range = rangeFromSearchParam(rawRange)
  const days = RANGE_DAYS[range]

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - (days ?? 0))
  const where = days ? { createdAt: { gte: cutoff } } : {}

  const logs = await prisma.consentLog.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: 1000,
  })

  const userIds = [...new Set(logs.map(l => l.userId).filter((id): id is string => Boolean(id)))]
  const users = userIds.length > 0
    ? await prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } })
    : []
  const userLookup = new Map(users.map(u => [u.id, u.name || u.email]))

  const now = new Date()
  const rows: ConsentRow[] = logs.map(log => {
    const choices = log.choices as { necessary?: boolean; analytics?: boolean; marketing?: boolean } | null
    return {
      id: log.id,
      createdAtIso: log.createdAt.toISOString(),
      createdAtRelative: relativeTime(log.createdAt, now),
      createdAtExact: log.createdAt.toLocaleString('el-GR', { dateStyle: 'medium', timeStyle: 'medium' }),
      visitorId: log.visitorId,
      userName: log.userId ? (userLookup.get(log.userId) ?? log.userId) : null,
      ip: log.ip,
      os: log.os,
      browser: log.browser,
      locale: log.locale,
      analytics: choices?.analytics === true,
      marketing: choices?.marketing === true,
      policyVersion: log.policyVersion,
    }
  })

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            CMS <span aria-hidden>›</span> <b className="text-foreground">Συγκαταθέσεις</b>
          </div>
          <h1 className="text-[22px]">Συγκαταθέσεις</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Πλήρες αρχείο συγκαταθέσεων cookies — IP, ώρα, λειτουργικό/browser και επιλογές ανά επισκέπτη.
          </p>
        </div>
      </div>

      <ConsentsTable rows={rows} range={range} />
    </div>
  )
}
