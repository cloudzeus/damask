import Link from 'next/link'
import { notFound } from 'next/navigation'
import { PROCESS_GUIDES } from '@/lib/pm/portal-guides'
import { GuideWizard } from '../../../_components/guide-wizard'
import { PortalBanner, withPreview } from '../../../_components/portal-banner'

export function generateMetadata() { return { title: 'Οδηγός — Portal World Wide Associates' } }

export default async function PortalGuide({ params, searchParams }: { params: Promise<{ slug: string }>; searchParams: Promise<{ preview?: string }> }) {
  const [{ slug }, { preview }] = await Promise.all([params, searchParams])
  const guide = PROCESS_GUIDES.find(g => g.slug === slug)
  if (!guide) notFound()
  return (
    <>
      <PortalBanner eyebrow="Οδηγός" title={guide.title} lead={guide.summary} photo="startup">
        <p style={{ marginTop: 12 }}><Link href={withPreview('/portal/odigoi', preview)} style={{ color: '#fff', textDecoration: 'underline' }}>← Όλοι οι οδηγοί</Link></p>
      </PortalBanner>
      <main><div className="p-wrap p-stack">
        <GuideWizard guide={guide} preview={preview} />
        <p className="p-muted" style={{ fontSize: 13, margin: 0 }}>Γενικές οδηγίες· οι ακριβείς όροι ορίζονται σε κάθε πρόσκληση. Για το δικό σας έργο ρωτήστε τον Thanos ή τον σύμβουλό σας.</p>
      </div></main>
    </>
  )
}
