import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { logApiUsage } from '@/lib/api-usage'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { buildTrdrFolderPath } from '@/lib/trdr/cdn-folder'
import { safeRelativeDir, safeSegment } from '@/lib/trdr/safe-name'

/**
 * Staff upload αρχείου στον φάκελο πελάτη (private), σε συγκεκριμένο υποφάκελο
 * (subPath). Gated customer.edit. Ο προορισμός περιορίζεται μέσα στη ρίζα του πελάτη.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE = 50 * 1024 * 1024
const SAFE_SEG = /^[A-Za-z0-9._-]+$/


function safeSub(sub: string): string {
  const s = sub.replace(/^\/+|\/+$/g, '')
  if (!s) return ''
  for (const p of s.split('/')) if (p === '' || p === '.' || p === '..' || !SAFE_SEG.test(p)) throw new Error('bad path')
  return `${s}/`
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!can(session, 'customer.edit')) return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })

  const { id } = await ctx.params
  const trdr = await prisma.trdr.findUnique({ where: { id }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
  if (!trdr) return NextResponse.json({ error: 'Ο συναλλασσόμενος δεν βρέθηκε.' }, { status: 404 })
  const root = trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })

  let formData: FormData
  try {
    formData = await req.formData()
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρα δεδομένα.' }, { status: 400 })
  }
  const file = formData.get('file')
  const subPathRaw = formData.get('subPath')
  // Ανέβασμα ΦΑΚΕΛΟΥ: η σχετική διαδρομή του αρχείου μέσα στον φάκελο που επιλέχθηκε (π.χ. «Τιμολόγια/2024»)
  // → ίδια δομή υποφακέλων στον φάκελο του πελάτη (ονόματα μεταγραμμένα σε λατινικά).
  const relDirRaw = formData.get('relDir')
  if (!(file instanceof File)) return NextResponse.json({ error: 'Δεν βρέθηκε αρχείο.' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'Το αρχείο ξεπερνά τα 50MB.' }, { status: 400 })

  let rel = ''
  try {
    rel = safeSub(typeof subPathRaw === 'string' ? subPathRaw : '')
  } catch {
    return NextResponse.json({ error: 'Μη έγκυρη διαδρομή.' }, { status: 400 })
  }

  const extMatch = /\.[a-z0-9]+$/i.exec(file.name)
  const ext = extMatch ? extMatch[0].toLowerCase() : ''
  const baseName = file.name.replace(/\.[a-z0-9]+$/i, '')
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${safeSegment(baseName, 'file')}${ext}`
  const relDir = typeof relDirRaw === 'string' ? safeRelativeDir(relDirRaw) : ''
  const key = `${root}${rel}${relDir}${objectName}`

  let arrayBuffer: ArrayBuffer
  try {
    arrayBuffer = await file.arrayBuffer()
  } catch {
    return NextResponse.json({ error: 'Αδυναμία ανάγνωσης αρχείου.' }, { status: 400 })
  }

  try {
    await bunnyUploadPrivate({ key, body: Buffer.from(arrayBuffer), contentType: file.type || 'application/octet-stream' })
  } catch (err) {
    return NextResponse.json({ error: 'Αποτυχία αποθήκευσης.', detail: err instanceof Error ? err.message : String(err) }, { status: 502 })
  }

  void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: file.size / 1e9, userId: session?.user?.id, refType: 'trdr-file', refId: id })
  // «Υπάρχει ήδη» + ενιαία αξιολόγηση (όπως το ανέβασμα σε κομμάτια).
  const body = Buffer.from(arrayBuffer)
  const { recordFileHash } = await import('@/lib/import/existing')
  await recordFileHash({ key, body, trdrId: id, kind: 'customer-file', label: `${rel}${relDir}${file.name}` })
  const { evaluable, evaluateIncomingFile } = await import('@/lib/import/evaluate')
  if (evaluable(file.name, file.type, file.size)) {
    const rawDir = typeof relDirRaw === 'string' ? relDirRaw.replace(/^\/+|\/+$/g, '') : ''
    void evaluateIncomingFile({ trdrId: id, fileName: file.name, relPath: rawDir ? `${rawDir}/${file.name}` : file.name, mime: file.type || 'application/octet-stream', body, source: 'CUSTOMER_FILE', sourceKey: key, userId: session?.user?.id ?? null })
  }
  return NextResponse.json({ ok: true, name: file.name, key, size: file.size })
}
