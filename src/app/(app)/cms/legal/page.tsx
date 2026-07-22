import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { prisma } from '@/lib/prisma'
import { loadConsentConfig } from '@/lib/settings'
import { relativeTime } from '@/lib/relative-time'
import { LegalTabs } from './legal-tabs'
import { LegalPagesTable, type LegalPageRow } from './legal-pages-table'
import { ConsentModalTab } from './consent-modal-tab'

export default async function CmsLegalPage() {
  const session = await requirePermission('cms.view')
  await assertObjectEnabled('cms-legal')
  const canEdit = session.user.permissions.includes('cms.edit')

  const [pages, consentConfig] = await Promise.all([
    prisma.legalPage.findMany({ include: { translations: true }, orderBy: { createdAt: 'asc' } }),
    loadConsentConfig(),
  ])

  const now = new Date()
  const pageRows: LegalPageRow[] = pages.map(p => {
    const elTranslation = p.translations.find(t => t.locale === 'el')
    return {
      id: p.id,
      slug: p.slug,
      published: p.published,
      titleEl: elTranslation?.title ?? p.slug,
      hasEn: p.translations.some(t => t.locale === 'en'),
      updatedLabel: relativeTime(p.updatedAt, now),
    }
  })

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            CMS <span aria-hidden>›</span> <b className="text-foreground">Νομικά</b>
          </div>
          <h1 className="text-[22px]">Νομικά</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Σελίδες πολιτικών (απόρρητο, όροι, cookies…) και το consent modal του δημόσιου site.
          </p>
        </div>
      </div>

      <LegalTabs
        pages={<LegalPagesTable pages={pageRows} canEdit={canEdit} />}
        consent={canEdit ? <ConsentModalTab initial={consentConfig} /> : <ReadOnlyConsentNotice />}
      />
    </div>
  )
}

function ReadOnlyConsentNotice() {
  return (
    <div className="glass p-4 text-[12.5px] text-muted-foreground">
      Χρειάζεται δικαίωμα επεξεργασίας CMS για να δεις/αλλάξεις τις ρυθμίσεις του consent modal.
    </div>
  )
}
