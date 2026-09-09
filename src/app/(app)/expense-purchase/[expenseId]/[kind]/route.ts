import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

const FIELDS = {
  invoice: { key: 'invoiceKey', name: 'invoiceName', file: 'parastatiko' },
  bankExtrait: { key: 'bankExtraitKey', name: 'bankExtraitName', file: 'extrait' },
  supplierCert: { key: 'supplierCertKey', name: 'supplierCertName', file: 'bebaiosi' },
} as const
type Kind = keyof typeof FIELDS

/** Gated λήψη ενός εγγράφου αγοράς (παραστατικό/extrait/βεβαίωση) από το
 * ιδιωτικό BunnyCDN. Gate: 'programs.manage'. */
export async function GET(_request: Request, { params }: { params: Promise<{ expenseId: string; kind: string }> }) {
  try {
    await requirePermission('programs.manage')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης.' }, { status: 403 })
  }
  const { expenseId, kind } = await params
  const f = FIELDS[kind as Kind]
  if (!f) return NextResponse.json({ error: 'Άγνωστο έγγραφο.' }, { status: 400 })

  const p = await prisma.expensePurchase.findUnique({ where: { expenseId }, select: { invoiceKey: true, invoiceName: true, bankExtraitKey: true, bankExtraitName: true, supplierCertKey: true, supplierCertName: true } })
  const storageKey = p?.[f.key]
  if (!storageKey) return NextResponse.json({ error: 'Δεν υπάρχει έγγραφο.' }, { status: 404 })

  let bytes: Buffer
  try { bytes = await bunnyDownload(storageKey) }
  catch (err) { return NextResponse.json({ error: 'Αποτυχία λήψης.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 }) }

  const ext = storageKey.split('.').pop() || 'bin'
  const filename = (p?.[f.name] ?? f.file)
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(filename)}.${ext}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
