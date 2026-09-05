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
import { PageHeader } from '@/components/ui/page-header'

export default async function SettingsPage() {
  const session = await requirePermission('settings.manage')
  const isSuperAdmin = session.user.role === 'SUPER_ADMIN'
  const enabledObjects = isSuperAdmin ? ((await getSetting<string[]>('objects.enabled')) ?? []) : []
  const connected = isSuperAdmin ? await isSoftOneConnected() : false
  const syncConfigs = connected ? await getSyncConfigs() : null

  return (
    <div>
      <PageHeader
        breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>}
        title="Ρυθμίσεις"
        subtitle="Στοιχεία εταιρείας, διασυνδέσεις με εξωτερικές υπηρεσίες, προεπιλογές SEO, αντίγραφα ασφαλείας."
      />

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
