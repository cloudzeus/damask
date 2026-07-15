import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { bunnyGetObjectResponse } from '@/lib/bunny-storage'

export const runtime = 'nodejs'
export const maxDuration = 120

/** Λήψη ενός DB backup — gated settings.manage (ίδιο idiom ελέγχου με
 * /api/media/upload). Streaming pass-through από το BunnyCDN (χωρίς να μπει
 * ολόκληρο το dump στη μνήμη του Node process) — τα backups ΔΕΝ είναι ποτέ
 * δημόσια προσβάσιμα από pull zone URL, μόνο μέσω αυτού του gated route. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!can(session, 'settings.manage')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης αντιγράφων ασφαλείας.' }, { status: 403 })
  }

  const { id } = await params
  const backup = await prisma.dbBackup.findUnique({ where: { id } })
  if (!backup) {
    return NextResponse.json({ error: 'Το backup δεν βρέθηκε.' }, { status: 404 })
  }
  if (backup.status !== 'READY' && backup.status !== 'RESTORING') {
    return NextResponse.json({ error: `Δεν υπάρχει διαθέσιμο αρχείο — κατάσταση backup: ${backup.status}.` }, { status: 409 })
  }

  let upstream: Response
  try {
    upstream = await bunnyGetObjectResponse(backup.storageKey)
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία σύνδεσης με το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  if (upstream.status === 404) {
    return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε στο BunnyCDN.' }, { status: 404 })
  }
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json({ error: 'Το BunnyCDN απέρριψε τη λήψη.' }, { status: 502 })
  }

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${backup.filename}"`,
      'Content-Length': String(backup.sizeBytes),
      'Cache-Control': 'private, no-store',
    },
  })
}
