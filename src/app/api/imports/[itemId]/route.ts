import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** Προβολή του προσωρινού αντιγράφου ενός αρχείου μαζικής εισαγωγής (gated customer.edit). */
export async function GET(_req: Request, { params }: { params: Promise<{ itemId: string }> }) {
  const session = await auth()
  if (!can(session, 'customer.edit')) return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  const { itemId } = await params
  const item = await prisma.importItem.findUnique({ where: { id: itemId }, select: { storageKey: true, fileName: true, mimeType: true } })
  if (!item?.storageKey) return NextResponse.json({ error: 'Δεν βρέθηκε.' }, { status: 404 })
  let bytes: Buffer
  try { bytes = await bunnyDownload(item.storageKey) } catch { return NextResponse.json({ error: 'Αποτυχία λήψης.' }, { status: 502 }) }
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': item.mimeType, 'Content-Length': String(bytes.length), 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(item.fileName)}`, 'Cache-Control': 'private, no-store' },
  })
}
