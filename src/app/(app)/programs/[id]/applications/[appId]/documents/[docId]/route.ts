import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/**
 * requirePmAccess: ίδιο idiom με src/lib/pm/actions.ts — δέχεται όποιον έχει
 * `pm.work` (ανάθεση δουλειάς) Ή `pm.manage` (πλήρης πρόσβαση PM). Δοκιμάζει
 * πρώτα το `pm.work` (κοινή περίπτωση) και μόνο αν αποτύχει δοκιμάζει
 * `pm.manage`· αν και τα δύο αποτύχουν πετάει το ΑΡΧΙΚΟ σφάλμα.
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
 * Gated + scoped λήψη ενός εγγράφου αίτησης (ApplicationDocument) από το
 * ιδιωτικό BunnyCDN — ΠΟΤΕ δημόσιο pull-zone URL, πάντα μέσα από αυτό το
 * route (ίδιο idiom με src/app/(app)/tax-templates/[id]/page-image/route.ts).
 *
 * Scope: όποιος έχει `pm.manage` βλέπει τα πάντα (ίδιο με
 * visibleApplicationWhere στο src/lib/pm/scoping.ts). Όποιος έχει μόνο
 * `pm.work` βλέπει ΜΟΝΟ έγγραφα αιτήσεων όπου είναι manager ή processor —
 * ελέγχεται εδώ ρητά (χωρίς αυτό, ΚΑΘΕ pm.work χρήστης θα μπορούσε να
 * κατεβάσει έγγραφο ΟΠΟΙΑΣΔΗΠΟΤΕ αίτησης μαντεύοντας/βρίσκοντας το docId).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; appId: string; docId: string }> },
) {
  let session: Session
  try {
    session = await requirePmAccess()
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης εγγράφου έργου.' }, { status: 403 })
  }

  const { docId } = await params
  const doc = await prisma.applicationDocument.findUnique({
    where: { id: docId },
    include: { application: { select: { id: true, managerId: true, processorId: true } } },
  })
  if (!doc) {
    return NextResponse.json({ error: 'Το έγγραφο δεν βρέθηκε.' }, { status: 404 })
  }

  const permissions = session.user.permissions ?? []
  if (!permissions.includes('pm.manage')) {
    const userId = session.user.id
    const isAssigned = doc.application.managerId === userId || doc.application.processorId === userId
    if (!isAssigned) {
      return NextResponse.json({ error: 'Δεν έχεις πρόσβαση σε αυτό το έγγραφο.' }, { status: 403 })
    }
  }

  let bytes: Buffer
  try {
    bytes = await bunnyDownload(doc.storageKey)
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία λήψης εγγράφου από το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType ?? 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.name)}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
