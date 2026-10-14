import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'
import { visibleApplicationWhere } from '@/lib/pm/scoping'

export const runtime = 'nodejs'

type Doc = { key: string; name: string; mime?: string | null }

/**
 * Προβολή αρχείου παραστατικού υλοποίησης — inline, με έλεγχο ορατότητας έργου.
 * kind: invoice | cert | payment (?p=<paymentId>&i=<θέση εγγράφου της πληρωμής>) | att (?a=<συνοδευτικό>).
 */
export async function GET(req: Request, { params }: { params: Promise<{ id: string; kind: string }> }) {
  let session
  try { session = await requirePermission('pm.work') } catch {
    try { session = await requirePermission('pm.manage') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  }
  const { id, kind } = await params
  const r = await prisma.expenseInvoice.findFirst({
    where: { id, expense: { application: visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) } },
    include: { payments: { select: { id: true, docs: true } }, attachments: true },
  })
  if (!r) return NextResponse.json({ error: 'Δεν βρέθηκε.' }, { status: 404 })

  let doc: Doc | null = null
  if (kind === 'invoice') doc = { key: r.invoiceKey, name: r.invoiceName, mime: r.invoiceMime }
  else if (kind === 'cert' && r.supplierCertKey) doc = { key: r.supplierCertKey, name: r.supplierCertName ?? 'vevaiosi', mime: r.supplierCertMime }
  else if (kind === 'payment') {
    const q = new URL(req.url).searchParams
    const p = r.payments.find(x => x.id === q.get('p'))
    doc = (Array.isArray(p?.docs) ? (p.docs as Doc[]) : [])[Number(q.get('i') ?? 0)] ?? null
  }
  else if (kind === 'att') {
    const a = r.attachments.find(x => x.id === new URL(req.url).searchParams.get('a'))
    if (a) doc = { key: a.key, name: a.name, mime: a.mime }
  }
  if (!doc?.key) return NextResponse.json({ error: 'Δεν υπάρχει έγγραφο.' }, { status: 404 })

  const bytes = await bunnyDownload(doc.key)
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': doc.mime ?? 'application/octet-stream',
      'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(doc.name || 'document')}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
