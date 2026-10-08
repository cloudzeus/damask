import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

/**
 * Gated + scoped λήψη ενός TrdrDocument από το ιδιωτικό BunnyCDN — ΠΟΤΕ δημόσιο
 * pull-zone URL, πάντα μέσα από αυτό το route (mirror src/app/(app)/programs/
 * [id]/applications/[appId]/documents/[docId]/route.ts). Gate: 'customer.view'
 * (partners είναι εσωτερικό δεδομένο — δεν χρειάζεται επιπλέον per-user scoping
 * πέρα από το permission, ΙΔΙΟ idiom με τα partners actions).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; docId: string }> }) {
  try {
    await requirePermission('customer.view')
  } catch {
    return NextResponse.json({ error: 'Δεν έχεις δικαίωμα λήψης εγγράφου συναλλασσόμενου.' }, { status: 403 })
  }

  const { id, docId } = await params
  const doc = await prisma.trdrDocument.findUnique({ where: { id: docId } })
  if (!doc || doc.trdrId !== id) {
    return NextResponse.json({ error: 'Το έγγραφο δεν βρέθηκε.' }, { status: 404 })
  }
  if (!doc.storageKey) {
    return NextResponse.json({ error: 'Το έγγραφο δεν έχει αποθηκευμένο αρχείο.' }, { status: 404 })
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

  // storageKey πάντα καταλήγει σε ".{ext}" (βλ. gemiDocKey στο enrich-actions.ts) — το
  // χρησιμοποιούμε ως πηγή της αλήθειας για την επέκταση, ΟΧΙ το mimeType (πιο αξιόπιστο).
  // Τα έγγραφα ΓΕΜΗ έχουν αποθηκευτεί ως octet-stream — ο πραγματικός τύπος από τα bytes,
  // ώστε «Νέα καρτέλα» να ανοίγει το PDF αντί να το κατεβάζει. ?download=1 → αποθήκευση.
  const isPdf = bytes.subarray(0, 4).toString('latin1') === '%PDF'
  const ext = isPdf ? 'pdf' : (doc.storageKey.split('.').pop() || 'bin')
  const type = isPdf ? 'application/pdf' : (doc.mimeType && doc.mimeType !== 'application/octet-stream' ? doc.mimeType : 'application/octet-stream')
  const inline = isPdf && new URL(_request.url).searchParams.get('download') !== '1'
  const fileName = `${doc.title}.${ext}`
  return new Response(new Uint8Array(bytes), {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(bytes.length),
      'Content-Disposition': `${inline ? 'inline' : 'attachment'}; filename="document.${ext}"; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      'Cache-Control': 'private, no-store',
    },
  })
}
