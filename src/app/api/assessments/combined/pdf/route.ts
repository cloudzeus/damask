import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { combinedPdfByIds } from '@/lib/assessment/pdf'

export const runtime = 'nodejs'

/** PDF συνολικής ανάλυσης πολλών προγραμμάτων: ?ids=a,b,c (&download=1). */
export async function GET(request: Request) {
  try { await requirePermission('customer.view') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const url = new URL(request.url)
  const ids = (url.searchParams.get('ids') ?? '').split(',').map(x => x.trim()).filter(Boolean)
  const r = ids.length ? await combinedPdfByIds(ids) : null
  if (!r) return NextResponse.json({ error: 'Οι αξιολογήσεις δεν είναι έτοιμες.' }, { status: 404 })
  return new NextResponse(new Uint8Array(r.pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `${url.searchParams.get('download') === '1' ? 'attachment' : 'inline'}; filename="combined.pdf"; filename*=UTF-8''${encodeURIComponent(r.fileName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
