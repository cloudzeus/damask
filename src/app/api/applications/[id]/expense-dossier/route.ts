import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { visibleApplicationWhere } from '@/lib/pm/scoping'
import { buildExpenseDossierPdf, buildExpenseDossierZip } from '@/lib/programs/expense-dossier'

export const runtime = 'nodejs'
export const maxDuration = 300

/**
 * Φάκελος τεκμηρίωσης δαπανών για τη Διαχειριστική Αρχή (on demand).
 *   ?format=zip (default) → PDF + πρωτότυπα αρχεία ανά δαπάνη · ?format=pdf → μόνο η τεκμηρίωση.
 */
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  let session
  try { session = await requirePermission('programs.manage') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const { id } = await params
  const visible = await prisma.programApplication.findFirst({
    where: { id, ...visibleApplicationWhere({ id: session.user.id, permissions: session.user.permissions ?? [] }) },
    select: { id: true },
  })
  if (!visible) return NextResponse.json({ error: 'Το έργο δεν βρέθηκε.' }, { status: 404 })

  const format = new URL(request.url).searchParams.get('format') === 'pdf' ? 'pdf' : 'zip'
  const stamp = new Date().toISOString().slice(0, 10)
  const base = (name: string) => `Φάκελος-δαπανών-${name.replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-|-$/g, '').slice(0, 50)}-${stamp}`

  if (format === 'pdf') {
    const { pdf, trdrName } = await buildExpenseDossierPdf(id)
    return new NextResponse(new Uint8Array(pdf), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="expense-dossier.pdf"; filename*=UTF-8''${encodeURIComponent(base(trdrName))}.pdf`,
        'Cache-Control': 'private, no-store',
      },
    })
  }
  const { zip, trdrName } = await buildExpenseDossierZip(id)
  return new NextResponse(new Uint8Array(zip), {
    headers: {
      'Content-Type': 'application/zip',
      'Content-Disposition': `attachment; filename="expense-dossier.zip"; filename*=UTF-8''${encodeURIComponent(base(trdrName))}.zip`,
      'Cache-Control': 'private, no-store',
    },
  })
}
