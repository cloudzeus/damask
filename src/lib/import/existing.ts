import crypto from 'node:crypto'
import { prisma } from '@/lib/prisma'

/**
 * (Plain module.) «Υπάρχει ήδη»: ένας έλεγχος με το hash περιεχομένου σε ΟΛΑ όσα έχει ήδη ο πελάτης — δικαιολογητικά
 * (contentHash), αρχεία πελάτη, «Προς καταχώριση», προσφορές και έγγραφα αγορών (StoredFileHash). Καλείται πριν από
 * οποιοδήποτε ανέβασμα/AI στη μαζική εισαγωγή.
 */

export type ExistingKind = 'customer-file' | 'inbox' | 'quote' | 'purchase' | 'project-doc'

export function sha256Hex(body: Buffer): string {
  return crypto.createHash('sha256').update(body).digest('hex')
}

/** Καταγραφή hash αρχείου (fire-and-forget από τα σημεία ανεβάσματος — ποτέ δεν αποτυγχάνει το ανέβασμα). */
export async function recordFileHash(input: { key: string; hash?: string | null; body?: Buffer; trdrId: string | null; kind: ExistingKind; label: string; ref?: string | null }): Promise<void> {
  try {
    const hash = input.hash ?? (input.body ? sha256Hex(input.body) : null)
    if (!hash) return
    await prisma.storedFileHash.upsert({
      where: { key: input.key },
      create: { key: input.key, hash, trdrId: input.trdrId, kind: input.kind, label: input.label.slice(0, 250), ref: input.ref ?? null },
      update: { hash, trdrId: input.trdrId, kind: input.kind, label: input.label.slice(0, 250), ref: input.ref ?? null },
    })
  } catch (err) {
    console.error('[existing] recordFileHash απέτυχε', err)
  }
}

export type ExistingHit = { where: 'dossier' | ExistingKind; note: string }

/** Πού υπάρχει ήδη το ίδιο αρχείο για τον πελάτη (ή null). Επαληθεύει ότι η εγγραφή υπάρχει ακόμη. */
export async function findExisting(trdrId: string, hash: string | null | undefined, opts: { ignoreKey?: string | null } = {}): Promise<ExistingHit | null> {
  if (!hash) return null
  const dossier = await prisma.trdrDossierDocument.findFirst({ where: { trdrId, contentHash: hash }, select: { name: true, period: true, documentType: { select: { name: true } } } })
  if (dossier) return { where: 'dossier', note: `Υπάρχει ήδη στα δικαιολογητικά ως «${dossier.name}» (${dossier.documentType.name}${dossier.period ? ` ${dossier.period}` : ''}).` }

  // `ignoreKey`: το πρωτότυπο ενός εισερχομένου (π.χ. το αρχείο πελάτη που μόλις ανέβηκε) δεν είναι «ήδη υπάρχον» για τον εαυτό του.
  const hits = await prisma.storedFileHash.findMany({ where: { trdrId, hash, ...(opts.ignoreKey ? { key: { not: opts.ignoreKey } } : {}) }, orderBy: { createdAt: 'desc' }, take: 10 })
  for (const h of hits) {
    if (h.kind === 'customer-file') {
      const live = await prisma.fileIndexEntry.findFirst({ where: { key: h.key, missingAt: null }, select: { id: true } })
      // Το ευρετήριο αρχείων ενημερώνεται με λίγη καθυστέρηση — ένα πρόσφατο ανέβασμα μετρά ακόμη κι αν δεν έχει καταγραφεί.
      if (live || Date.now() - h.createdAt.getTime() < 10 * 60_000) return { where: 'customer-file', note: `Υπάρχει ήδη στα αρχεία πελάτη (${h.label}).` }
    } else if (h.kind === 'inbox' && h.ref) {
      const doc = await prisma.applicationInboxDoc.findFirst({ where: { id: h.ref, status: { not: 'DISMISSED' } }, select: { status: true, application: { select: { program: { select: { title: true } } } } } })
      if (doc) return { where: 'inbox', note: `Υπάρχει ήδη στο έργο «${doc.application.program.title}» (${doc.status === 'DONE' ? 'καταχωρισμένο στις δαπάνες' : '«Προς καταχώριση»'}).` }
    } else if (h.kind === 'quote' && h.ref) {
      const e = await prisma.programExpense.findFirst({ where: { id: h.ref, quoteStorageKey: h.key }, select: { description: true } })
      if (e) return { where: 'quote', note: `Υπάρχει ήδη ως προσφορά της δαπάνης «${e.description.slice(0, 80)}».` }
    } else if (h.kind === 'project-doc') {
      const d = await prisma.applicationDocument.findFirst({ where: { storageKey: h.key }, select: { application: { select: { program: { select: { title: true } } } } } })
      if (d) return { where: 'project-doc', note: `Υπάρχει ήδη στα έγγραφα του έργου «${d.application.program.title}».` }
    } else if (h.kind === 'purchase' && h.ref) {
      const p = await prisma.expensePurchase.findFirst({ where: { expenseId: h.ref, OR: [{ invoiceKey: h.key }, { bankExtraitKey: h.key }, { supplierCertKey: h.key }] }, select: { expense: { select: { description: true } } } })
      if (p) return { where: 'purchase', note: `Υπάρχει ήδη στα έγγραφα αγοράς της δαπάνης «${p.expense.description.slice(0, 80)}».` }
    }
  }
  return null
}
