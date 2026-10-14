import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { STAGE_ORDER, type StageStr } from '@/lib/pm/types'

/**
 * (Plain module — worker & actions.) Αρχεία ΥΛΟΠΟΙΗΣΗΣ από οποιοδήποτε σημείο ανεβάσματος → «Προς καταχώριση» του
 * εγκεκριμένου έργου του πελάτη → αυτόματη καταχώριση (impl-autofile) λίγο μετά (μία φορά για όλη την παρτίδα).
 */

/** Έργα του πελάτη σε υλοποίηση: με καταχωρισμένη εγκριτική ή σε στάδιο «Δελτία ελέγχου» και μετά. */
export async function implementationApps(trdrId: string): Promise<{ id: string; programId: string; title: string }[]> {
  const apps = await prisma.programApplication.findMany({
    where: { trdrId },
    select: { id: true, programId: true, stage: true, approval: { select: { id: true } }, program: { select: { title: true } } },
  })
  const insp = STAGE_ORDER.indexOf('INSPECTION')
  return apps.filter(a => a.approval || STAGE_ORDER.indexOf(a.stage as StageStr) >= insp).map(a => ({ id: a.id, programId: a.programId, title: a.program.title }))
}

/** Αντίγραφο στο «Προς καταχώριση» του έργου (χωρίς ανάγνωση — γίνεται στην αυτόματη καταχώριση όπου χρειάζεται). */
export async function stageImplDoc(input: { applicationId: string; trdrId: string; name: string; body: Buffer; mime: string; relPath?: string | null; userId: string | null }): Promise<string> {
  const ext = (input.name.split('.').pop() || 'bin').replace(/[^a-z0-9]/gi, '').toLowerCase() || 'bin'
  const key = `application-inbox/${input.applicationId}/${crypto.randomUUID()}.${ext}`
  await bunnyUploadPrivate({ key, body: input.body, contentType: input.mime || 'application/octet-stream' })
  const row = await prisma.applicationInboxDoc.create({
    data: {
      applicationId: input.applicationId, trdrId: input.trdrId, kind: 'INVOICE', fileName: input.name.slice(0, 250), storageKey: key,
      mimeType: input.mime || 'application/octet-stream', size: input.body.length, relPath: input.relPath?.slice(0, 500) || null, createdById: input.userId,
    },
  })
  const { recordFileHash } = await import('@/lib/import/existing')
  await recordFileHash({ key, body: input.body, trdrId: input.trdrId, kind: 'inbox', label: input.name, ref: row.id })
  return row.id
}

/** Αυτόματη καταχώριση ~2′ αργότερα (μία φορά ανά έργο — τα επόμενα αρχεία της ίδιας παρτίδας μαζεύονται). */
export async function scheduleImplAutofile(applicationId: string, userId: string | null): Promise<void> {
  try {
    const { startBoss } = await import('@/lib/queue')
    const { QUEUE_IMPL_AUTOFILE } = await import('@/lib/pm/impl-autofile')
    const boss = await startBoss()
    await boss.send(QUEUE_IMPL_AUTOFILE, { applicationId, userId }, { startAfter: 120, singletonKey: `auto:${applicationId}`, singletonSeconds: 120, retryLimit: 0 })
  } catch (err) { console.error('[impl] προγραμματισμός αυτόματης καταχώρισης απέτυχε', err) }
}
