import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { fetchMailgunStats, fetchRecentFailures, mailRangeFromParam } from '@/lib/mailgun-stats'
import { cn } from '@/lib/utils'
import { MailKpiCards } from './mail-kpi-cards'
import { MailTimeseriesChart } from './mail-timeseries-chart'
import { MailFunnelTable, type ProgramFunnelRow } from './mail-funnel-table'
import { MailFailuresTable } from './mail-failures-table'

/**
 * «Αναφορά Email» — Mailgun analytics (Stats + Events API) + τοπικό funnel
 * newsletters ανά πρόγραμμα από ProgramLead. Spec:
 * docs/superpowers/specs/2026-07-25-mail-report-design.md
 */

const RANGE_OPTIONS = [
  { value: 7, label: '7 ημέρες' },
  { value: 30, label: '30 ημέρες' },
  { value: 90, label: '90 ημέρες' },
] as const

/** Ανώτατο πλήθος προγραμμάτων στον πίνακα funnel — αρκετό για εσωτερικό report. */
const MAX_FUNNEL_PROGRAMS = 30

async function loadProgramFunnel(): Promise<ProgramFunnelRow[]> {
  const grouped = await prisma.programLead.groupBy({
    by: ['programId', 'status'],
    _count: { _all: true },
  })
  if (grouped.length === 0) return []

  const byProgram = new Map<string, ProgramFunnelRow>()
  for (const g of grouped) {
    const row = byProgram.get(g.programId) ?? {
      programId: g.programId,
      title: '',
      total: 0, pending: 0, sent: 0, failed: 0, clicked: 0,
    }
    const n = g._count._all
    row.total += n
    if (g.status === 'PENDING') row.pending += n
    else if (g.status === 'SENT') row.sent += n
    else if (g.status === 'FAILED') row.failed += n
    else if (g.status === 'CLICKED') row.clicked += n
    byProgram.set(g.programId, row)
  }

  const programs = await prisma.program.findMany({
    where: { id: { in: [...byProgram.keys()] } },
    select: { id: true, title: true },
  })
  for (const p of programs) {
    const row = byProgram.get(p.id)
    if (row) row.title = p.title
  }

  return [...byProgram.values()]
    .sort((a, b) => b.total - a.total)
    .slice(0, MAX_FUNNEL_PROGRAMS)
}

export default async function MailReportPage({
  searchParams,
}: {
  searchParams: Promise<{ range?: string }>
}) {
  await requirePermission('mail.report')
  const { range: rawRange } = await searchParams
  const range = mailRangeFromParam(rawRange)

  const monthStart = new Date()
  monthStart.setDate(1)
  monthStart.setHours(0, 0, 0, 0)

  const [stats, failures, funnel, monthSends] = await Promise.all([
    fetchMailgunStats(range),
    fetchRecentFailures(25),
    loadProgramFunnel(),
    prisma.apiUsage.count({ where: { service: 'mailgun', operation: 'send', createdAt: { gte: monthStart } } }),
  ])

  const notConfigured = !stats.ok && !stats.configured

  return (
    <div className="mail-report">
      <div className="mb-3.5 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h1 className="text-[1.1875rem] font-bold tracking-tight">Αναφορά Email</h1>
          <p className="text-[0.78125rem] text-muted-foreground">
            Mailgun analytics περιόδου + funnel newsletters ανά πρόγραμμα · {monthSends} αποστολές από την εφαρμογή τον τρέχοντα μήνα
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {RANGE_OPTIONS.map(opt => (
            <Link
              key={opt.value}
              href={opt.value === 30 ? '/mail-report' : `/mail-report?range=${opt.value}`}
              className={cn('pill', range === opt.value && 'on')}
            >
              {opt.label}
            </Link>
          ))}
        </div>
      </div>

      {notConfigured ? (
        <div className="glass mb-3.5 flex items-center gap-2.5 px-[17px] py-3 text-[0.8125rem]">
          <AlertTriangle className="size-4 shrink-0" style={{ color: 'var(--warning, #b45309)' }} strokeWidth={1.8} />
          <span>
            Το Mailgun δεν έχει ρυθμιστεί — τα στατιστικά παράδοσης δεν είναι διαθέσιμα.{' '}
            <Link href="/settings" className="font-semibold underline underline-offset-2">Ρυθμίσεις → Integrations</Link>
          </span>
        </div>
      ) : null}

      {stats.ok ? (
        <>
          <MailKpiCards kpis={stats.kpis} />
          <div className="glass mb-3.5 px-[17px] pt-[15px] pb-[9px]">
            <div className="mb-1 text-[0.71875rem] font-bold text-muted-foreground">Ημερήσια εξέλιξη ({range} ημέρες)</div>
            <MailTimeseriesChart series={stats.series} />
          </div>
        </>
      ) : !notConfigured ? (
        <div className="glass mb-3.5 px-[17px] py-3 text-[0.8125rem] text-muted-foreground">
          Σφάλμα ανάγνωσης στατιστικών Mailgun: {stats.error}
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-3.5 xl:grid-cols-2">
        <div className="glass px-[17px] pt-[15px] pb-[13px]">
          <div className="mb-2 text-[0.71875rem] font-bold text-muted-foreground">Funnel newsletters ανά πρόγραμμα</div>
          <MailFunnelTable rows={funnel} />
        </div>
        <div className="glass px-[17px] pt-[15px] pb-[13px]">
          <div className="mb-2 text-[0.71875rem] font-bold text-muted-foreground">Πρόσφατες αποτυχίες & παράπονα</div>
          {failures.ok ? (
            <MailFailuresTable failures={failures.failures} />
          ) : (
            <div className="py-4 text-[0.8125rem] text-muted-foreground">
              {failures.configured ? `Σφάλμα ανάγνωσης events: ${failures.error}` : 'Μη διαθέσιμο — το Mailgun δεν έχει ρυθμιστεί.'}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
