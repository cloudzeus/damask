'use server'

import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'
import { visibleApplicationWhere } from '@/lib/pm/scoping'
import { listMyPendingReviews } from '@/lib/file-requests/review'

/**
 * Μετρήσεις για το «Κέντρο ελέγχου» (dashboard). Scoped ανά χρήστη: όποιος δεν
 * έχει pm.manage βλέπει μόνο τα δικά του έργα (manager/processor). Κάθε μέτρηση
 * αντιστοιχεί σε ένα clickable KPI tile που πηγαίνει στη σχετική οθόνη.
 */

export type DashboardSummary = {
  activeApplications: number
  pendingReviews: number
  leadsToContact: number
  deadlinesThisWeek: number
}

export async function getDashboardSummary(): Promise<DashboardSummary> {
  const session = await auth()
  const userId = session?.user?.id
  if (!userId) return { activeApplications: 0, pendingReviews: 0, leadsToContact: 0, deadlinesThisWeek: 0 }
  const scope = visibleApplicationWhere({ id: userId, permissions: session.user.permissions ?? [] })

  const weekAhead = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)

  const [activeApplications, pending, leadsToContact, deadlinesThisWeek] = await Promise.all([
    // Ενεργά έργα στο πεδίο ορατότητας
    prisma.programApplication.count({ where: { status: 'ACTIVE', ...scope } }),
    // Δικαιολογητικά που ανέβηκαν & περιμένουν επιβεβαίωση (ίδιο scoping με το panel)
    listMyPendingReviews(),
    // Leads ανατεθειμένα σε εμένα, ανοιχτά (προς επικοινωνία)
    prisma.lead.count({ where: { assignedToId: userId, status: { in: ['ASSIGNED', 'IN_PROGRESS'] } } }),
    // Υποχρεώσεις με προθεσμία μέσα στην εβδομάδα, ανοιχτές (στα ορατά έργα)
    prisma.applicationObligation.count({
      where: {
        application: scope,
        status: { in: ['PENDING', 'IN_PROGRESS', 'SUBMITTED'] },
        dueDate: { gte: new Date(), lte: weekAhead },
      },
    }),
  ])

  return { activeApplications, pendingReviews: pending.length, leadsToContact, deadlinesThisWeek }
}
