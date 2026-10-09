import Link from 'next/link'
import { LuClock, LuRoute } from 'react-icons/lu'
import { PROCESS_GUIDES } from '@/lib/pm/portal-guides'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { PortalBanner, PreviewNote, withPreview } from '../../_components/portal-banner'

export const metadata = { title: 'Οδηγοί — Portal World Wide Associates' }

/** Οδηγοί βήμα-βήμα: ένας για κάθε έργο του πελάτη + οι γενικές διαδικασίες. */
export default async function PortalGuides({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const dash = await getContactPortalDashboard(preview || undefined)
  const pv = (h: string) => withPreview(h, preview)
  return (
    <>
      <PortalBanner eyebrow={dash.ok ? dash.companyName : null} title="Οδηγοί βήμα-βήμα" lead="Απλές οδηγίες για κάθε διαδικασία — τι γίνεται, τι κάνετε εσείς και τι να προσέξετε." photo="consulting" thanos />
      <main>
        <div className="p-wrap p-stack">
          {dash.ok && dash.preview && <PreviewNote name={dash.contactName} />}
          {dash.ok && dash.applications.length > 0 && (
            <>
              <div className="p-section-title"><h2>Ο οδηγός κάθε έργου σας</h2></div>
              <div className="p-guides">
                {dash.applications.map(a => (
                  <Link key={a.applicationId} className="p-project" href={pv(`/portal/odigoi/erga/${a.applicationId}`)}>
                    <span className="p-badge"><LuRoute aria-hidden /> Βήμα {a.journey.currentIndex + 1} από {a.journey.steps.length}</span>
                    <h3>{a.programTitle}</h3>
                    <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>Τι γίνεται σε κάθε στάδιο του έργου σας και τι κάνετε εσείς — ξεκινά από εκεί που βρίσκεστε τώρα.</p>
                    <div className="foot"><span /><span>Άνοιγμα οδηγού →</span></div>
                  </Link>
                ))}
              </div>
            </>
          )}
          <div className="p-section-title"><h2>Διαδικασίες</h2></div>
          <div className="p-guides">
            {PROCESS_GUIDES.map(g => (
              <Link key={g.slug} className="p-project" href={pv(`/portal/odigoi/${g.slug}`)}>
                <h3>{g.title}</h3>
                <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>{g.summary}</p>
                <div className="foot"><span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LuClock aria-hidden style={{ width: 14, height: 14 }} /> {g.steps.length} βήματα · {g.minutes}′</span><span>Ξεκινήστε →</span></div>
              </Link>
            ))}
          </div>
        </div>
      </main>
    </>
  )
}
