import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** Gated λήψη της ενυπόγραφης προσφοράς (αρχείο) μιας δαπάνης από το ιδιωτικό
 * BunnyCDN. Gate: 'programs.manage'. */
export async function GET(_request: Request, { params }: { params: Promise<{ expenseId: string }> }) {
  try {
    await requirePermission('programs.manage')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης.' }, { status: 403 })
  }
  const { expenseId } = await params
  const exp = await prisma.programExpense.findUnique({ where: { id: expenseId }, select: { quoteStorageKey: true, quoteName: true, quoteMimeType: true } })
  if (!exp?.quoteStorageKey) return NextResponse.json({ error: 'Δεν υπάρχει προσφορά.' }, { status: 404 })

  let bytes: Buffer
  try { bytes = await bunnyDownload(exp.quoteStorageKey) }
  catch (err) { return NextResponse.json({ error: 'Αποτυχία λήψης.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 }) }

  const ext = exp.quoteStorageKey.split('.').pop() || 'bin'
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': exp.quoteMimeType ?? 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(exp.quoteName ?? 'prosfora')}.${ext}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
