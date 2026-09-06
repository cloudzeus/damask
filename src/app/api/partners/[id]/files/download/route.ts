import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'
import { buildTrdrFolderPath } from '@/lib/trdr/cdn-folder'

/**
 * Staff download αρχείου από τον φάκελο πελάτη (private) → streamed. Gated
 * customer.view. Το key ΠΡΕΠΕΙ να είναι μέσα στη ρίζα του συγκεκριμένου πελάτη.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif',
  webp: 'image/webp', svg: 'image/svg+xml', bmp: 'image/bmp', avif: 'image/avif',
  txt: 'text/plain', csv: 'text/csv',
  doc: 'application/msword', docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xls: 'application/vnd.ms-excel', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
}
function mimeByExt(name: string): string {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  return (ext && MIME_BY_EXT[ext]) || 'application/octet-stream'
}

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!can(session, 'customer.view')) return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })

  const { id } = await ctx.params
  const key = new URL(req.url).searchParams.get('key') ?? ''
  if (!key || key.includes('..')) return NextResponse.json({ error: 'Μη έγκυρο αρχείο.' }, { status: 400 })

  const trdr = await prisma.trdr.findUnique({ where: { id }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
  if (!trdr) return NextResponse.json({ error: 'Ο συναλλασσόμενος δεν βρέθηκε.' }, { status: 404 })
  const root = trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
  if (!key.startsWith(root)) return NextResponse.json({ error: 'Το αρχείο δεν ανήκει στον πελάτη.' }, { status: 403 })

  const inline = new URL(req.url).searchParams.get('disp') === 'inline'
  try {
    const buf = await bunnyDownload(key)
    const rawName = key.split('/').pop() || 'file'
    const filename = encodeURIComponent(rawName)
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': mimeByExt(rawName),
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
        'Content-Length': String(buf.length),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Αδυναμία λήψης αρχείου.' }, { status: 502 })
  }
}
