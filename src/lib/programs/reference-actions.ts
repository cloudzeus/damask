'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate, bunnyDeleteOne } from '@/lib/bunny-storage'
import { digestReference } from './references'
import { unwrapSafeLink } from './pdf-text'

export type ProgramReferenceRow = {
  id: string
  kind: 'FILE' | 'URL' | 'NOTE'
  title: string
  url: string | null
  fileName: string | null
  note: string | null
  digest: string | null
  status: 'PROCESSING' | 'READY' | 'ERROR'
  error: string | null
  active: boolean
  createdAt: string
}

const toRow = (r: { id: string; kind: string; title: string; url: string | null; fileName: string | null; note: string | null; digest: string | null; status: string; error: string | null; active: boolean; createdAt: Date }): ProgramReferenceRow => ({
  id: r.id, kind: r.kind as ProgramReferenceRow['kind'], title: r.title, url: r.url, fileName: r.fileName, note: r.note, digest: r.digest,
  status: r.status as ProgramReferenceRow['status'], error: r.error, active: r.active, createdAt: r.createdAt.toISOString(),
})

export async function listProgramReferences(programId: string): Promise<ProgramReferenceRow[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programReference.findMany({ where: { programId }, orderBy: { createdAt: 'desc' } })
  return rows.map(toRow)
}

export async function addProgramReference(programId: string, input: {
  kind: 'FILE' | 'URL' | 'NOTE'
  title: string
  note?: string | null
  url?: string | null
  file?: { name: string; base64: string; mimeType: string } | null
}): Promise<{ ok: true; row: ProgramReferenceRow } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const title = input.title.trim() || input.file?.name || input.url || 'Σημείωση'
  const note = input.note?.trim() || null
  let url: string | null = null
  let storageKey: string | null = null
  if (input.kind === 'URL') {
    try {
      const u = new URL((input.url ?? '').trim())
      if (!/^https?:$/.test(u.protocol)) throw new Error()
      url = u.toString()
    } catch { return { ok: false, message: 'Μη έγκυρος σύνδεσμος (π.χ. https://…).' } }
  }
  if (input.kind === 'NOTE' && !note) return { ok: false, message: 'Γράψε την επεξήγηση/σημείωση.' }
  if (input.kind === 'FILE') {
    if (!input.file?.base64) return { ok: false, message: 'Διάλεξε αρχείο.' }
    const ext = (/\.([a-z0-9]{1,6})$/i.exec(input.file.name)?.[1] ?? 'bin').toLowerCase()
    storageKey = `programs/${programId}/references/${crypto.randomUUID()}.${ext}`
    await bunnyUploadPrivate({ key: storageKey, body: Buffer.from(input.file.base64, 'base64'), contentType: input.file.mimeType || 'application/octet-stream' })
  }
  const row = await prisma.programReference.create({
    data: {
      programId, kind: input.kind, title: title.slice(0, 200), note, url, storageKey,
      fileName: input.file?.name ?? null, mimeType: input.file?.mimeType ?? null,
      status: input.kind === 'NOTE' ? 'READY' : 'PROCESSING', createdById: session.user.id,
    },
  })
  if (input.kind !== 'NOTE') void digestReference(row.id).catch(err => console.error('[program-reference] digest failed', err))
  revalidatePath(`/programs/${programId}`)
  return { ok: true, row: toRow(row) }
}

export async function getProgramReference(id: string): Promise<ProgramReferenceRow | null> {
  await requirePermission('programs.manage')
  const r = await prisma.programReference.findUnique({ where: { id } })
  return r ? toRow(r) : null
}

export async function updateProgramReference(id: string, patch: { title?: string; note?: string | null; active?: boolean }): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.programReference.update({
    where: { id },
    data: {
      ...(patch.title !== undefined ? { title: patch.title.trim().slice(0, 200) || 'Πηγή' } : {}),
      ...(patch.note !== undefined ? { note: patch.note?.trim() || null } : {}),
      ...(patch.active !== undefined ? { active: patch.active } : {}),
    },
  })
}

/** Ξαναδιάβασμα της πηγής (π.χ. ενημερώθηκε η σελίδα ή άλλαξε η οδηγία). */
export async function redigestProgramReference(id: string): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.programReference.update({ where: { id }, data: { status: 'PROCESSING', error: null } })
  void digestReference(id).catch(err => console.error('[program-reference] digest failed', err))
}

export async function deleteProgramReference(id: string): Promise<void> {
  await requirePermission('programs.manage')
  const r = await prisma.programReference.delete({ where: { id }, select: { storageKey: true, programId: true } })
  if (r.storageKey) await bunnyDeleteOne(r.storageKey).catch(() => {})
  revalidatePath(`/programs/${r.programId}`)
}

/**
 * Σύνδεσμοι που βρέθηκαν μέσα στον οδηγό → πηγές URL της γνωσιακής μνήμης (όσες δεν υπάρχουν ήδη).
 * Διαβάζονται σειριακά στο παρασκήνιο (όχι 20 ταυτόχρονες κλήσεις AI).
 */
export async function importGuideLinks(programId: string, links: { url: string; text: string | null; page: number }[]): Promise<{ added: number; skipped: number }> {
  const session = await requirePermission('programs.manage')
  const existing = new Set((await prisma.programReference.findMany({ where: { programId, kind: 'URL' }, select: { url: true } })).map(r => r.url))
  const SKIP = /(facebook|twitter|x\.com|linkedin|instagram|youtube|mailto:|google\.com\/maps)/i
  // Σκέτες αρχικές σελίδες (π.χ. espa.gr/) δεν έχουν κανόνες — μόνο συγκεκριμένα έγγραφα/σελίδες.
  const isHomepage = (u: string) => { try { const x = new URL(u); return (x.pathname === '/' || x.pathname === '') && !x.search } catch { return true } }
  const fresh = links
    .map(l => ({ ...l, url: unwrapSafeLink(l.url) }))
    .filter(l => /^https?:\/\//i.test(l.url) && !SKIP.test(l.url) && !existing.has(l.url) && !isHomepage(l.url))
    .filter((l, i, arr) => arr.findIndex(x => x.url === l.url) === i)
    .slice(0, 30)
  const created: string[] = []
  for (const l of fresh) {
    const host = (() => { try { return new URL(l.url).hostname.replace(/^www\./, '') } catch { return l.url } })()
    const r = await prisma.programReference.create({
      data: {
        programId, kind: 'URL', url: l.url, status: 'PROCESSING', createdById: session.user.id,
        title: (l.text ? `${l.text.slice(-70)} — ${host}` : host).slice(0, 200),
        note: `Σύνδεσμος από τον οδηγό του προγράμματος (σελ. ${l.page}).`,
      },
      select: { id: true },
    })
    created.push(r.id)
  }
  void (async () => { for (const id of created) await digestReference(id).catch(() => {}) })()
  revalidatePath(`/programs/${programId}`)
  return { added: created.length, skipped: links.length - created.length }
}
