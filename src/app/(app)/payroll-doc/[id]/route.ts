import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'
import { visibleApplicationWhere } from '@/lib/pm/scoping'

export const runtime = 'nodejs'

/** Προβολή εγγράφου μισθοδοσίας (μισθοδοτική/πληρωμή/αναγγελία) — inline, με έλεγχο ορατότητας έργου. */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  let session
  try { session = await requirePermission('pm.work') } catch {
    try { session = await requirePermission('pm.manage') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  }
  const { id } = await params
  const d = await prisma.payrollDoc.findFirst({ where: { id, expense: { application: visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) } } })
  if (!d) return NextResponse.json({ error: 'Δεν βρέθηκε.' }, { status: 404 })
  const bytes = await bunnyDownload(d.key)
  return new Response(new Uint8Array(bytes), {
    headers: { 'Content-Type': d.mime ?? 'application/octet-stream', 'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(d.name)}`, 'Cache-Control': 'private, no-store' },
  })
}
