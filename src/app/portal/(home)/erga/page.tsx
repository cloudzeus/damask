import Link from 'next/link'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { PortalBanner, PreviewNote, withPreview } from '../../_components/portal-banner'

export const metadata = { title: 'Τα έργα μου — Portal World Wide Associates' }

const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const isDone = (s: string) => s === 'APPROVED' || s === 'SUBMITTED' || s === 'WAIVED'

export default async function PortalProjects({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const dash = await getContactPortalDashboard(preview || undefined)
  const apps = dash.ok ? dash.applications : []
  // Πρώτα όσα θέλουν κάτι από τον πελάτη, μετά τα πιο πρόσφατα.
  const sorted = [...apps].sort((a, b) => b.obligations.filter(o => !isDone(o.status)).length - a.obligations.filter(o => !isDone(o.status)).length)
  return (
    <>
      <PortalBanner eyebrow={dash.ok ? dash.companyName : null} title="Τα έργα μου" lead="Κάθε πρόγραμμα στο οποίο συμμετέχει η επιχείρησή σας — πατήστε για να δείτε πού βρίσκεται και τι χρειάζεται." photo="team" />
      <main>
        <div className="p-wrap p-stack">
          {dash.ok && dash.preview && <PreviewNote name={dash.contactName} />}
          {sorted.length === 0 ? <div className="p-empty"><p className="p-muted">Δεν υπάρχουν έργα ακόμη.</p></div> : (
            <div className="p-projects">
              {sorted.map(a => {
                const todo = a.obligations.filter(o => !isDone(o.status)).length
                return (
                  <Link key={a.applicationId} className="p-project" href={withPreview(`/portal/erga/${a.applicationId}`, preview)}>
                    <h3>{a.programTitle}</h3>
                    <div className="meta">
                      <span className="p-badge">Βήμα {a.journey.currentIndex + 1}/{a.journey.steps.length} · {a.journey.steps[a.journey.currentIndex].label}</span>
                      {todo > 0 ? <span className="p-badge warn">{todo} εκκρεμ{todo === 1 ? 'ές' : 'ή'}</span> : <span className="p-badge ok">Χωρίς εκκρεμότητες</span>}
                    </div>
                    <div className="prog" role="progressbar" aria-valuenow={a.journey.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος έργου"><span style={{ width: `${a.journey.percent}%` }} /></div>
                    <div className="foot"><span>{a.money.budget != null ? `Προϋπολογισμός ${eur(a.money.budget)}` : a.lifecycleLabel}</span><span>Άνοιγμα →</span></div>
                  </Link>
                )
              })}
            </div>
          )}
        </div>
      </main>
    </>
  )
}
