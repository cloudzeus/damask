import Link from 'next/link'
import { getPortalDashboardByToken } from '@/lib/pm/portal-public'
import { PortalInvalid } from '@/components/portal/portal-invalid'

export const dynamic = 'force-dynamic'

/** Ετικέτες για το DocumentRequestStatus subset που επιστρέφει το dashboard (PENDING/UPLOADED). */
const REQUEST_STATUS_LABELS: Record<string, string> = {
  PENDING: 'Εκκρεμεί',
  UPLOADED: 'Ανέβηκε',
}
const requestStatusLabel = (s: string) => REQUEST_STATUS_LABELS[s] ?? s

/**
 * Δημόσιο (χωρίς auth), read-only dashboard προόδου έργων μέσω magic-link
 * (C2d). Καμία ενέργεια εδώ — το ανέβασμα δικαιολογητικών γίνεται μέσω του
 * ξεχωριστού per-request email link (/portal/upload/[token]). Δεν
 * τυπώνουμε κανένα token/σύνδεσμο στη σελίδα — τα δεδομένα dashboard δεν
 * το περιέχουν καν (βλ. PortalDashboard type στο portal-public.ts).
 */
export default async function PortalAccessPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const d = await getPortalDashboardByToken(token)
  if (!d.ok) return <PortalInvalid />

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center px-6 py-12">
      <div className="w-full max-w-2xl">
        <div className="stagger mb-6 text-center">
          <Link href="/" className="wordmark mb-6 inline-flex text-[18px] text-foreground">
            DAMASK
          </Link>
          <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
            {d.customerName}
          </p>
          <h1 className="text-[22px]">Πρόοδος έργων</h1>
        </div>

        {d.applications.length === 0 ? (
          <div className="glass stagger p-8 text-center text-sm text-muted-foreground">
            Δεν υπάρχουν ενεργά έργα αυτή τη στιγμή.
          </div>
        ) : (
          <div className="flex flex-col gap-3">
            {d.applications.map((app, i) => (
              <div key={i} className="glass stagger p-5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <h2 className="text-[15px] font-semibold text-foreground">{app.programTitle}</h2>
                  <span className="badge-pill info shrink-0">{app.stage}</span>
                </div>
                <p
                  className="mb-2 text-[12.5px] font-semibold"
                  style={app.overdueObligations > 0 ? { color: 'var(--coral)' } : undefined}
                >
                  {app.openObligations} ανοιχτές / {app.overdueObligations} εκπρόθεσμες
                </p>

                {app.openRequests.length > 0 && (
                  <div className="mt-3 border-t border-border pt-3">
                    <p className="mb-1.5 text-[11.5px] font-semibold text-muted-foreground">
                      Εκκρεμή αιτήματα εγγράφων:
                    </p>
                    <ul className="flex flex-col gap-1">
                      {app.openRequests.map((r, j) => (
                        <li key={j} className="flex items-center justify-between gap-2 text-[12.5px]">
                          <span className="min-w-0 truncate">{r.title}</span>
                          <span className="badge-pill muted shrink-0">{requestStatusLabel(r.status)}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
