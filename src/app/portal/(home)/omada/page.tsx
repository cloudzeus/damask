import { listMyTeam } from '@/lib/pm/portal-documents'
import { getContactPortalDashboard } from '@/lib/pm/portal-contact'
import { MyTeam } from '../../_components/my-team'
import { PortalBanner, PreviewNote } from '../../_components/portal-banner'

export const metadata = { title: 'Η ομάδα σας — Portal World Wide Associates' }

export default async function PortalTeam({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const [team, dash] = await Promise.all([listMyTeam(preview || undefined), getContactPortalDashboard(preview || undefined)])
  return (
    <>
      <PortalBanner eyebrow={dash.ok ? dash.companyName : null} title="Η ομάδα σας" lead="Ορίστε ποιος στην επιχείρηση λαμβάνει κάθε ειδοποίηση — λογιστής, υπεύθυνος έργου, νόμιμος εκπρόσωπος." photo="team" />
      <main>
        <div className="p-wrap p-stack">
          {dash.ok && dash.preview && <PreviewNote name={dash.contactName} />}
          {team.ok ? <MyTeam members={team.members} applications={team.applications} preview={team.preview} /> : <div className="p-empty"><p>Δεν έχετε πρόσβαση.</p></div>}
        </div>
      </main>
    </>
  )
}
