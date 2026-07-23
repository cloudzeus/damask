import Link from 'next/link'
import { requirePermission } from '@/lib/rbac-server'
import { getApplication } from '@/lib/pm/actions'
import { ApplicationHub } from '@/components/pm/application-hub'

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
  await requirePermission('pm.work')
  const { appId } = await params
  const app = await getApplication(appId)

  return (
    <div>
      <div className="mb-4 pt-1.5">
        <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
          <Link href="/programs" className="hover:text-foreground hover:underline">Προγράμματα</Link>{' '}
          <span aria-hidden>›</span>{' '}
          <Link href={`/programs/${app.programId}`} className="hover:text-foreground hover:underline">{app.programTitle}</Link>{' '}
          <span aria-hidden>›</span> <b className="text-foreground">Έργο</b>
        </div>
        <h1 className="text-[22px]">{app.trdrName}</h1>
        <p className="mt-0.5 text-[12.5px] text-muted-foreground">
          Στάδιο, αναθέσεις, αξιολόγηση και υποχρεώσεις της αίτησης στο πρόγραμμα «{app.programTitle}».
        </p>
      </div>

      <ApplicationHub app={app} />
    </div>
  )
}
