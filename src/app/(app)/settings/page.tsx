import { requirePermission } from '@/lib/rbac-server'
import { getSetting } from '@/lib/settings'
import { isSoftOneConnected, getSyncConfigs } from '@/lib/sync-config-server'
import { SettingsTabs } from './settings-tabs'
import { CompanyTab } from './company-tab'
import { IntegrationsTab } from './integrations-tab'
import { SeoTab } from './seo-tab'
import { BackupsTab } from './backups-tab'
import { ObjectsTab } from './objects-tab'
import { SyncTab } from './sync-tab'

export default async function SettingsPage() {
  const session = await requirePermission('settings.manage')
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  const enabledObjects = isSuperAdmin ? ((await getSetting<string[]>('objects.enabled')) ?? []) : []
  const connected = isSuperAdmin ? await isSoftOneConnected() : false
  const syncConfigs = connected ? await getSyncConfigs() : null

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Διαχείριση <span aria-hidden>›</span> <b className="text-foreground">Ρυθμίσεις</b>
          </div>
          <h1 className="text-[22px]">Ρυθμίσεις</h1>
          <p className="page-head-subtitle mt-0.5 text-[12.5px]">
            Στοιχεία εταιρείας, διασυνδέσεις με εξωτερικές υπηρεσίες, προεπιλογές SEO, αντίγραφα ασφαλείας.
          </p>
        </div>
      </div>

      <SettingsTabs
        company={<CompanyTab />}
        integrations={<IntegrationsTab />}
        seo={<SeoTab />}
        backups={<BackupsTab />}
        objects={isSuperAdmin ? <ObjectsTab enabled={enabledObjects} /> : undefined}
        sync={syncConfigs ? <SyncTab configs={syncConfigs} /> : undefined}
      />
    </div>
  )
}
