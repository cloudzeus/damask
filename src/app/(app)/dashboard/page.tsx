import { Package, Languages, Container, ClipboardList } from 'lucide-react'

const CARDS = [
  { title: 'Προϊόντα', value: '—', hint: 'Sync στη Φάση 2', icon: Package },
  { title: 'Εκκρεμείς μεταφράσεις', value: '—', hint: 'Φάση 3', icon: Languages },
  { title: 'Ανοιχτά containers', value: '—', hint: 'Φάση 7', icon: Container },
  { title: 'Παραγγελίες', value: '—', hint: 'Φάση 6', icon: ClipboardList },
] as const

export default function DashboardPage() {
  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Καθημερινά <span className="opacity-50">›</span> <b className="text-foreground">Dashboard</b>
          </div>
          <h1 className="text-[22px]">Dashboard</h1>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(c => (
          <div key={c.title} className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
            <div
              className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
              style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
            >
              <c.icon className="size-[15px]" strokeWidth={1.8} />
            </div>
            <div className="text-[11.5px] font-bold text-muted-foreground">{c.title}</div>
            <div className="mt-[3px] text-[33px] leading-none font-[250] tracking-[-0.015em] tabular-nums">
              {c.value}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[10.5px] font-extrabold"
                style={{ color: 'var(--muted-foreground)', background: 'var(--info-soft)' }}
              >
                {c.hint}
              </span>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
