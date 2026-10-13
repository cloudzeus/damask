import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** Gated προβολή αρχείου «Προς καταχώριση» (προσφορά/παραστατικό) από το ιδιωτικό BunnyCDN. Gate: 'programs.manage'. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('programs.manage')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  }
  const { id } = await params
  const row = await prisma.applicationInboxDoc.findUnique({ where: { id }, select: { storageKey: true, fileName: true, mimeType: true } })
  if (!row) return NextResponse.json({ error: 'Δεν βρέθηκε.' }, { status: 404 })
  let bytes: Buffer
  try { bytes = await bunnyDownload(row.storageKey) } catch { return NextResponse.json({ error: 'Αποτυχία λήψης.' }, { status: 502 }) }
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': row.mimeType,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(row.fileName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
