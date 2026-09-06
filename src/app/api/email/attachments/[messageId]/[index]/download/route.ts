import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

/**
 * Staff download συνημμένου email (private storage) → streamed. Gated customer.view.
 * Legacy attachments με public url → redirect.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

type StoredAttachment = { name?: string; key?: string; url?: string; mime?: string }

export async function GET(req: Request, ctx: { params: Promise<{ messageId: string; index: string }> }) {
  const session = await auth()
  if (!can(session, 'customer.view')) {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  }
  const { messageId, index } = await ctx.params
  const msg = await prisma.emailMessage.findUnique({ where: { id: messageId }, select: { attachments: true } })
  const list = Array.isArray(msg?.attachments) ? (msg!.attachments as unknown as StoredAttachment[]) : []
  const att = list[Number(index)]
  if (!att || (!att.key && !att.url)) return NextResponse.json({ error: 'Το συνημμένο δεν βρέθηκε.' }, { status: 404 })
  if (!att.key && att.url) return NextResponse.redirect(att.url)

  const inline = new URL(req.url).searchParams.get('disp') === 'inline'
  try {
    const buf = await bunnyDownload(att.key!)
    const filename = encodeURIComponent(att.name ?? 'attachment')
    return new NextResponse(new Uint8Array(buf), {
      headers: {
        'Content-Type': att.mime || 'application/octet-stream',
        'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${filename}`,
        'Content-Length': String(buf.length),
      },
    })
  } catch {
    return NextResponse.json({ error: 'Αδυναμία λήψης.' }, { status: 502 })
  }
}
