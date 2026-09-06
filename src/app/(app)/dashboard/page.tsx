import Link from 'next/link'
import { Bell } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { getNotifications } from '@/lib/notifications/actions'
import { relativeTime } from '@/lib/relative-time'
import { PendingReviews } from '@/components/pm/pending-reviews'

export default async function DashboardPage() {
  const notifications = await getNotifications(8)

  return (
    <div>
      <PageHeader
        breadcrumb={<>Καθημερινά <span aria-hidden>›</span></>}
        title="Dashboard"
      />

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
                  {n.type === 'PUBLIC_LEAD' || n.entityType === 'Lead' ? (
                    <Link href="/leads" className={`${itemClass} -mx-2 rounded-lg px-2 transition-colors hover:bg-muted`}>
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
