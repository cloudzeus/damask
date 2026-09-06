import { Send, CheckCheck, MailOpen, MousePointerClick, ShieldAlert, UserMinus } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { MailKpis } from '@/lib/mailgun-stats'

/** KPI κάρτες (glass, thin numbers) — ίδιο idiom με /costs (costs-kpis.tsx). */

const NUM = new Intl.NumberFormat('el-GR')

function formatRate(rate: number | null): string {
  return rate === null ? '—' : `${NUM.format(rate)}%`
}

function KpiCard({ icon: Icon, label, value, sub }: { icon: LucideIcon; label: string; value: number; sub?: string }) {
  return (
    <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
      <div
        className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
        style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
      >
        <Icon className="size-[15px]" strokeWidth={1.8} />
      </div>
      <div className="text-[0.71875rem] font-bold text-muted-foreground">{label}</div>
      <div className="mt-[3px] text-[2.0625rem] leading-none font-[250] tracking-[-0.015em] tabular-nums">
        {NUM.format(value)}
      </div>
      {sub ? <div className="mt-[5px] text-[0.71875rem] text-muted-foreground tabular-nums">{sub}</div> : null}
    </div>
  )
}

export function MailKpiCards({ kpis }: { kpis: MailKpis }) {
  return (
    <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      <KpiCard icon={Send} label="Απεσταλμένα" value={kpis.accepted} />
      <KpiCard icon={CheckCheck} label="Παραδόθηκαν" value={kpis.delivered} sub={`Delivery rate ${formatRate(kpis.deliveryRate)}`} />
      <KpiCard icon={MailOpen} label="Άνοιξαν" value={kpis.opened} sub={`Open rate ${formatRate(kpis.openRate)}`} />
      <KpiCard icon={MousePointerClick} label="Κλικ" value={kpis.clicked} sub={`CTR ${formatRate(kpis.clickRate)}`} />
      <KpiCard icon={ShieldAlert} label="Αποτυχίες" value={kpis.failed} sub={`Fail rate ${formatRate(kpis.failRate)}`} />
      <KpiCard icon={UserMinus} label="Παράπονα / Διαγραφές" value={kpis.complained + kpis.unsubscribed} />
    </div>
  )
}
