import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

/**
 * Staff download ενός ανεβασμένου δικαιολογητικού (private storage) → streamed.
 * Το /api/file-requests/ είναι public στο proxy, οπότε κάνουμε ΡΗΤΟ έλεγχο session
 * εδώ (customer.view). Legacy εγγραφές με public fileUrl → redirect.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

export async function GET(req: Request, ctx: { params: Promise<{ itemId: string }> }) {
  const session = await auth()
  if (!can(session, 'customer.view')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  }
  const { itemId } = await ctx.params
  const item = await prisma.fileRequestItem.findUnique({
    where: { id: itemId },
    select: { fileKey: true, fileUrl: true, fileName: true, mimeType: true },
  })
  if (!item || (!item.fileKey && !item.fileUrl)) {
    return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 })
  }
  // Legacy public URL.
  if (!item.fileKey && item.fileUrl) return NextResponse.redirect(item.fileUrl)

  const inline = new URL(req.url).searchParams.get('disp') === 'inline'
  try {
    const buf = await bunnyDownload(item.fileKey!)
    const filename = encodeURIComponent(item.fileName ?? 'file')
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': item.mimeType || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
        'Content-Length': String(buf.length),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Αδυναμία λήψης αρχείου.' }, { status: 502 })
  }
}
