import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/**
 * Gated + scoped λήψη ενός TrdrDossierDocument (αποθήκη δικαιολογητικών πελάτη)
 * από το ιδιωτικό BunnyCDN — ΠΟΤΕ δημόσιο URL, πάντα μέσα από αυτό το route
 * (mirror του partners/[id]/documents/[docId]/route.ts). Gate: 'customer.view'.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    await requirePermission('customer.view')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης εγγράφου.' }, { status: 403 })
  }

  const { id, docId } = await params
  const doc = await prisma.trdrDossierDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.trdrId !== id) {
    return NextResponse.json({ error: 'Το έγγραφο δεν βρέθηκε.' }, { status: 404 })
  }

  let bytes: Buffer
  try {
    bytes = await bunnyDownload(doc.storageKey)
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία λήψης εγγράφου από το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  const ext = doc.storageKey.split('.').pop() || 'bin'
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': doc.mimeType ?? 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `attachment; filename="${encodeURIComponent(doc.name)}.${ext}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
