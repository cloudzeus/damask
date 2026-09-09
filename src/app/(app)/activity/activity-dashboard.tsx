'use client'

import * as React from 'react'
import { LoaderCircle, RefreshCw, Activity as ActivityIcon, Trophy, Users as UsersIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import {
  getActivityAnalytics, getActivityLog,
  type ActivityAnalytics, type UserActivitySummary, type DailyPoint, type ActivityLogRow,
} from '@/lib/activity/actions'

const isoDay = (d: Date) => d.toISOString().slice(0, 10)
const fmtDate = (iso: string | null) => (iso ? new Date(iso).toLocaleString('el-GR', { dateStyle: 'short', timeStyle: 'short' }) : '—')

export function ActivityDashboard({ users }: { users: { id: string; name: string }[] }) {
  const [from, setFrom] = React.useState(() => isoDay(new Date(Date.now() - 29 * 86_400_000)))
  const [to, setTo] = React.useState(() => isoDay(new Date()))
  const [userId, setUserId] = React.useState<string>('')
  const [loading, setLoading] = React.useState(false)
  const [analytics, setAnalytics] = React.useState<ActivityAnalytics | null>(null)
  const [log, setLog] = React.useState<ActivityLogRow[]>([])

  const run = React.useCallback(async (f: string, t: string, u: string) => {
    setLoading(true)
    try {
      const args = { from: f, to: t, userId: u || undefined }
      const [a, l] = await Promise.all([getActivityAnalytics(args), getActivityLog(args)])
      setAnalytics(a)
      setLog(l)
    } finally {
      setLoading(false)
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      setLoading(true)
      try {
        const args = { from, to, userId: userId || undefined }
        const [a, l] = await Promise.all([getActivityAnalytics(args), getActivityLog(args)])
        if (!cancelled) { setAnalytics(a); setLog(l) }
      } finally {
        if (!cancelled) setLoading(false)
      }
    })()
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- initial load only· τα φίλτρα εφαρμόζονται με το κουμπί
  }, [])

  const userColumns: DataTableColumn<UserActivitySummary>[] = [
    { id: 'name', header: 'Χρήστης', width: 220, enableHide: false, sortValue: u => u.userName, cell: u => <b>{u.userName}</b> },
    { id: 'count', header: 'Ενέργειες', align: 'right', width: 110, sortValue: u => u.count, cell: u => u.count },
    { id: 'points', header: 'Πόντοι', align: 'right', width: 110, sortValue: u => u.points, cell: u => <b className="tabular-nums">{u.points}</b> },
    { id: 'last', header: 'Τελευταία', width: 160, sortValue: u => u.lastAt, cell: u => fmtDate(u.lastAt) },
  ]

  const dailyColumns: DataTableColumn<DailyPoint>[] = [
    { id: 'date', header: 'Ημέρα', width: 140, sortValue: d => d.date, cell: d => new Date(d.date).toLocaleDateString('el-GR') },
    { id: 'count', header: 'Ενέργειες', align: 'right', width: 110, sortValue: d => d.count, cell: d => d.count },
    { id: 'points', header: 'Πόντοι', align: 'right', width: 110, sortValue: d => d.points, cell: d => d.points },
  ]

  const logColumns: DataTableColumn<ActivityLogRow>[] = [
    { id: 'createdAt', header: 'Ημ/νία', width: 160, sortValue: r => r.createdAt, cell: r => fmtDate(r.createdAt) },
    { id: 'user', header: 'Χρήστης', width: 160, sortValue: r => r.userName, cell: r => r.userName },
    { id: 'label', header: 'Ενέργεια', width: 220, sortValue: r => r.label, cell: r => r.label },
    { id: 'category', header: 'Κατηγορία', width: 150, sortValue: r => r.categoryLabel, cell: r => <span className="badge-pill muted">{r.categoryLabel}</span> },
    { id: 'summary', header: 'Λεπτομέρεια', width: 220, cell: r => <span className="text-muted-foreground">{r.summary ?? '—'}</span> },
    { id: 'weight', header: 'Πόντοι', align: 'right', width: 90, sortValue: r => r.weight, cell: r => r.weight },
  ]

  const kpis = [
    { icon: ActivityIcon, label: 'Ενέργειες', value: analytics?.totals.count ?? 0 },
    { icon: Trophy, label: 'Πόντοι', value: analytics?.totals.points ?? 0 },
    { icon: UsersIcon, label: 'Ενεργοί χρήστες', value: analytics?.totals.users ?? 0 },
  ]

  return (
    <div className="flex flex-col gap-3">
      <div className="glass table-toolbar rounded-[18px]">
        <label className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-muted-foreground">
          Από
          <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1 text-[0.78125rem]" />
        </label>
        <label className="flex items-center gap-1.5 text-[0.75rem] font-semibold text-muted-foreground">
          Έως
          <input type="date" value={to} min={from} onChange={e => setTo(e.target.value)} className="rounded-lg border border-border bg-card px-2 py-1 text-[0.78125rem]" />
        </label>
        <div className="min-w-[200px]">
          <Select value={userId || 'all'} onValueChange={v => setUserId(!v || v === 'all' ? '' : v)}>
            <SelectTrigger className="h-9 w-full rounded-full border-border bg-card px-4">
              <SelectValue>{(v: string) => (v === 'all' ? 'Όλοι οι χρήστες' : (users.find(u => u.id === v)?.name ?? v))}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Όλοι οι χρήστες</SelectItem>
              {users.map(u => <SelectItem key={u.id} value={u.id}>{u.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="flex-1" />
        <Button type="button" onClick={() => run(from, to, userId)} disabled={loading}>
          {loading ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
          Εφαρμογή
        </Button>
      </div>

      <div className="stagger grid grid-cols-1 gap-3 sm:grid-cols-3">
        {kpis.map(k => (
          <div key={k.label} className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
            <div className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
              <k.icon className="size-[15px]" strokeWidth={1.8} />
            </div>
            <div className="text-[0.71875rem] font-bold text-muted-foreground">{k.label}</div>
            <div className="mt-[3px] text-[2.0625rem] leading-none font-[250] tabular-nums">{k.value}</div>
          </div>
        ))}
      </div>

      <DataTable
        fillHeight={false}
        tableId="activity-users"
        columns={userColumns}
        rows={analytics?.users ?? []}
        rowKey={u => u.userId ?? '—'}
        initialSort={{ columnId: 'points', dir: 'desc' }}
        emptyMessage={loading ? 'Φόρτωση…' : 'Καμία δραστηριότητα στο διάστημα.'}
        footer={<span>Σύνοψη ανά χρήστη</span>}
      />

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <DataTable
          fillHeight={false}
          tableId="activity-daily"
          columns={dailyColumns}
          rows={analytics?.daily ?? []}
          rowKey={d => d.date}
          emptyMessage="—"
          footer={<span>Ανά ημέρα</span>}
        />
        <DataTable
          fillHeight={false}
          tableId="activity-log"
          columns={logColumns}
          rows={log}
          rowKey={r => r.id}
          emptyMessage="—"
          footer={<span>Αναλυτικό ιστορικό ({log.length})</span>}
        />
      </div>
    </div>
  )
}
