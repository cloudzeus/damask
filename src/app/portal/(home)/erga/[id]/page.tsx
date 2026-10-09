import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { PortalPrograms } from '../../../_components/portal-programs'
import { PortalBanner, PreviewNote, withPreview } from '../../../_components/portal-banner'

export const metadata = { title: 'Έργο — Portal World Wide Associates' }

/** Αναλυτικός «οδηγός έργου» για ένα πρόγραμμα του πελάτη. */
export default async function PortalProject({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string }> }) {
  const [{ id }, { preview }] = await Promise.all([params, searchParams])
  const dash = await getContactPortalDashboard(preview || undefined)
  const app = dash.ok ? dash.applications.find(a => a.applicationId === id) : null
  if (!dash.ok || !app) notFound()
  return (
    <>
      <PortalBanner eyebrow={dash.companyName} title={app.programTitle} lead={app.journey.steps[app.journey.currentIndex].desc} photo="manufacturing">
        <div className="p-banner-actions">
          <Link className="p-btn p-btn-cyan" href={withPreview(`/portal/odigoi/erga/${app.applicationId}`, preview)}>Οδηγός βήμα-βήμα</Link>
          <Link href={withPreview('/portal/erga', preview)} style={{ color: '#fff', textDecoration: 'underline' }}>← Όλα τα έργα</Link>
        </div>
      </PortalBanner>
      <main>
        <div className="p-wrap p-stack">
          {dash.preview && <PreviewNote name={dash.contactName} />}
          <PortalPrograms applications={[app]} preview={dash.preview} />
        </div>
      </main>
    </>
  )
}
