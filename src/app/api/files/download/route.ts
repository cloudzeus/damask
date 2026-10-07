import { NextResponse } from 'next/server'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

const MIME: Record<string, string> = {
  pdf: 'application/pdf', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', gif: 'image/gif',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  doc: 'application/msword', xls: 'application/vnd.ms-excel', txt: 'text/plain', csv: 'text/csv', mp4: 'video/mp4', zip: 'application/zip',
}

/** Gated λήψη ΟΠΟΙΟΥΔΗΠΟΤΕ αρχείου του ευρετηρίου (κεντρική σελίδα «Αρχεία & Backup»). */
export async function GET(request: Request) {
  try { await requirePermission('files.manage') } catch { return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 }) }
  const url = new URL(request.url)
  const key = url.searchParams.get('key') ?? ''
  const entry = await prisma.fileIndexEntry.findUnique({ where: { key }, select: { key: true } })
  if (!entry) return NextResponse.json({ error: 'Το αρχείο δεν βρέθηκε στο ευρετήριο.' }, { status: 404 })
  let bytes: Buffer
  try { bytes = await bunnyDownload(entry.key) } catch { return NextResponse.json({ error: 'Το αρχείο δεν υπάρχει στην αποθήκη (δοκίμασε επαναφορά από NAS).' }, { status: 404 }) }
  const name = entry.key.split('/').pop() ?? 'file'
  const ext = name.split('.').pop()?.toLowerCase() ?? ''
  const inline = url.searchParams.get('disp') === 'inline'
  return new Response(new Uint8Array(bytes), {
    headers: {
      'Content-Type': MIME[ext] ?? 'application/octet-stream',
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(name)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
