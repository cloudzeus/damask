import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'

/**
 * Αυτόματος φάκελος ανά συναλλασσόμενο στο Bunny (private storage). Δομή:
 *   partners/<type>/<ΑΦΜ>/           (type: customers=13, suppliers=12, other)
 * Το Bunny δεν έχει mkdir — «δημιουργούμε» τον φάκελο ανεβάζοντας ένα κενό .keep.
 * Το path αποθηκεύεται στο Trdr.cdnFolder (σταθερό — δεν μετακινείται αν αλλάξει
 * αργότερα ο τύπος). Ιδιωτικό (όχι public URL) — ίδια λογική με τα TrdrDocument.
 */

export function trdrTypeSegment(sodtype: number | null | undefined): 'customers' | 'suppliers' | 'other' {
  if (sodtype === 12) return 'suppliers'
  if (sodtype === 13) return 'customers'
  return 'other'
}

/** Καθαρισμός ΑΦΜ σε path-safe μορφή (μόνο ψηφία). */
function safeAfm(afm: string | null | undefined): string | null {
  const digits = (afm ?? '').replace(/[^0-9]/g, '')
  return digits.length > 0 ? digits : null
}

export function buildTrdrFolderPath(input: { sodtype: number | null; afm: string | null; id: string }): string {
  const type = trdrTypeSegment(input.sodtype)
  const afm = safeAfm(input.afm)
  const leaf = afm ?? `no-afm-${input.id}`
  return `partners/${type}/${leaf}/`
}

/**
 * Εξασφαλίζει ότι υπάρχει φάκελος στο Bunny για τον συναλλασσόμενο και ότι το
 * Trdr.cdnFolder είναι συμπληρωμένο. Idempotent + non-throwing (μια αποτυχία CDN
 * δεν πρέπει να σπάει τη δημιουργία πελάτη). Επιστρέφει το path ή null.
 */
export async function ensureTrdrCdnFolder(trdrId: string): Promise<string | null> {
  try {
    const trdr = await prisma.trdr.findUnique({
      where: { id: trdrId },
      select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true },
    })
    if (!trdr) return null
    if (trdr.cdnFolder) return trdr.cdnFolder // ήδη δημιουργημένος

    const path = buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
    await bunnyUploadPrivate({ key: `${path}.keep`, body: Buffer.from(''), contentType: 'text/plain' })
    await prisma.trdr.update({ where: { id: trdr.id }, data: { cdnFolder: path } })
    return path
  } catch (err) {
    // Bunny μη ρυθμισμένο ή δικτυακό σφάλμα — μη μπλοκάρεις τη δημιουργία.
    console.error(`ensureTrdrCdnFolder(${trdrId}) απέτυχε:`, err instanceof Error ? err.message : err)
    return null
  }
}
