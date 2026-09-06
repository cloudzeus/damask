'use client'

import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts'
import type { MailgunDailyPoint } from '@/lib/mailgun-stats'

/**
 * Γράφημα ημερήσιας εξέλιξης (delivered/opened/clicked/failed). Παλέτα
 * επικυρωμένη με τον dataviz validator και στα δύο modes (CVD + normal
 * floors PASS) — τα hex ορίζονται ως CSS vars στο globals.css (.mail-report /
 * .dark .mail-report) ώστε το dark mode να αλλάζει σε ένα σημείο.
 */

const SERIES = [
  { key: 'delivered', label: 'Παραδόθηκαν', cssVar: 'var(--mr-delivered)' },
  { key: 'opened', label: 'Άνοιξαν', cssVar: 'var(--mr-opened)' },
  { key: 'clicked', label: 'Κλικ', cssVar: 'var(--mr-clicked)' },
  { key: 'failed', label: 'Αποτυχίες', cssVar: 'var(--mr-failed)' },
] as const

const DAY_FMT = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', timeZone: 'UTC' })

function formatDay(day: string): string {
  const d = new Date(`${day}T00:00:00Z`)
  return Number.isNaN(d.getTime()) ? day : DAY_FMT.format(d)
}

function ChartTooltip({ active, payload, label }: {
  active?: boolean
  payload?: { dataKey?: string | number; value?: number | string }[]
  label?: string | number
}) {
  if (!active || !payload?.length) return null
  return (
    <div className="glass px-3 py-2 text-[0.75rem] shadow-md">
      <div className="mb-1 font-bold">{formatDay(String(label))}</div>
      {SERIES.map(s => {
        const entry = payload.find(p => p.dataKey === s.key)
        return (
          <div key={s.key} className="flex items-center gap-1.5 tabular-nums">
            <span className="inline-block size-2 rounded-full" style={{ background: s.cssVar }} />
            <span className="text-muted-foreground">{s.label}</span>
            <span className="ml-auto pl-3 font-semibold">{Number(entry?.value ?? 0)}</span>
          </div>
        )
      })}
    </div>
  )
}

export function MailTimeseriesChart({ series }: { series: MailgunDailyPoint[] }) {
  const hasTraffic = series.some(p => p.accepted + p.delivered + p.opened + p.clicked + p.failed > 0)

  return (
    <div>
      <div className="mb-1.5 flex flex-wrap items-center gap-x-4 gap-y-1" aria-label="Υπόμνημα σειρών">
        {SERIES.map(s => (
          <span key={s.key} className="flex items-center gap-1.5 text-[0.71875rem] text-muted-foreground">
            <span className="inline-block h-[3px] w-4 rounded-full" style={{ background: s.cssVar }} />
            {s.label}
          </span>
        ))}
      </div>
      <div className="h-[280px]">
        {hasTraffic ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={series} margin={{ top: 6, right: 12, bottom: 0, left: -14 }}>
              <CartesianGrid vertical={false} stroke="currentColor" strokeOpacity={0.08} />
              <XAxis
                dataKey="day"
                tickFormatter={formatDay}
                tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }}
                tickLine={false}
                axisLine={false}
                minTickGap={28}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: 'currentColor', opacity: 0.55 }}
                tickLine={false}
                axisLine={false}
                width={46}
              />
              <Tooltip content={<ChartTooltip />} cursor={{ stroke: 'currentColor', strokeOpacity: 0.2 }} />
              {SERIES.map(s => (
                <Line
                  key={s.key}
                  type="monotone"
                  dataKey={s.key}
                  stroke={s.cssVar}
                  strokeWidth={2}
                  dot={false}
                  activeDot={{ r: 4, strokeWidth: 2, stroke: 'var(--background)' }}
                  isAnimationActive={false}
                />
              ))}
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <div className="flex h-full items-center justify-center text-[0.8125rem] text-muted-foreground">
            Καμία δραστηριότητα email στην περίοδο.
          </div>
        )}
      </div>
    </div>
  )
}
