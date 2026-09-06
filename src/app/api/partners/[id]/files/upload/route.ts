import { NextResponse } from 'next/server'
import { randomUUID } from 'node:crypto'
import { auth } from '@/auth'
import { can } from '@/lib/rbac'
import { prisma } from '@/lib/prisma'
import { logApiUsage } from '@/lib/api-usage'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { buildTrdrFolderPath } from '@/lib/trdr/cdn-folder'

/**
 * Staff upload αρχείου στον φάκελο πελάτη (private), σε συγκεκριμένο υποφάκελο
 * (subPath). Gated customer.edit. Ο προορισμός περιορίζεται μέσα στη ρίζα του πελάτη.
 */

export const runtime = 'nodejs'
export const maxDuration = 60

const MAX_SIZE = 50 * 1024 * 1024
const SAFE_SEG = /^[A-Za-z0-9._-]+$/

function slugify(input: string): string {
  const slug = input.toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/-+/g, '-').replace(/^-+|-+$/g, '')
  return slug || 'file'
}

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
  const objectName = `${Date.now()}-${randomUUID().slice(0, 8)}-${slugify(baseName)}${ext}`
  const key = `${root}${rel}${objectName}`

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
  return NextResponse.json({ ok: true, name: file.name, key, size: file.size })
}
