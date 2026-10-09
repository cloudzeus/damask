import { listMyDocuments } from '@/lib/pm/portal-documents'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { MyDocuments } from '../../_components/my-documents'
import { PortalBanner, PreviewNote } from '../../_components/portal-banner'

export const metadata = { title: 'Δικαιολογητικά — Portal World Wide Associates' }

export default async function PortalDocuments({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const [docs, dash] = await Promise.all([listMyDocuments(preview || undefined), getContactPortalDashboard(preview || undefined)])
  return (
    <>
      <PortalBanner eyebrow={dash.ok ? dash.companyName : null} title="Δικαιολογητικά" lead="Όλα τα έγγραφα της επιχείρησής σας σε ένα σημείο. Ό,τι ισχύει, το χρησιμοποιούμε σε κάθε νέο πρόγραμμα — δεν σας το ξαναζητάμε." photo="startup" />
      <main>
        <div className="p-wrap p-stack">
          {dash.ok && dash.preview && <PreviewNote name={dash.contactName} />}
          {docs.ok ? <MyDocuments documents={docs.documents} types={docs.types} preview={docs.preview} /> : <div className="p-empty"><p>Δεν έχετε πρόσβαση.</p></div>}
        </div>
      </main>
    </>
  )
}
