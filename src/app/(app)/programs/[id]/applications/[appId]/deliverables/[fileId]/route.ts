import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/**
 * requirePmAccess: ίδιο idiom με src/lib/pm/actions.ts και με το αδελφό
 * route src/app/(app)/programs/[id]/applications/[appId]/documents/
 * [docId]/route.ts — δέχεται όποιον έχει `pm.work` (ανάθεση δουλειάς) Ή
 * `pm.manage` (πλήρης πρόσβαση PM). Δοκιμάζει πρώτα το `pm.work` (κοινή
 * περίπτωση) και μόνο αν αποτύχει δοκιμάζει `pm.manage`· αν και τα δύο
 * αποτύχουν πετάει το ΑΡΧΙΚΟ σφάλμα.
 */
async function requirePmAccess(): Promise<Session> {
  try {
    return await requirePermission('pm.work')
  } catch (err) {
    try {
      return await requirePermission('pm.manage')
    } catch {
      throw err
    }
  }
}

/**
 * Gated + scoped λήψη ενός αρχείου παραδοτέου (DeliverableFile) από το
 * ιδιωτικό BunnyCDN — ΠΟΤΕ δημόσιο pull-zone URL, πάντα μέσα από αυτό το
 * route (ίδιο idiom με το documents/[docId]/route.ts).
 *
 * Scope: όποιος έχει `pm.manage` βλέπει τα πάντα. Όποιος έχει μόνο `pm.work`
 * βλέπει ΜΟΝΟ αρχεία task->deliverable->application όπου είναι manager ή
 * processor — ελέγχεται εδώ ρητά (χωρίς αυτό, ΚΑΘΕ pm.work χρήστης θα
 * μπορούσε να κατεβάσει αρχείο ΟΠΟΙΑΣΔΗΠΟΤΕ αίτησης μαντεύοντας/βρίσκοντας
 * το fileId) — ανεξάρτητο scoping από τις server actions του actions.ts.
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; appId: string; fileId: string }> },
) {
  let session: Session
  try {
    session = await requirePmAccess()
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης αρχείου παραδοτέου.' }, { status: 403 })
  }

  const { fileId } = await params
  const file = await prisma.deliverableFile.findUnique({
    where: { id: fileId },
    include: {
      task: {
        select: {
          deliverable: {
            select: {
              application: { select: { id: true, managerId: true, processorId: true } },
            },
          },
        },
      },
    },
  })
  if (!file) {
    return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 })
  }

  const application = file.task.deliverable.application

  const permissions = session.user.permissions ?? []
  if (!permissions.includes('pm.manage')) {
    const userId = session.user.id
    const isAssigned = application.managerId === userId || application.processorId === userId
    if (!isAssigned) {
      return NextResponse.json({ error: 'Δεν έχεις πρόσβαση σε αυτό το αρχείο.' }, { status: 403 })
    }
  }

  let bytes: Buffer
  try {
    bytes = await bunnyDownload(file.storageKey)
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία λήψης αρχείου από το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': file.mimeType ?? 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(file.name)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
