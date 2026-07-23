'use client'

import * as React from 'react'
import { LuLoaderCircle, LuCircleCheck, LuTriangleAlert } from 'react-icons/lu'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import { getBudgetCompliance } from '@/lib/pm/actions'
import type { BudgetCompliance, CategoryCompliance, ComplianceStatus } from '@/lib/pm/budget-compliance'

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

function formatAmountLimit(v: number): string {
  return `${v.toLocaleString('el-GR')}€`
}

function formatPctLimit(v: number): string {
  return `${v.toLocaleString('el-GR')}%`
}

function formatPct(v: number | null): string {
  return v == null ? '—' : `${v.toLocaleString('el-GR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

/** «≥300€», «≤50%», «300€–1.000€» — συνθέτει τα όρια κατηγορίας από τα 4
 * πιθανά πεδία (min/max € και min/max %), ένα segment ανά ζευγάρι μονάδας. */
function formatLimits(c: CategoryCompliance): string {
  const parts: string[] = []
  if (c.minAmount != null && c.maxAmount != null) {
    parts.push(`${formatAmountLimit(c.minAmount)}–${formatAmountLimit(c.maxAmount)}`)
  } else if (c.minAmount != null) {
    parts.push(`≥${formatAmountLimit(c.minAmount)}`)
  } else if (c.maxAmount != null) {
    parts.push(`≤${formatAmountLimit(c.maxAmount)}`)
  }
  if (c.minPercentage != null && c.maxPercentage != null) {
    parts.push(`${formatPctLimit(c.minPercentage)}–${formatPctLimit(c.maxPercentage)}`)
  } else if (c.minPercentage != null) {
    parts.push(`≥${formatPctLimit(c.minPercentage)}`)
  } else if (c.maxPercentage != null) {
    parts.push(`≤${formatPctLimit(c.maxPercentage)}`)
  }
  return parts.length > 0 ? parts.join(' · ') : '—'
}

function StatusPill({ status }: { status: ComplianceStatus }) {
  if (status === 'OK') return <span className="badge-pill muted">OK</span>
  if (status === 'UNDER') return <span className="badge-pill warn">Κάτω ορίου</span>
  return (
    <span className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
      Υπέρβαση
    </span>
  )
}

/**
 * C2a.2 (Task 4) — panel συμμόρφωσης προϋπολογισμού: live snapshot
 * δαπανηθέντος vs ορίων ανά κατηγορία (€/% min/max), βασισμένο στο
 * getBudgetCompliance(applicationId) (@/lib/pm/actions, πάνω από το pure
 * engine src/lib/pm/budget-compliance.ts). Self-fetching client component,
 * mirror idiom obligations-tab.tsx. Ξαναφορτώνει όταν αλλάζει το
 * `refreshKey` (μετά από αντικατάσταση δαπάνης — βλ. expenses-tab.tsx).
 */
export function BudgetCompliancePanel({ applicationId, refreshKey }: { applicationId: string; refreshKey?: number }) {
  const [data, setData] = React.useState<BudgetCompliance | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  React.useEffect(() => {
    setLoading(true)
    setError(null)
    getBudgetCompliance(applicationId)
      .then(setData)
      .catch(() => setError('Η φόρτωση της συμμόρφωσης προϋπολογισμού απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId, refreshKey])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Πλάνο δαπανών
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : !data ? null : (
        <>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
              <span className="text-muted-foreground">
                Προϋπολογισμός <strong className="text-foreground">{data.totalBudget != null ? formatEUR(data.totalBudget) : '—'}</strong>
              </span>
              <span className="text-muted-foreground">
                Δαπανήθηκε <strong className="text-foreground">{formatEUR(data.totalSpent)}</strong>
              </span>
            </div>
            {data.ok ? (
              <span className="badge-pill ok"><LuCircleCheck className="size-3" aria-hidden /> Εντός πλάνου</span>
            ) : (
              <span className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
                <LuTriangleAlert className="size-3" aria-hidden /> Παραβιάσεις: {data.violations.length}
              </span>
            )}
          </div>

          {data.categories.length === 0 ? (
            <p className="py-4 text-center text-[12.5px] text-muted-foreground">Δεν έχουν οριστεί κατηγορίες δαπανών για το πρόγραμμα.</p>
          ) : (
            <div className="rounded-lg ring-1 ring-foreground/10">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Κατηγορία</TableHead>
                    <TableHead className="text-right">Δαπανηθέν</TableHead>
                    <TableHead className="text-right">% Π/Υ</TableHead>
                    <TableHead>Όρια</TableHead>
                    <TableHead>Κατάσταση</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.categories.map(c => (
                    <TableRow key={c.id}>
                      <TableCell className="whitespace-normal">
                        <div className="flex flex-wrap items-center gap-1.5">
                          {c.name}
                          {c.mandatory && <span className="badge-pill muted shrink-0">Υποχρ.</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-right font-mono">{formatEUR(c.spent)}</TableCell>
                      <TableCell className="text-right font-mono">{formatPct(c.pct)}</TableCell>
                      <TableCell className="text-muted-foreground">{formatLimits(c)}</TableCell>
                      <TableCell><StatusPill status={c.status} /></TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}

          <p className="mt-2.5 text-[11.5px] text-muted-foreground">
            Εκτός κατηγορίας: <strong className="text-foreground">{formatEUR(data.uncategorized)}</strong>
          </p>
        </>
      )}
    </section>
  )
}
