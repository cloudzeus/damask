import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** Gated λήψη του οδηγού (PDF) ενός προγράμματος — π.χ. για εξαγωγή συνδέσμων στον browser. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try { await requirePermission('programs.manage') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const { id } = await params
  const p = await prisma.program.findUnique({ where: { id }, select: { storageKey: true, sourceFileName: true } })
  if (!p?.storageKey) return NextResponse.json({ error: 'Το πρόγραμμα δεν έχει οδηγό PDF.' }, { status: 404 })
  const bytes = await bunnyDownload(p.storageKey).catch(() => null)
  if (!bytes) return NextResponse.json({ error: 'Ο οδηγός δεν υπάρχει στην αποθήκη.' }, { status: 404 })
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="guide.pdf"; filename*=UTF-8''${encodeURIComponent(p.sourceFileName ?? 'οδηγός.pdf')}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
