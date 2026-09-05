import Link from 'next/link'
import { requirePermission } from '@/lib/rbac-server'
import { can } from '@/lib/rbac'
import { getApplication } from '@/lib/pm/actions'
import { ApplicationHub } from '@/components/pm/application-hub'
import { PageHeader } from '@/components/ui/page-header'

/**
 * Το «Έργο hub» (Task 10) — κεντρική οθόνη PM για μία αίτηση προγράμματος.
 * requirePermission('pm.work') εδώ είναι το broad gate (SUPER_ADMIN/ADMIN
 * το έχουν μέσω ROLE_DEFAULTS=ALL, MANAGER/EMPLOYEE ρητά — ίδιο idiom με
 * src/app/(app)/pm/page.tsx). Το ΠΡΑΓΜΑΤΙΚΟ scoping (ποιος βλέπει ΠΟΙΑ
 * αίτηση) γίνεται μέσα στο getApplication → requireVisibleApplication
 * (src/lib/pm/actions.ts) — πετάει notFound() αν η αίτηση δεν είναι ορατή
 * στον χρήστη (π.χ. pm.work χωρίς να είναι manager/processor της).
 */
export default async function ApplicationHubPage({ params }: { params: Promise<{ id: string; appId: string }> }) {
  const session = await requirePermission('pm.work')
  const { appId } = await params
  const app = await getApplication(appId)

  return (
    <div>
      <PageHeader
        breadcrumb={
          <>
            <Link href="/programs" className="hover:text-foreground hover:underline">Προγράμματα</Link>{' '}
            <span aria-hidden>›</span>{' '}
            <Link href={`/programs/${app.programId}`} className="hover:text-foreground hover:underline">{app.programTitle}</Link>{' '}
            <span aria-hidden>›</span> <b className="text-foreground">Έργο</b>
          </>
        }
        title={app.trdrName}
        subtitle={<>Στάδιο, αναθέσεις, αξιολόγηση και υποχρεώσεις της αίτησης στο πρόγραμμα «{app.programTitle}».</>}
      />

      <ApplicationHub app={app} canSend={can(session, 'customer.edit')} />
    </div>
  )
}
