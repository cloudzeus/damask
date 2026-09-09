import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp',
}

/**
 * Gated λήψη του αρχειοθετημένου αρχείου ενός TrdrFormRecord (source PDF/εικόνα
 * της σάρωσης) από το ιδιωτικό BunnyCDN — για την προεπισκόπηση περιοχών (RV-2b)
 * στην καρτέλα πελάτη. Content-Type από την επέκταση του storageKey ώστε ο
 * client να rasterize-άρει σωστά (isPdfFile/imageFile helpers).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; recordId: string }> }) {
  try {
    await requirePermission('taxform.scan')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης.' }, { status: 403 })
  }

  const { id, recordId } = await params
  const rec = await prisma.trdrFormRecord.findUnique({ where: { id: recordId }, select: { trdrId: true, storageKey: true } })
  if (!rec || rec.trdrId !== id) return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε.' }, { status: 404 })

  let bytes: Buffer
  try {
    bytes = await bunnyDownload(rec.storageKey)
  } catch (err) {
    return NextResponse.json({ error: 'Αποτυχία λήψης από το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }

  const ext = (rec.storageKey.split('.').pop() || '').toLowerCase()
  const contentType = MIME_BY_EXT[ext] ?? 'application/octet-stream'
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: { 'Content-Type': contentType, 'Content-Length': String(bytes.length), 'Cache-Control': 'private, no-store' },
  })
}
