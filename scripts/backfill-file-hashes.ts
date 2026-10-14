/**
 * Αναδρομική καταγραφή αποτυπωμάτων (sha256) για το «Υπάρχει ήδη»: αρχεία «Προς καταχώριση» έργων και δικαιολογητικά
 * χωρίς contentHash (π.χ. από το portal) που δημιουργήθηκαν πριν καταγράφεται το hash. Ασφαλές να ξανατρέξει.
 *   npx tsx scripts/backfill-file-hashes.ts
 */
import 'dotenv/config'
import crypto from 'node:crypto'
import { prisma } from '../src/lib/prisma'
import { bunnyDownload } from '../src/lib/bunny-storage'
import { recordFileHash } from '../src/lib/import/existing'

async function main() {
  const known = new Set((await prisma.storedFileHash.findMany({ select: { key: true } })).map(k => k.key))
  const inbox = await prisma.applicationInboxDoc.findMany({ select: { id: true, storageKey: true, trdrId: true, fileName: true } })
  let a = 0
  for (const d of inbox) {
    if (known.has(d.storageKey)) continue
    try { await recordFileHash({ key: d.storageKey, body: await bunnyDownload(d.storageKey), trdrId: d.trdrId, kind: 'inbox', label: d.fileName, ref: d.id }); a++ } catch (err) { console.error('inbox', d.fileName, err instanceof Error ? err.message : err) }
  }
  const dossier = await prisma.trdrDossierDocument.findMany({ where: { contentHash: null }, select: { id: true, storageKey: true } })
  let b = 0
  for (const d of dossier) {
    try { await prisma.trdrDossierDocument.update({ where: { id: d.id }, data: { contentHash: crypto.createHash('sha256').update(await bunnyDownload(d.storageKey)).digest('hex') } }); b++ } catch (err) { console.error('dossier', d.id, err instanceof Error ? err.message : err) }
  }
  console.log({ inboxHashed: a, dossierHashed: b })
}
main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1) })
