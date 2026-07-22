import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/** ext (από το sampleStorageKey — βλ. uploadSample στο lib/tax/actions.ts,
 * `tax-templates/{id}/sample.{ext}`) → Content-Type. Το δείγμα είναι είτε PDF
 * είτε εικόνα — ο client αποφασίζει πώς θα το rasterize-άρει (rasterizePdf ή
 * imageFileToPage) βάσει αυτού του mimeType. */
const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
}

function mimeForKey(key: string): string {
  const ext = key.split('.').pop()?.toLowerCase() ?? ''
  return MIME_BY_EXT[ext] ?? 'application/octet-stream'
}

/**
 * Επιστρέφει τα raw bytes του δείγματος (sample) ενός Tax Form Template, ώστε
 * ο client να το κατεβάσει και να το rasterize-άρει ο ίδιος (client-only —
 * βλ. src/lib/ocr/rasterize.ts) για τον region editor. Ιδιωτικό BunnyCDN —
 * ΠΟΤΕ δημόσιο pull-zone URL, πάντα μέσα από αυτό το gated route.
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    await requirePermission('taxform.manage')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα προβολής δείγματος εντύπου.' }, { status: 403 })
  }

  const { id } = await params
  const template = await prisma.taxFormTemplate.findUnique({
    where: { id },
    select: { sampleStorageKey: true },
  })
  if (!template) {
    return NextResponse.json({ error: 'Ο οδηγός εντύπου δεν βρέθηκε.' }, { status: 404 })
  }
  if (!template.sampleStorageKey) {
    return NextResponse.json({ error: 'Δεν υπάρχει δείγμα εντύπου ανεβασμένο.' }, { status: 404 })
  }

  let bytes: Buffer
  try {
    bytes = await bunnyDownload(template.sampleStorageKey)
  } catch (err) {
    return NextResponse.json(
      { error: 'Αποτυχία λήψης δείγματος από το BunnyCDN.', detail: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    )
  }

  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': mimeForKey(template.sampleStorageKey),
      'Content-Length': String(bytes.length),
      'Cache-Control': 'private, no-store',
    },
  })
}
