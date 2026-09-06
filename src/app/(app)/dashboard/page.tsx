import Link from 'next/link'
import { Package, Languages, Container, ClipboardList, Bell } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { getNotifications } from '@/lib/notifications/actions'
import { relativeTime } from '@/lib/relative-time'
import { PendingReviews } from '@/components/pm/pending-reviews'

const CARDS = [
  { title: 'Προϊόντα', value: '—', hint: 'Sync στη Φάση 2', icon: Package },
  { title: 'Εκκρεμείς μεταφράσεις', value: '—', hint: 'Φάση 3', icon: Languages },
  { title: 'Ανοιχτά containers', value: '—', hint: 'Φάση 7', icon: Container },
  { title: 'Παραγγελίες', value: '—', hint: 'Φάση 6', icon: ClipboardList },
] as const

export default async function DashboardPage() {
  const notifications = await getNotifications(8)

  return (
    <div>
      <PageHeader
        breadcrumb={<>Καθημερινά <span aria-hidden>›</span></>}
        title="Dashboard"
      />
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {CARDS.map(c => (
          <div key={c.title} className="glass lift relative px-[17px] pt-[15px] pb-[13px]">
            <div
              className="absolute top-[13px] right-[13px] flex size-[30px] items-center justify-center rounded-[11px]"
              style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
            >
              <c.icon className="size-[15px]" strokeWidth={1.8} />
            </div>
            <div className="text-[0.71875rem] font-bold text-muted-foreground">{c.title}</div>
            <div className="mt-[3px] text-[2.0625rem] leading-none font-[250] tracking-[-0.015em] tabular-nums">
              {c.value}
            </div>
            <div className="mt-1 flex items-center justify-between gap-2">
              <span
                className="rounded-full px-2 py-0.5 text-[0.65625rem] font-extrabold"
                style={{ color: 'var(--muted-foreground)', background: 'var(--info-soft)' }}
              >
                {c.hint}
              </span>
            </div>
          </div>
        ))}
      </div>

      <PendingReviews />

      <section className="glass mt-3 px-4 pt-3.5 pb-3">
        <header className="mb-2.5 flex items-center gap-2">
          <span
            className="flex size-[1.75rem] items-center justify-center rounded-[0.6875rem]"
            style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}
          >
            <Bell className="size-[0.9375rem]" strokeWidth={1.8} />
          </span>
          <h2 className="text-[0.8125rem] font-bold text-foreground">Ειδοποιήσεις</h2>
        </header>

        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[0.75rem] text-muted-foreground">
            Καμία ειδοποίηση προς το παρόν
          </div>
        ) : (
          <ul className="divide-y divide-border">
            {notifications.map(n => {
              const content = (
                <>
                  <span className="flex w-full items-center gap-2">
                    {!n.read && (
                      <span
                        className="size-1.5 shrink-0 rounded-full"
                        style={{ background: 'var(--coral)' }}
                        aria-hidden
                      />
                    )}
                    <span className={`min-w-0 flex-1 truncate text-[0.8125rem] ${n.read ? 'font-medium text-foreground' : 'font-bold text-foreground'}`}>
                      {n.title}
                    </span>
                    <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">
                      {relativeTime(n.createdAt)}
                    </span>
                  </span>
                  {n.body && (
                    <span className="line-clamp-2 text-[0.75rem] text-muted-foreground">
                      {n.body}
                    </span>
                  )}
                </>
              )
              const itemClass = 'flex min-h-[2.75rem] flex-col items-start gap-0.5 py-2.5'
              return (
                <li key={n.id}>
                  {n.type === 'PUBLIC_LEAD' ? (
                    <Link href="/newsletter" className={`${itemClass} -mx-2 rounded-lg px-2 transition-colors hover:bg-muted`}>
                      {content}
                    </Link>
                  ) : (
                    <div className={itemClass}>{content}</div>
                  )}
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
