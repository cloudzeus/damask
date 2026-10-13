import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** Gated προβολή του εγκριτικού ενός έργου από το ιδιωτικό BunnyCDN. Gate: 'programs.manage'. */
export async function GET(_request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    await requirePermission('programs.manage')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  }
  const { applicationId } = await params
  const row = await prisma.applicationApproval.findUnique({ where: { applicationId }, select: { docKey: true, docName: true } })
  if (!row?.docKey) return NextResponse.json({ error: 'Δεν βρέθηκε.' }, { status: 404 })
  let bytes: Buffer
  try { bytes = await bunnyDownload(row.docKey) } catch { return NextResponse.json({ error: 'Αποτυχία λήψης.' }, { status: 502 }) }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.docName ?? 'egkritiki.pdf')}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
