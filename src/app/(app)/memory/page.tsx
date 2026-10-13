import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { requirePermission } from '@/lib/rbac-server'
import { PageHeader } from '@/components/ui/page-header'
import { coreDocumentTypes } from '@/lib/memory/core'
import { MemoryClient } from './memory-client'

/**
 * «Μνήμη γραφείου» (/memory): ερωτήσεις σε φυσική γλώσσα πάνω σε ό,τι ξέρει το γραφείο (προγράμματα, δικαιολογητικά,
 * έντυπα/τιμές εταιριών, εγκριτικά, δαπάνες, αρχεία) με παραπομπές + ο «πυρήνας» δικαιολογητικών που ζητούν τα
 * περισσότερα προγράμματα.
 */
export default async function MemoryPage() {
  await requirePermission('customer.view')
  const [core, session] = await Promise.all([coreDocumentTypes(), auth()])
  return (
    <div>
      <PageHeader
        breadcrumb={<>Ευρωπαϊκά προγράμματα <span aria-hidden>›</span></>}
        title="Μνήμη γραφείου"
        subtitle="Ό,τι έχει μάθει το γραφείο — προγράμματα, δικαιολογητικά, τιμές εταιριών, εγκριτικά, δαπάνες — σε ένα σημείο. Ρωτήστε με απλά λόγια."
      />
      <MemoryClient core={core} canRelink={can(session, 'programs.manage')} canMerge={can(session, 'doctype.manage')} />
    </div>
  )
}
