import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'

/**
 * (Plain module — routes/webhooks/actions.) ΕΝΙΑΙΑ ΑΞΙΟΛΟΓΗΣΗ ΕΙΣΕΡΧΟΜΕΝΟΥ ΑΡΧΕΙΟΥ: ό,τι μπαίνει στην εφαρμογή από
 * οπουδήποτε (αρχεία πελάτη, email, portal) περνά από την ίδια ροή με τη μαζική εισαγωγή — «υπάρχει ήδη» → γνώση/μνήμη
 * ρόλων → AI → θέση (δικαιολογητικό, υλοποίηση έργου) ή «για έλεγχο». Το ΠΡΩΤΟΤΥΠΟ μένει εκεί που ανέβηκε· η
 * αξιολόγηση δουλεύει σε προσωρινό αντίγραφο. Μπαίνει στην ενεργή παρτίδα του πελάτη (ίδιο πάνελ «Μαζική εισαγωγή»).
 */

export type IncomingSource = 'CUSTOMER_FILE' | 'EMAIL' | 'PORTAL'

/** Μόνο έγγραφα (όχι video/αρχεία συστήματος) και ως 15MB. */
export function evaluable(name: string, mime: string, size: number): boolean {
  if (size <= 0 || size > 15 * 1024 * 1024) return false
  if (/^(\.|~\$)|thumbs\.db$|\.ds_store$/i.test(name)) return false
  return mime === 'application/pdf' || mime.startsWith('image/') || /\.(pdf|jpe?g|png|webp|heic|docx?|xlsx?|csv|txt)$/i.test(name)
}

/** Ποιος «υπογράφει» αυτόματες αξιολογήσεις χωρίς χρήστη (email): ο δημιουργός του νήματος ή ο πρώτος διαχειριστής. */
async function fallbackUser(preferred: string | null | undefined): Promise<string | null> {
  if (preferred) return preferred
  const admin = await prisma.user.findFirst({ where: { role: { name: { in: ['SUPER_ADMIN', 'ADMIN'] } } }, orderBy: { createdAt: 'asc' }, select: { id: true } }).catch(() => null)
  return admin?.id ?? null
}

/**
 * Βάζει ένα εισερχόμενο αρχείο σε αξιολόγηση (fire-and-forget από τον καλούντα — ποτέ δεν ρίχνει το αρχικό ανέβασμα).
 * `sourceKey` = το πρωτότυπο (π.χ. αρχείο πελάτη), ώστε να μη θεωρηθεί «υπάρχει ήδη» το ίδιο του το αρχείο.
 */
export async function evaluateIncomingFile(input: {
  trdrId: string
  fileName: string
  relPath?: string | null
  mime: string
  body: Buffer
  source: IncomingSource
  sourceKey?: string | null
  userId?: string | null
}): Promise<{ itemId: string } | null> {
  try {
    if (!evaluable(input.fileName, input.mime, input.body.length)) return null
    const userId = await fallbackUser(input.userId)
    if (!userId) return null
    const hash = crypto.createHash('sha256').update(input.body).digest('hex')
    const batch = await prisma.importBatch.findFirst({ where: { trdrId: input.trdrId, status: 'ACTIVE' }, orderBy: { createdAt: 'desc' }, select: { id: true } })
      ?? await prisma.importBatch.create({ data: { trdrId: input.trdrId, createdById: userId }, select: { id: true } })
    // Ίδιο αρχείο ήδη σε αξιολόγηση στην παρτίδα → όχι δεύτερη φορά.
    const dup = await prisma.importItem.findFirst({ where: { batchId: batch.id, hash }, select: { id: true } })
    if (dup) return { itemId: dup.id }
    const item = await prisma.importItem.create({
      data: {
        batchId: batch.id, trdrId: input.trdrId, fileName: input.fileName.slice(0, 250), relPath: input.relPath?.slice(0, 500) ?? null,
        size: input.body.length, mimeType: input.mime || 'application/octet-stream', hash, phase: 'UPLOADING', source: input.source, sourceKey: input.sourceKey ?? null,
      },
    })
    const ext = /\.([a-z0-9]{1,10})$/i.exec(input.fileName)?.[1]?.toLowerCase() ?? 'bin'
    const key = `imports/${batch.id}/${item.id}.${ext}`
    await bunnyUploadPrivate({ key, body: input.body, contentType: input.mime || 'application/octet-stream' })
    await prisma.importItem.update({ where: { id: item.id }, data: { storageKey: key, phase: 'QUEUED' } })
    const { kickImportSweep } = await import('./recognize')
    kickImportSweep()
    return { itemId: item.id }
  } catch (err) {
    console.error('[evaluate] αξιολόγηση εισερχομένου απέτυχε', input.fileName, err)
    return null
  }
}
