import { NextResponse } from 'next/server'
import { randomUUID, createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { mkdir, appendFile, stat, unlink, readdir } from 'node:fs/promises'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { logApiUsage } from '@/lib/api-usage'
import { bunnyUploadPrivateFile } from '@/lib/bunny-storage'
import { buildTrdrFolderPath } from '@/lib/trdr/cdn-folder'
import { safeRelativeDir, safeSegment } from '@/lib/trdr/safe-name'

/**
 * ΤΜΗΜΑΤΙΚΟ ανέβασμα στον φάκελο πελάτη — ΧΩΡΙΣ όριο μεγέθους αρχείου: ο browser στέλνει κομμάτια (~8MB, κάτω
 * από το όριο αιτήματος του Cloudflare) με τη σειρά· ο server τα ενώνει σε προσωρινό αρχείο και στο τελευταίο
 * κομμάτι το στέλνει στο BunnyCDN ως ροή (όχι στη μνήμη). Υποστηρίζει και διαδρομή φακέλου (relDir) για
 * ανέβασμα ολόκληρων φακέλων. Gated customer.edit· ο προορισμός μένει μέσα στη ρίζα του πελάτη.
 */
export const runtime = 'nodejs'
export const maxDuration = 300

const MAX_CHUNK = 16 * 1024 * 1024
const SAFE_SEG = /^[A-Za-z0-9._-]+$/
const TMP = join(tmpdir(), 'trdr-uploads')
const STALE_MS = 24 * 3600 * 1000

function safeSub(sub: string): string {
  const s = sub.replace(/^\/+|\/+$/g, '')
  if (!s) return ''
  for (const p of s.split('/')) if (p === '' || p === '.' || p === '..' || !SAFE_SEG.test(p)) throw new Error('bad path')
  return `${s}/`
}

/** Καθάρισμα εγκαταλελειμμένων ανεβασμάτων (>24 ώρες). */
async function sweepStale() {
  const now = Date.now()
  for (const f of await readdir(TMP).catch(() => [] as string[])) {
    const p = join(TMP, f)
    const st = await stat(p).catch(() => null)
    if (st && now - st.mtimeMs > STALE_MS) await unlink(p).catch(() => {})
  }
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const session = await auth()
  if (!can(session, 'customer.edit')) return NextResponse.json({ error: 'Δεν έχεις δικαίωμα.' }, { status: 403 })
  const { id } = await ctx.params

  let fd: FormData
  try { fd = await req.formData() } catch { return NextResponse.json({ error: 'Μη έγκυρα δεδομένα.' }, { status: 400 }) }
  const uploadId = String(fd.get('uploadId') ?? '')
  const offset = Number(fd.get('offset'))
  const size = Number(fd.get('size'))
  const chunk = fd.get('chunk')
  if (!/^[0-9a-f-]{36}$/.test(uploadId) || !Number.isFinite(offset) || offset < 0 || !Number.isFinite(size) || size < 0) {
    return NextResponse.json({ error: 'Μη έγκυρο αίτημα.' }, { status: 400 })
  }
  if (!(chunk instanceof Blob) || chunk.size > MAX_CHUNK) return NextResponse.json({ error: 'Μη έγκυρο τμήμα.' }, { status: 400 })

  await mkdir(TMP, { recursive: true })
  const part = join(TMP, `${uploadId}.part`)
  const current = offset === 0 ? 0 : (await stat(part).catch(() => null))?.size ?? -1
  if (offset === 0) { await unlink(part).catch(() => {}); void sweepStale() }
  // Το τμήμα πρέπει να συνεχίζει ακριβώς από εκεί που σταμάτησε το αρχείο (αλλιώς ο client ξαναστέλνει από το σωστό σημείο).
  if (current !== offset) return NextResponse.json({ error: 'Εκτός σειράς.', expectedOffset: Math.max(0, current) }, { status: 409 })
  await appendFile(part, Buffer.from(await chunk.arrayBuffer()))
  const received = offset + chunk.size
  if (received < size) return NextResponse.json({ ok: true, received })

  // Τελευταίο τμήμα → προορισμός + ροή προς BunnyCDN.
  try {
    // Μαζική εισαγωγή: το αρχείο πάει στο προσωρινό αντίγραφο της παρτίδας και μπαίνει στην ουρά αναγνώρισης.
    const importItemId = String(fd.get('importItemId') ?? '')
    if (importItemId) {
      const item = await prisma.importItem.findFirst({ where: { id: importItemId, trdrId: id }, select: { id: true, batchId: true, fileName: true } })
      if (!item) return NextResponse.json({ error: 'Άγνωστο αρχείο παρτίδας.' }, { status: 404 })
      const ext = (/\.[a-z0-9]{1,10}$/i.exec(item.fileName)?.[0] ?? '').toLowerCase()
      const key = `imports/${item.batchId}/${item.id}${ext}`
      await bunnyUploadPrivateFile({ key, filePath: part, size: received, contentType: String(fd.get('type') ?? '') || 'application/octet-stream' })
      await prisma.importItem.update({ where: { id: item.id }, data: { storageKey: key, phase: 'QUEUED' } })
      const { kickImportSweep } = await import('@/lib/import/recognize')
      kickImportSweep()
      void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: received / 1e9, userId: session?.user?.id, refType: 'import', refId: item.id })
      return NextResponse.json({ ok: true, done: true, key, size: received })
    }
    const trdr = await prisma.trdr.findUnique({ where: { id }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
    if (!trdr) return NextResponse.json({ error: 'Ο συναλλασσόμενος δεν βρέθηκε.' }, { status: 404 })
    const root = trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
    let rel = ''
    try { rel = safeSub(String(fd.get('subPath') ?? '')) } catch { return NextResponse.json({ error: 'Μη έγκυρη διαδρομή.' }, { status: 400 }) }
    const relDir = safeRelativeDir(String(fd.get('relDir') ?? ''))
    const name = String(fd.get('name') ?? 'file')
    const ext = (/\.[a-z0-9]{1,10}$/i.exec(name)?.[0] ?? '').toLowerCase()
    const base = name.replace(/\.[a-z0-9]{1,10}$/i, '')
    const key = `${root}${rel}${relDir}${Date.now()}-${randomUUID().slice(0, 8)}-${safeSegment(base, 'file')}${ext}`
    // Hash περιεχομένου (ροή, χωρίς φόρτωση στη μνήμη) — για το «Υπάρχει ήδη» της μαζικής εισαγωγής.
    const hash = await new Promise<string | null>(resolve => {
      const h = createHash('sha256')
      createReadStream(part).on('data', c => h.update(c)).on('end', () => resolve(h.digest('hex'))).on('error', () => resolve(null))
    })
    await bunnyUploadPrivateFile({ key, filePath: part, size: received, contentType: String(fd.get('type') ?? '') || 'application/octet-stream' })
    void logApiUsage({ service: 'bunnycdn', operation: 'upload', units: received / 1e9, userId: session?.user?.id, refType: 'trdr-file', refId: id })
    if (hash) {
      const { recordFileHash } = await import('@/lib/import/existing')
      await recordFileHash({ key, hash, trdrId: id, kind: 'customer-file', label: `${rel}${relDir}${name}` })
    }
    return NextResponse.json({ ok: true, done: true, name, key, size: received })
  } catch (err) {
    console.error('[trdr upload-chunk] finalize failed', err)
    return NextResponse.json({ error: 'Αποτυχία αποθήκευσης — δοκίμασε ξανά.' }, { status: 502 })
  } finally {
    await unlink(part).catch(() => {})
  }
}
