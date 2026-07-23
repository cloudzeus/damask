import { NextResponse } from 'next/server'
import type { Session } from 'next-auth'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'
import { CERT_FILE_KINDS, type CertFileKind } from '@/lib/pm/cert-prep'

export const runtime = 'nodejs'

/**
 * requirePmAccess: ίδιο idiom με src/lib/pm/actions.ts και το αδελφό route
 * .../documents/[docId]/route.ts — δέχεται όποιον έχει `pm.work` (ανάθεση
 * δουλειάς) Ή `pm.manage` (πλήρης πρόσβαση PM). Δοκιμάζει πρώτα το `pm.work`
 * (κοινή περίπτωση) και μόνο αν αποτύχει δοκιμάζει `pm.manage`· αν και τα
 * δύο αποτύχουν πετάει το ΑΡΧΙΚΟ σφάλμα.
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

const EXT_MIME: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  gif: 'image/gif',
  pdf: 'application/pdf',
}

function mimeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return EXT_MIME[ext] ?? 'application/octet-stream'
}

/**
 * Gated + scoped λήψη ενός αρχείου φυσικής πιστοποίησης παγίου
 * (ProgramExpenseCertification: photo/bankStatement/newUnusedCert) από το
 * ιδιωτικό BunnyCDN — ΠΟΤΕ δημόσιο pull-zone URL, πάντα μέσα από αυτό το
 * route (ίδιο idiom με το αδελφό .../documents/[docId]/route.ts).
 *
 * Scope: όποιος έχει `pm.manage` βλέπει τα πάντα. Όποιος έχει μόνο
 * `pm.work` βλέπει ΜΟΝΟ αρχεία δαπανών αιτήσεων όπου είναι manager ή
 * processor — ελέγχεται εδώ ρητά (χωρίς αυτό, ΚΑΘΕ pm.work χρήστης θα
 * μπορούσε να κατεβάσει αρχείο πιστοποίησης ΟΠΟΙΑΣΔΗΠΟΤΕ αίτησης μαντεύοντας
 * expenseId/kind).
 */
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string; appId: string; expenseId: string; kind: string }> },
) {
  let session: Session
  try {
    session = await requirePmAccess()
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης αρχείου πιστοποίησης.' }, { status: 403 })
  }

  const { expenseId, kind } = await params
  if (!CERT_FILE_KINDS.includes(kind as CertFileKind)) {
    return NextResponse.json({ error: 'Άγνωστος τύπος αρχείου.' }, { status: 404 })
  }

  const expense = await prisma.programExpense.findUnique({
    where: { id: expenseId },
    include: {
      application: { select: { id: true, managerId: true, processorId: true } },
      certification: { select: { photoKey: true, bankStatementKey: true, newUnusedCertKey: true } },
    },
  })
  if (!expense) {
    return NextResponse.json({ error: 'Η δαπάνη δεν βρέθηκε.' }, { status: 404 })
  }

  const permissions = session.user.permissions ?? []
  if (!permissions.includes('pm.manage')) {
    const userId = session.user.id
    const isAssigned = expense.application.managerId === userId || expense.application.processorId === userId
    if (!isAssigned) {
      return NextResponse.json({ error: 'Δεν έχεις πρόσβαση σε αυτό το αρχείο.' }, { status: 403 })
    }
  }

  const keyMap: Record<CertFileKind, string | null | undefined> = {
    photo: expense.certification?.photoKey,
    bankStatement: expense.certification?.bankStatementKey,
    newUnusedCert: expense.certification?.newUnusedCertKey,
  }
  const key = keyMap[kind as CertFileKind]
  if (!key) {
    return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 })
  }

  let bytes: Buffer
  try {
    bytes = await bunnyDownload(key)
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία λήψης αρχείου από το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mimeForKey(key),
      'Content-Length': String(bytes.length),
      'Content-Disposition': 'inline',
      'Cache-Control': 'private, no-store',
    },
  })
}
