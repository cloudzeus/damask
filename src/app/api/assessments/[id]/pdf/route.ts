import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { assessmentPdfById } from '@/lib/assessment/pdf'

export const runtime = 'nodejs'

/** PDF αναφορά αξιολόγησης ένταξης (WWA). ?download=1 → αποθήκευση αντί για προβολή. */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requirePermission('customer.view') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const { id } = await params
  const r = await assessmentPdfById(id)
  if (!r) return NextResponse.json({ error: 'Η αξιολόγηση δεν είναι έτοιμη.' }, { status: 404 })
  const download = new URL(request.url).searchParams.get('download') === '1'
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${download ? 'attachment' : 'inline'}; filename="assessment.pdf"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
