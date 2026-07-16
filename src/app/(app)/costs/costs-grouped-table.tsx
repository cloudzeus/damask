import { Coins } from 'lucide-react'
import type { GroupedRow } from './costs-data'
import { formatEur, formatUsd, formatTokens, scopeLabel } from './costs-format'

/**
 * Πίνακας ομαδοποιημένος ανά provider→model→scope. Role-based στήλες:
 * SUPER_ADMIN βλέπει «Κόστος βάσης $ / Markup % / Τελικό €», ο ADMIN βλέπει
 * ΜΟΝΟ «Κόστος €» (το τελικό με markup, χωρίς ένδειξη markup — MASTER
 * requirement: ο ADMIN δεν βλέπει το base/markup breakdown).
 */
export function CostsGroupedTable({ grouped, isSuperAdmin, fxLatest, fxDay }: {
  grouped: GroupedRow[]
  isSuperAdmin: boolean
  fxLatest: number
  fxDay: string
}) {
  if (grouped.length === 0) {
    return (
      <div className="glass table-card stagger flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Coins className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
        <div>
          <p className="font-semibold">Καμία κλήση AI σε αυτό το εύρος.</p>
          <p className="mt-0.5 text-[12.5px] text-muted-foreground">Το κόστος θα εμφανιστεί εδώ μόλις καταγραφεί η πρώτη κλήση.</p>
        </div>
      </div>
    )
  }

  return (
    <div className="glass table-card stagger">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Provider</th>
              <th>Μοντέλο</th>
              <th>Scope</th>
              <th className="num">Κλήσεις</th>
              <th className="num">Input tokens</th>
              <th className="num">Output tokens</th>
              <th className="num">Σύνολο tokens</th>
              {isSuperAdmin ? (
                <>
                  <th className="num">Κόστος βάσης $</th>
                  <th className="num">Markup %</th>
                  <th className="num">Τελικό €</th>
                </>
              ) : (
                <th className="num">Κόστος €</th>
              )}
            </tr>
          </thead>
          <tbody>
            {grouped.map(g => (
              <tr key={g.key} className="dotted-row-bottom">
                <td><span className="badge-pill info capitalize">{g.provider}</span></td>
                <td className="font-mono text-[12px]">{g.model}</td>
                <td><span className="badge-pill muted">{scopeLabel(g.scope)}</span></td>
                <td className="num tabular-nums">{formatTokens(g.calls)}</td>
                <td className="num tabular-nums">{formatTokens(g.inputTokens)}</td>
                <td className="num tabular-nums">{formatTokens(g.outputTokens)}</td>
                <td className="num tabular-nums font-semibold">{formatTokens(g.totalTokens)}</td>
                {isSuperAdmin ? (
                  <>
                    <td className="num tabular-nums text-muted-foreground">{formatUsd(g.baseCostUsd)}</td>
                    <td className="num tabular-nums">{g.markupPct > 0 ? `+${g.markupPct}%` : `${g.markupPct}%`}</td>
                    <td className="num tabular-nums font-semibold">{formatEur(g.finalCostEur)}</td>
                  </>
                ) : (
                  <td className="num tabular-nums font-semibold">{formatEur(g.finalCostEur)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{grouped.length} {grouped.length === 1 ? 'ομάδα' : 'ομάδες'} (provider · μοντέλο · scope)</span>
        <span className="ml-auto text-muted-foreground">Ισοτιμία Frankfurter ({fxDay}): 1 USD = {fxLatest.toFixed(4)} EUR</span>
      </div>
    </div>
  )
}
