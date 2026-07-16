import { Mail, HardDrive, CreditCard, Landmark, MapPin, Server, ExternalLink } from 'lucide-react'
import { Progress } from '@/components/ui/progress'
import type { ApiServiceSummary } from './api-costs-data'
import { formatEur, formatUnits } from './costs-format'

const SERVICE_ICONS: Record<string, typeof Mail> = {
  mailgun: Mail,
  bunnycdn: HardDrive,
  viva: CreditCard,
  aade: Landmark,
  geocoding: MapPin,
}

function serviceIcon(service: string) {
  return SERVICE_ICONS[service] ?? Server
}

/**
 * Tab «API Υπηρεσίες» — μία γραμμή ανά υπηρεσία (Mailgun/BunnyCDN/Viva/ΑΑΔΕ/
 * geocoding), τρέχων ημερολογιακός μήνας. Free quota progress bar (όταν η
 * υπηρεσία έχει quota > 0). Role-based στήλες κόστους — ίδιος κανόνας με
 * costs-grouped-table.tsx: SUPER_ADMIN βλέπει «Πραγματικό €/Markup %/Τελικό €»,
 * ο ADMIN μόνο «Κόστος €».
 */
export function ApiServicesTable({ summaries, isSuperAdmin }: { summaries: ApiServiceSummary[]; isSuperAdmin: boolean }) {
  if (summaries.length === 0) {
    return (
      <div className="glass table-card stagger flex flex-col items-center gap-3 px-6 py-12 text-center">
        <div
          className="flex size-11 items-center justify-center rounded-full"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Server className="size-5" strokeWidth={1.6} aria-hidden />
        </div>
        <p className="font-semibold">Καμία γνωστή API υπηρεσία.</p>
      </div>
    )
  }

  return (
    <div className="glass table-card stagger">
      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Υπηρεσία</th>
              <th className="num">Κλήσεις</th>
              <th className="num">Μονάδες μήνα</th>
              <th>Free quota</th>
              {isSuperAdmin ? (
                <>
                  <th className="num">Πραγματικό €</th>
                  <th className="num">Markup %</th>
                  <th className="num">Τελικό €</th>
                </>
              ) : (
                <th className="num">Κόστος €</th>
              )}
            </tr>
          </thead>
          <tbody>
            {summaries.map(s => {
              const Icon = serviceIcon(s.service)
              const pctClamped = s.quotaPct == null ? null : Math.min(100, Math.max(0, s.quotaPct))
              const overQuota = s.quotaPct != null && s.quotaPct >= 100
              return (
                <tr key={s.service} className="dotted-row-bottom">
                  <td>
                    <div className="flex items-center gap-2">
                      <div
                        className="flex size-7 shrink-0 items-center justify-center rounded-[9px]"
                        style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
                      >
                        <Icon className="size-3.5" strokeWidth={1.8} aria-hidden />
                      </div>
                      <span className="font-semibold">{s.displayName}</span>
                      {s.documentationUrl && (
                        <a
                          href={s.documentationUrl} target="_blank" rel="noreferrer"
                          className="text-muted-foreground hover:text-foreground"
                          aria-label={`Τεκμηρίωση τιμολόγησης ${s.displayName}`}
                        >
                          <ExternalLink className="size-3" strokeWidth={1.8} />
                        </a>
                      )}
                    </div>
                  </td>
                  <td className="num tabular-nums">{s.calls.toLocaleString('el-GR')}</td>
                  <td className="num tabular-nums font-semibold">{formatUnits(s.units, s.unitLabel)}</td>
                  <td style={{ minWidth: 160 }}>
                    {s.freeQuota > 0 && pctClamped != null ? (
                      <div className="flex flex-col gap-1">
                        <Progress value={pctClamped} className="h-1.5" />
                        <span className={`text-[11px] tabular-nums ${overQuota ? 'font-semibold text-destructive' : 'text-muted-foreground'}`}>
                          {formatUnits(s.units, s.unitLabel)} / {formatUnits(s.freeQuota, s.unitLabel)}
                        </span>
                      </div>
                    ) : (
                      <span className="text-[12px] text-muted-foreground">—</span>
                    )}
                  </td>
                  {isSuperAdmin ? (
                    <>
                      <td className="num tabular-nums text-muted-foreground">{formatEur(s.realCostEur)}</td>
                      <td className="num tabular-nums">{s.markupPercent > 0 ? `+${s.markupPercent}%` : `${s.markupPercent}%`}</td>
                      <td className="num tabular-nums font-semibold">{formatEur(s.billedCostEur)}</td>
                    </>
                  ) : (
                    <td className="num tabular-nums font-semibold">{formatEur(s.billedCostEur)}</td>
                  )}
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{summaries.length} {summaries.length === 1 ? 'υπηρεσία' : 'υπηρεσίες'} · τρέχων μήνας</span>
      </div>
    </div>
  )
}
