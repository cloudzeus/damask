import Link from 'next/link'
import { Bell, FolderKanban, FileCheck2, PhoneCall, CalendarClock, ArrowRight } from 'lucide-react'
import { PageHeader } from '@/components/ui/page-header'
import { getNotifications } from '@/lib/notifications/actions'
import { getDashboardSummary } from '@/lib/dashboard/summary'
import { notifActions } from '@/lib/notifications/targets'
import { relativeTime } from '@/lib/relative-time'
import { PendingReviews } from '@/components/pm/pending-reviews'
import { FirstSteps } from '@/components/dashboard/first-steps'

/** KPI πλακίδιο — clickable, πάει στη σχετική οθόνη. Το χρώμα «alert» τραβά το
 * μάτι όταν υπάρχει εκκρεμότητα (αριθμός > 0). */
function Kpi({ href, icon: Icon, value, label, alert }: {
  href: string; icon: typeof FolderKanban; value: number; label: string; alert?: boolean
}) {
  const hot = alert && value > 0
  return (
    <Link
      href={href}
      className="glass group flex items-center gap-3 rounded-[18px] px-4 py-3.5 transition-transform hover:-translate-y-0.5"
    >
      <span
        className="flex size-10 shrink-0 items-center justify-center rounded-xl"
        style={hot ? { background: 'var(--coral-soft)', color: 'var(--coral)' } : { background: 'var(--muted)', color: 'var(--foreground)' }}
      >
        <Icon className="size-5" strokeWidth={1.8} aria-hidden />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-2xl font-bold leading-none tabular-nums" style={hot ? { color: 'var(--coral)' } : undefined}>{value}</span>
        <span className="mt-1 block text-[0.71875rem] leading-tight text-muted-foreground">{label}</span>
      </span>
      <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
    </Link>
  )
}

export default async function DashboardPage() {
  const [notifications, summary] = await Promise.all([getNotifications(8), getDashboardSummary()])

  return (
    <div>
      <PageHeader
        breadcrumb={<>Καθημερινά <span aria-hidden>›</span></>}
        title="Κέντρο ελέγχου"
        subtitle="Τι εκκρεμεί σήμερα και ποια είναι η επόμενη ενέργεια — όλα από εδώ."
      />

      {/* Καθοδήγηση για νέους — κλείνει & θυμάται */}
      <FirstSteps />

      {/* KPIs — η κατάσταση με μια ματιά */}
      <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
        <Kpi href="/programs" icon={FolderKanban} value={summary.activeApplications} label="Ενεργά έργα" />
        <Kpi href="#pending" icon={FileCheck2} value={summary.pendingReviews} label="Εγκρίσεις εκκρεμούν" alert />
        <Kpi href="/leads" icon={PhoneCall} value={summary.leadsToContact} label="Leads προς επικοινωνία" alert />
        <Kpi href="/assignments" icon={CalendarClock} value={summary.deadlinesThisWeek} label="Προθεσμίες αυτή την εβδομάδα" alert />
      </div>

      {/* Εγκρίσεις προς επιβεβαίωση (inline Έγκριση/Απόρριψη) */}
      <div id="pending" className="scroll-mt-4">
        <PendingReviews />
      </div>

      {/* Ειδοποιήσεις — με κουμπιά ενεργειών */}
      <section className="glass mt-3 px-4 pt-3.5 pb-3">
        <header className="mb-2.5 flex items-center gap-2">
          <span className="flex size-[1.75rem] items-center justify-center rounded-[0.6875rem]" style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}>
            <Bell className="size-[0.9375rem]" strokeWidth={1.8} />
          </span>
          <h2 className="text-[0.8125rem] font-bold text-foreground">Ειδοποιήσεις</h2>
        </header>

        {notifications.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border px-4 py-8 text-center text-[0.75rem] text-muted-foreground">
            Καμία ειδοποίηση προς το παρόν — όλα ήρεμα.
          </div>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {notifications.map(n => {
              const actions = notifActions(n)
              return (
                <li key={n.id} className="rounded-xl border border-border bg-card/60 px-3 py-2.5">
                  <div className="flex items-start gap-2">
                    {!n.read && <span className="mt-1.5 size-1.5 shrink-0 rounded-full" style={{ background: 'var(--coral)' }} aria-hidden />}
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start gap-2">
                        <span className={`min-w-0 flex-1 text-[0.8125rem] ${n.read ? 'font-medium' : 'font-bold'} text-foreground`}>{n.title}</span>
                        <span className="shrink-0 text-[0.6875rem] text-muted-foreground tabular-nums">{relativeTime(n.createdAt)}</span>
                      </div>
                      {n.body && <p className="mt-0.5 line-clamp-2 text-[0.75rem] text-muted-foreground">{n.body}</p>}
                      {actions.length > 0 && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {actions.map((a, i) => (
                            <Link
                              key={i}
                              href={a.href}
                              className={a.kind === 'primary'
                                ? 'inline-flex items-center gap-1 rounded-full bg-primary px-3 py-1 text-[0.71875rem] font-semibold text-primary-foreground transition-opacity hover:opacity-90'
                                : 'inline-flex items-center gap-1 rounded-full border border-border px-3 py-1 text-[0.71875rem] font-semibold text-foreground transition-colors hover:bg-muted'}
                            >
                              {a.label}
                            </Link>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </section>
    </div>
  )
}
