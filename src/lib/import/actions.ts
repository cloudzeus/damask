'use server'

import crypto from 'node:crypto'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload, bunnyUploadPrivate, bunnyDeleteOne } from '@/lib/bunny-storage'
import type { SmartClassifyResult } from '@/lib/documents/smart-classify-core'
import { junkOf } from './rules'
import { findExisting } from './existing'
import { kickImportSweep } from './recognize'

/**
 * Παρτίδα μαζικής εισαγωγής (ImportBatch/ImportItem): το παράθυρο είναι «οθόνη» πάνω στην παρτίδα του server —
 * κλείνει/ανοίγει, διακόπτεται, συνεχίζει. Η αναγνώριση τρέχει στο παρασκήνιο (recognize.ts).
 */

export type ImportItemView = {
  id: string
  fileName: string
  relPath: string | null
  size: number
  mimeType: string
  hash: string | null
  phase: string
  dest: string | null
  suggestion: SmartClassifyResult | null
  appId: string | null
  junkReason: string | null
  error: string | null
  waitReason: string | null
  nextAttemptAt: string | null
  autoSaved: boolean
  resultNote: string | null
}
export type ImportBatchView = { id: string; createdAt: string; items: ImportItemView[] }

const view = (i: { id: string; fileName: string; relPath: string | null; size: number; mimeType: string; hash: string | null; phase: string; dest: string | null; suggestion: unknown; appId: string | null; junkReason: string | null; error: string | null; waitReason: string | null; nextAttemptAt: Date | null; autoSaved: boolean; resultNote: string | null }): ImportItemView => ({
  id: i.id, fileName: i.fileName, relPath: i.relPath, size: i.size, mimeType: i.mimeType, hash: i.hash, phase: i.phase, dest: i.dest,
  suggestion: (i.suggestion as SmartClassifyResult | null) ?? null, appId: i.appId, junkReason: i.junkReason, error: i.error, waitReason: i.waitReason,
  nextAttemptAt: i.nextAttemptAt?.toISOString() ?? null, autoSaved: i.autoSaved, resultNote: i.resultNote,
})

