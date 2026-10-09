import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { programGuide } from '@/lib/pm/portal-guides'
import { GuideWizard } from '../../../../_components/guide-wizard'
import { PortalBanner, PreviewNote, withPreview } from '../../../../_components/portal-banner'

export const metadata = { title: 'Οδηγός έργου — Portal World Wide Associates' }

export default async function PortalProjectGuide({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ preview?: string }> }) {
  const [{ id }, { preview }] = await Promise.all([params, searchParams])
  const dash = await getContactPortalDashboard(preview || undefined)
  const app = dash.ok ? dash.applications.find(a => a.applicationId === id) : null
  if (!dash.ok || !app) notFound()
  const guide = programGuide(app)
  return (
    <>
      <PortalBanner eyebrow={app.programTitle} title={guide.title} lead={guide.summary} photo="manufacturing">
        <p style={{ marginTop: 12 }}><Link href={withPreview(`/portal/erga/${app.applicationId}`, preview)} style={{ color: '#fff', textDecoration: 'underline' }}>← Στο έργο</Link></p>
      </PortalBanner>
      <main><div className="p-wrap p-stack">
        {dash.preview && <PreviewNote name={dash.contactName} />}
        <GuideWizard guide={guide} startAt={guide.startAt} preview={preview} />
      </div></main>
    </>
  )
}
