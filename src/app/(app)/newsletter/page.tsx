import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { listSubscribers, listLeadRequests, listConsents } from '@/lib/newsletter/actions'
import { PageHeader } from '@/components/ui/page-header'
import { NewsletterTabs } from './newsletter-tabs'

export default async function NewsletterPage() {
  const session = await requirePermission('newsletter.view')
  const [subscribers, leadRequests, consents] = await Promise.all([
    listSubscribers(),
    listLeadRequests(),
    listConsents(),
  ])
  const canManage = can(session, 'newsletter.manage')

  const active = subscribers.filter(s => s.status === 'SUBSCRIBED').length

  return (
    <div>
      <PageHeader
        breadcrumb={<>Αρχική <span aria-hidden>›</span> Newsletter</>}
        title="Newsletter"
        subtitle={`${active} ${active === 1 ? 'ενεργή εγγραφή' : 'ενεργές εγγραφές'} · ${subscribers.length} σύνολο`}
      />

      <NewsletterTabs
        subscribers={subscribers}
        leadRequests={leadRequests}
        consents={consents}
        canManage={canManage}
      />
    </div>
  )
}
