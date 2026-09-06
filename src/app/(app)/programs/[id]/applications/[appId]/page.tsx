import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { getApplication } from '@/lib/pm/actions'
import { ApplicationHub } from '@/components/pm/application-hub'

/**
 * Το «Έργο hub» (Task 10) — κεντρική οθόνη PM για μία αίτηση προγράμματος.
 * requirePermission('pm.work') εδώ είναι το broad gate (SUPER_ADMIN/ADMIN
 * το έχουν μέσω ROLE_DEFAULTS=ALL, MANAGER/EMPLOYEE ρητά — ίδιο idiom με
 * src/app/(app)/pm/page.tsx). Το ΠΡΑΓΜΑΤΙΚΟ scoping (ποιος βλέπει ΠΟΙΑ
 * αίτηση) γίνεται μέσα στο getApplication → requireVisibleApplication.
 * Το breadcrumb + επικεφαλίδα ζουν πλέον ΜΕΣΑ στο ApplicationHub (μία κάρτα,
 * χωρίς διπλή εμφάνιση πελάτη/προγράμματος).
 */
export default async function ApplicationHubPage({ params }: { params: Promise<{ id: string; appId: string }> }) {
  const session = await requirePermission('pm.work')
  const { appId } = await params
  const app = await getApplication(appId)

  return <ApplicationHub app={app} canSend={can(session, 'customer.edit')} />
}