/** Η ενεργή παρτίδα του πελάτη (αν υπάρχει) με όλα τα αρχεία της. */
export async function getActiveImportBatch(trdrId: string): Promise<ImportBatchView | null> {
  await requirePermission('customer.edit')
  const b = await prisma.importBatch.findFirst({ where: { trdrId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, include: { items: { orderBy: { createdAt: 'asc' } } } })
  return b ? { id: b.id, createdAt: b.createdAt.toISOString(), items: b.items.map(view) } : null
}

/** Ενημερώσεις από τον server (polling όσο τρέχει η αναγνώριση). */
export async function getImportItems(batchId: string, ids?: string[]): Promise<ImportItemView[]> {
  await requirePermission('customer.edit')
  const rows = await prisma.importItem.findMany({ where: { batchId, ...(ids ? { id: { in: ids } } : {}) }, orderBy: { createdAt: 'asc' } })
  return rows.map(view)
}

/**
 * Καταχώριση αρχείων στην παρτίδα (δημιουργείται αν δεν υπάρχει). Για κάθε αρχείο: άχρηστο → παράλειψη· ίδιο hash
 * σε προηγούμενη παρτίδα του πελάτη με ανεβασμένο αντίγραφο → ΔΕΝ ξαναανεβαίνει (επαναχρησιμοποίηση)· αλλιώς ανέβασμα.
 */
export async function registerImportFiles(trdrId: string, files: { clientId: string; name: string; relPath: string | null; size: number; mimeType: string; hash: string | null }[]): Promise<{ batchId: string; items: { clientId: string; itemId: string; needsUpload: boolean }[] }> {
  const session = await requirePermission('customer.edit')
  const batch = await prisma.importBatch.findFirst({ where: { trdrId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
    ?? await prisma.importBatch.create({ data: { trdrId, createdById: session.user.id }, select: { id: true } })
  const hashes = files.map(f => f.hash).filter((h): h is string => !!h)
  const staged = hashes.length
    ? await prisma.importItem.findMany({ where: { trdrId, hash: { in: hashes }, storageKey: { not: null } }, orderBy: { createdAt: 'desc' }, select: { hash: true, storageKey: true, batchId: true, phase: true, id: true } })
    : []
  // Ήδη σε ΑΥΤΗ την παρτίδα (π.χ. ξαναδιαλέχτηκε ο ίδιος φάκελος μετά από διακοπή) → το ίδιο αρχείο, όχι διπλό·
  // αν δεν είχε προλάβει να ανέβει, ανεβαίνει τώρα στην ίδια εγγραφή.
  const inBatch = hashes.length ? await prisma.importItem.findMany({ where: { batchId: batch.id, hash: { in: hashes } }, select: { id: true, hash: true, storageKey: true, phase: true } }) : []
  const out: { clientId: string; itemId: string; needsUpload: boolean }[] = []
  for (const f of files) {
    const junk = junkOf(f.name, f.size)
    const same = f.hash ? inBatch.find(s => s.hash === f.hash) : undefined
    if (same) { out.push({ clientId: f.clientId, itemId: same.id, needsUpload: !same.storageKey && same.phase === 'UPLOADING' }); continue }
    // «Υπάρχει ήδη» σε δικαιολογητικά/αρχεία/έργα του πελάτη → δεν ανεβαίνει καν.
    const existing = !junk ? await findExisting(trdrId, f.hash) : null
    const prev = !existing && f.hash ? staged.find(s => s.hash === f.hash) : undefined
    const item = await prisma.importItem.create({
      data: {
        batchId: batch.id, trdrId, fileName: f.name.slice(0, 250), relPath: f.relPath?.slice(0, 500) || null, size: f.size, mimeType: f.mimeType || 'application/octet-stream', hash: f.hash,
        ...(junk ? { phase: 'SKIPPED', dest: 'junk', junkReason: junk }
          : existing ? { phase: 'SKIPPED', dest: existing.where === 'dossier' ? 'dossier' : existing.where === 'customer-file' ? 'files' : existing.where === 'inbox' ? 'invoice' : 'quote', resultNote: existing.note }
          : prev ? { phase: 'QUEUED', storageKey: prev.storageKey } : {}),
      },
      select: { id: true },
    })
    out.push({ clientId: f.clientId, itemId: item.id, needsUpload: !junk && !existing && !prev })
  }
  if (out.some(o => !o.needsUpload)) kickImportSweep()
  return { batchId: batch.id, items: out }
}

export type SaveDecision = {
  dest: 'dossier' | 'approval' | 'quote' | 'invoice' | 'files' | 'junk'
  typeId?: string | null
  period?: string | null
  programId?: string | null
  reusable?: boolean
  issuedAt?: string | null
  expiresAt?: string | null
  appId?: string | null
  replaceDocId?: string | null
}

/** Αποθήκευση ενός αρχείου της παρτίδας στον προορισμό του (από το προσωρινό αντίγραφο — χωρίς νέο ανέβασμα). */
export async function saveImportItem(itemId: string, d: SaveDecision): Promise<{ ok: true; note: string; covered: number; coveredPrograms: string[]; extra?: unknown } | { ok: false; message: string }> {
  const session = await requirePermission('customer.edit')
  const item = await prisma.importItem.findUnique({ where: { id: itemId } })
  if (!item) return { ok: false, message: 'Το αρχείο δεν βρέθηκε.' }
  if (item.phase === 'SAVED') return { ok: true, note: item.resultNote ?? 'Έχει ήδη αποθηκευτεί.', covered: 0, coveredPrograms: [] }
  if (d.dest === 'junk') {
    await prisma.importItem.update({ where: { id: itemId }, data: { phase: 'SKIPPED', dest: 'junk', resultNote: 'Δεν ανέβηκε.' } })
    return { ok: true, note: 'Παραλείφθηκε.', covered: 0, coveredPrograms: [] }
  }
  if (!item.storageKey) return { ok: false, message: 'Το αρχείο δεν έχει ανέβει ακόμη.' }
  await prisma.importItem.update({ where: { id: itemId }, data: { phase: 'SAVING' } })
  try {
    const buf = await bunnyDownload(item.storageKey)
    const ext = /\.([a-z0-9]{1,10})$/i.exec(item.fileName)?.[1]?.toLowerCase() ?? 'bin'
    let note = ''
    let covered = 0
    let coveredPrograms: string[] = []
    let extra: unknown
    let ref: string | null = null
    if (d.dest === 'dossier') {
      if (!d.typeId) throw new Error('Επιλέξτε τύπο δικαιολογητικού.')
      const s = item.suggestion as SmartClassifyResult | null
      const text = item.hash ? (await prisma.documentTextCache.findUnique({ where: { hash: item.hash }, select: { text: true } }))?.text ?? '' : ''
      const { createDossierDocCore } = await import('@/lib/documents/dossier-core')
      const r = await createDossierDocCore(item.trdrId, session.user.id, {
        documentTypeId: d.typeId, name: item.fileName.replace(/\.[^.]+$/, ''), base64: buf.toString('base64'), body: buf, mimeType: item.mimeType, ext,
        issuedAt: d.issuedAt ?? s?.issuedAt ?? null, expiresAt: d.expiresAt ?? null, programId: d.programId ?? null, reusable: d.reusable ?? true,
        learn: { predictedTypeId: s?.typeId ?? null, snippet: text, fileName: item.fileName }, replaceDocId: d.replaceDocId ?? null, fullText: text || null, period: d.period ?? null,
      })
      ref = r.id
      covered = r.covered
      coveredPrograms = r.coveredPrograms
      extra = { eme: r.eme ?? null, e3: r.e3 ?? null, mme: r.mme ?? null, template: r.template ?? null }
      note = 'στα δικαιολογητικά'
    } else if (d.dest === 'files') {
      const trdr = await prisma.trdr.findUniqueOrThrow({ where: { id: item.trdrId }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
      const { buildTrdrFolderPath } = await import('@/lib/trdr/cdn-folder')
      const { safeRelativeDir, safeSegment } = await import('@/lib/trdr/safe-name')
      const root = trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
      const dir = item.relPath?.includes('/') ? item.relPath.slice(0, item.relPath.lastIndexOf('/')) : ''
      const extDot = (/\.[a-z0-9]{1,10}$/i.exec(item.fileName)?.[0] ?? '').toLowerCase()
      const key = `${root}${safeRelativeDir(dir)}${Date.now()}-${crypto.randomUUID().slice(0, 8)}-${safeSegment(item.fileName.replace(/\.[a-z0-9]{1,10}$/i, ''), 'file')}${extDot}`
      await bunnyUploadPrivate({ key, body: buf, contentType: item.mimeType })
      const { recordFileHash } = await import('./existing')
      await recordFileHash({ key, hash: item.hash, body: item.hash ? undefined : buf, trdrId: item.trdrId, kind: 'customer-file', label: dir ? `${dir}/${item.fileName}` : item.fileName })
      ref = key
      note = `στα αρχεία πελάτη${dir ? ` › ${dir}` : ''}`
    } else {
      if (!d.appId) throw new Error('Επιλέξτε έργο.')
      const { stageInboxDoc } = await import('@/lib/pm/expense-inbox')
      const r = await stageInboxDoc({ applicationId: d.appId, kind: d.dest === 'quote' ? 'QUOTE' : d.dest === 'approval' ? 'APPROVAL' : 'INVOICE', name: item.fileName, base64: buf.toString('base64'), mimeType: item.mimeType, ext, relPath: item.relPath })
      if (!r.ok) throw new Error(r.message)
      ref = r.id
      note = `«Προς καταχώριση» στο έργο ${r.programTitle}${r.read ? '' : ' (χωρίς ανάγνωση)'}`
    }
    await prisma.importItem.update({ where: { id: itemId }, data: { phase: 'SAVED', dest: d.dest, resultRef: ref, resultNote: note, error: null } })
    await dropStaging(item.storageKey)
    revalidatePath(`/partners/${item.trdrId}`)
    return { ok: true, note, covered, coveredPrograms, extra }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.'
    await prisma.importItem.update({ where: { id: itemId }, data: { phase: 'REVIEW', error: message.slice(0, 300) } })
    return { ok: false, message }
  }
}

/** Το προσωρινό αντίγραφο σβήνεται όταν δεν το χρειάζεται πια κανένα αρχείο παρτίδας. */
async function dropStaging(key: string) {
  const still = await prisma.importItem.count({ where: { storageKey: key, phase: { notIn: ['SAVED', 'SKIPPED'] } } })
  if (!still) await bunnyDeleteOne(key).catch(() => {})
}

/** Παράλειψη / αφαίρεση αρχείου από την παρτίδα. */
export async function skipImportItem(itemId: string): Promise<void> {
  await requirePermission('customer.edit')
  const item = await prisma.importItem.update({ where: { id: itemId }, data: { phase: 'SKIPPED', resultNote: 'Αφαιρέθηκε από τη λίστα.' }, select: { storageKey: true } })
  if (item.storageKey) await dropStaging(item.storageKey)
}

/** «Ξανά»: αρχεία σε αναμονή/αποτυχημένα → άμεση νέα προσπάθεια. */
export async function retryImportItems(itemIds: string[]): Promise<number> {
  await requirePermission('customer.edit')
  const r = await prisma.importItem.updateMany({ where: { id: { in: itemIds }, phase: { in: ['WAITING', 'FAILED', 'REVIEW'] }, storageKey: { not: null } }, data: { phase: 'QUEUED', attempts: 0, nextAttemptAt: null, waitReason: null, error: null } })
  kickImportSweep()
  return r.count
}

/** Αναίρεση αυτόματης αποθήκευσης: το δικαιολογητικό αφαιρείται (και το παράδειγμα εκμάθησης που δημιούργησε)
 * και το αρχείο επιστρέφει «Για έλεγχο» με την ίδια πρόταση. */
export async function undoAutoSavedItem(itemId: string): Promise<{ ok: boolean; message?: string }> {
  await requirePermission('customer.edit')
  const item = await prisma.importItem.findUnique({ where: { id: itemId }, select: { trdrId: true, autoSaved: true, resultRef: true, fileName: true, storageKey: true } })
  if (!item?.autoSaved || !item.resultRef) return { ok: false, message: 'Δεν είναι αυτόματη αποθήκευση.' }
  if (!item.storageKey) return { ok: false, message: 'Το προσωρινό αντίγραφο δεν υπάρχει πια.' }
  const doc = await prisma.trdrDossierDocument.findFirst({ where: { id: item.resultRef, trdrId: item.trdrId }, select: { id: true, createdAt: true, documentTypeId: true, storageKey: true } })
  if (doc) {
    // Επαναφορά κάλυψης εκκρεμοτήτων: τα αντίγραφα του εγγράφου στα έργα φεύγουν και όσες εκκρεμότητες έμειναν
    // χωρίς έγγραφο ξανανοίγουν· οι σειρές ξαναϋπολογίζονται.
    const copies = await prisma.applicationDocument.findMany({ where: { storageKey: doc.storageKey, application: { trdrId: item.trdrId } }, select: { id: true, obligationId: true } })
    await prisma.applicationDocument.deleteMany({ where: { id: { in: copies.map(c => c.id) } } })
    for (const obId of new Set(copies.map(c => c.obligationId).filter((x): x is string => !!x))) {
      const left = await prisma.applicationDocument.count({ where: { obligationId: obId } })
      if (!left) await prisma.applicationObligation.updateMany({ where: { id: obId, status: 'SUBMITTED' }, data: { status: 'PENDING', notes: null } })
    }
    await prisma.trdrDossierDocument.delete({ where: { id: doc.id } })
    const type = await prisma.documentType.findUnique({ where: { id: doc.documentTypeId }, select: { seriesKind: true } })
    if (type?.seriesKind) {
      const { syncSeriesObligation } = await import('@/lib/pm/form-obligations')
      const obs = await prisma.applicationObligation.findMany({ where: { kind: 'FORM', application: { trdrId: item.trdrId }, sourceId: { in: (await prisma.programRequiredForm.findMany({ where: { documentTypeId: doc.documentTypeId }, select: { id: true } })).map(f => f.id) } }, select: { id: true } })
      for (const o of obs) await syncSeriesObligation(o.id).catch(() => {})
    }
    // Το παράδειγμα εκμάθησης της αυτόματης αποθήκευσης (ίδιο αρχείο, ίδια στιγμή) — να μη «μάθει» κάτι που αναιρέθηκε.
    await prisma.documentClassificationExample.deleteMany({ where: { trdrId: item.trdrId, documentTypeId: doc.documentTypeId, fileName: item.fileName.slice(0, 200), createdAt: { gte: new Date(doc.createdAt.getTime() - 60_000) } } })
  }
  await prisma.importItem.update({ where: { id: itemId }, data: { phase: 'REVIEW', autoSaved: false, resultRef: null, resultNote: null } })
  revalidatePath(`/partners/${item.trdrId}`)
  return { ok: true }
}

/** Κλείσιμο παρτίδας (όταν δεν μένει τίποτα για έλεγχο) — τα προσωρινά καθαρίζονται. */
export async function finishImportBatch(batchId: string): Promise<void> {
  await requirePermission('customer.edit')
  const items = await prisma.importItem.findMany({ where: { batchId, phase: { notIn: ['SAVED', 'SKIPPED'] } }, select: { id: true, storageKey: true } })
  await prisma.importItem.updateMany({ where: { id: { in: items.map(i => i.id) } }, data: { phase: 'SKIPPED', resultNote: 'Η παρτίδα έκλεισε.' } })
  // Όλα τα προσωρινά της παρτίδας (και των αυτόματων αποθηκεύσεων — πλέον δεν αναιρούνται).
  const keys = await prisma.importItem.findMany({ where: { batchId, storageKey: { not: null } }, select: { storageKey: true } })
  for (const k of new Set(keys.map(i => i.storageKey!))) await dropStaging(k)
  await prisma.importBatch.update({ where: { id: batchId }, data: { status: 'DONE' } })
}
