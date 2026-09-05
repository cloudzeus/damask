import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { relativeTime } from '@/lib/relative-time'
import { ConsentsTable, type ConsentRow } from './consents-table'
import { PageHeader } from '@/components/ui/page-header'

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
  await assertObjectEnabled('cms-consents')
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
      <PageHeader
        breadcrumb={<>CMS <span aria-hidden>›</span></>}
        title="Συγκαταθέσεις"
        subtitle="Πλήρες αρχείο συγκαταθέσεων cookies — IP, ώρα, λειτουργικό/browser και επιλογές ανά επισκέπτη."
      />

      <ConsentsTable rows={rows} range={range} />
    </div>
  )
}
