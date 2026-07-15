import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import type { ImportTotals } from '@/lib/import/product-upsert'

/**
 * GET /api/import/status/[id] — progress polling για μεγάλες εισαγωγές
 * (Βήμα 5 Εκτέλεση → pg-boss job, βλ. src/server/queue-start.ts). Το
 * step-execute.tsx κάνει poll κάθε ~1.5s μέχρι status DONE/FAILED.
 */
export async function GET(_req: Request, ctx: RouteContext<'/api/import/status/[id]'>) {
  const session = await auth()
  if (!can(session, 'import.run')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα προβολής εισαγωγών.' }, { status: 403 })
  }

  const { id } = await ctx.params
  const job = await prisma.importJob.findUnique({ where: { id } })
  if (!job) {
    return NextResponse.json({ error: 'Η εισαγωγή δεν βρέθηκε.' }, { status: 404 })
  }

  return NextResponse.json({
    id: job.id,
    status: job.status,
    totals: (job.totals as ImportTotals | null) ?? null,
  })
}
