import { Coins, Phone, Cpu, PieChart } from 'lucide-react'
import type { CostsKpis } from './costs-data'
import { formatEur, formatTokens } from './costs-format'

/** 4 KPI κάρτες (glass, thin numbers) — ίδιο idiom με src/app/(app)/dashboard/page.tsx. */
export function CostsKpiCards({ kpis }: { kpis: CostsKpis }) {
  return (
    <div className="mb-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
        <div
          className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Coins className="size-[15px]" strokeWidth={1.8} />
        </div>
        <div className="text-[11.5px] font-bold text-muted-foreground">Συνολικό κόστος περιόδου</div>
        <div className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums">
          {formatEur(kpis.finalCostEur)}
        </div>
      </div>

      <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
        <div
          className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Phone className="size-[15px]" strokeWidth={1.8} />
        </div>
        <div className="text-[11.5px] font-bold text-muted-foreground">Κλήσεις</div>
        <div className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums">
          {formatTokens(kpis.calls)}
        </div>
      </div>

      <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
        <div
          className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <Cpu className="size-[15px]" strokeWidth={1.8} />
        </div>
        <div className="text-[11.5px] font-bold text-muted-foreground">Tokens σύνολο</div>
        <div className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums">
          {formatTokens(kpis.totalTokens)}
        </div>
      </div>

      <div className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
        <div
          className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
          style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
        >
          <PieChart className="size-[15px]" strokeWidth={1.8} />
        </div>
        <div className="text-[11.5px] font-bold text-muted-foreground">Ανά provider</div>
        {kpis.byProvider.length === 0 ? (
          <div className="mt-[3px] text-[20px] leading-none font-[250] text-muted-foreground">—</div>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {kpis.byProvider.map(p => (
              <div key={p.provider} className="flex items-center justify-between gap-2 text-[12px]">
                <span className="badge-pill muted capitalize">{p.provider}</span>
                <span className="tabular-nums font-semibold">{formatEur(p.finalCostEur)}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
