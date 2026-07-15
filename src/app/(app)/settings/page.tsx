import { requirePermission } from '@/lib/rbac-server'
import { SettingsTabs } from './settings-tabs'
import { CompanyTab } from './company-tab'
import { IntegrationsTab } from './integrations-tab'
import { SeoTab } from './seo-tab'

export default async function SettingsPage() {
  await requirePermission('settings.manage')

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Ρυθμίσεις</b>
          </div>
          <h1 className="text-[22px]">Ρυθμίσεις</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Στοιχεία εταιρείας, διασυνδέσεις με εξωτερικές υπηρεσίες, προεπιλογές SEO.
          </p>
        </div>
      </div>

      <SettingsTabs
        company={<CompanyTab />}
        integrations={<IntegrationsTab />}
        seo={<SeoTab />}
      />
    </div>
  )
}
