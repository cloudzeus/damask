import crypto from 'node:crypto'
import { NextResponse } from 'next/server'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'

/**
 * Ανέβασμα του PDF της προκήρυξης/οδηγού ως κανονικό αρχείο (multipart) — ΟΧΙ base64 μέσα σε server action:
 * οι οδηγοί φτάνουν τις 400+ σελίδες / >10MB και το base64 (×1,37) ξεπερνούσε το όριο των server actions (12MB),
 * οπότε το «Νέο πρόγραμμα» αποτύγχανε με γενικό σφάλμα. Επιστρέφει το key· το createProgram το δέχεται.
 */
export const runtime = 'nodejs'
export const maxDuration = 120

const PROGRAM_PDF_MAX_BYTES = 60 * 1024 * 1024

export async function POST(request: Request) {
  const session = await auth()
  if (!can(session, 'programs.manage')) return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  const len = Number(request.headers.get('content-length') ?? '')
  if (Number.isFinite(len) && len > PROGRAM_PDF_MAX_BYTES + 1024 * 1024) {
    return NextResponse.json({ error: 'Το PDF ξεπερνά τα 60MB.' }, { status: 413 })
  }
  let file: FormDataEntryValue | null
  try { file = (await request.formData()).get('file') } catch {
    return NextResponse.json({ error: 'Η ανάγνωση του αρχείου απέτυχε — δοκίμασε ξανά.' }, { status: 400 })
  }
  if (!(file instanceof File) || file.size === 0) return NextResponse.json({ error: 'Δεν στάλθηκε αρχείο.' }, { status: 400 })
  if (file.size > PROGRAM_PDF_MAX_BYTES) return NextResponse.json({ error: 'Το PDF ξεπερνά τα 60MB.' }, { status: 413 })
  const body = Buffer.from(await file.arrayBuffer())
  if (body.subarray(0, 5).toString('latin1') !== '%PDF-') return NextResponse.json({ error: 'Το αρχείο δεν είναι PDF.' }, { status: 400 })
  const key = `programs/uploads/${crypto.randomUUID()}.pdf`
  try {
    await bunnyUploadPrivate({ key, body, contentType: 'application/pdf' })
  } catch {
    return NextResponse.json({ error: 'Η αποθήκευση του αρχείου απέτυχε — δοκίμασε ξανά.' }, { status: 502 })
  }
  return NextResponse.json({ key, size: body.length })
}
