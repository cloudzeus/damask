import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** Gated προβολή/λήψη συμπληρωματικού αρχείου προγράμματος. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requirePermission('programs.manage') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const { id } = await params
  const r = await prisma.programReference.findUnique({ where: { id }, select: { storageKey: true, fileName: true, mimeType: true } })
  if (!r?.storageKey) return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 })
  const bytes = await bunnyDownload(r.storageKey).catch(() => null)
  if (!bytes) return NextResponse.json({ error: 'Το αρχείο δεν υπάρχει στην αποθήκη.' }, { status: 404 })
  const isPdf = bytes.subarray(0, 4).toString('latin1') === '%PDF'
  const inline = new URL(request.url).searchParams.get('download') !== '1'
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': isPdf ? 'application/pdf' : (r.mimeType || 'application/octet-stream'),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="reference"; filename*=UTF-8''${encodeURIComponent(r.fileName ?? 'αρχείο')}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
