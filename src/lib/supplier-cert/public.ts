'use server'

import { prisma } from '@/lib/prisma'
import type { CertData } from './content'
import { storeCertImage, finalizeCert } from './core'

/**
 * Δημόσια (token-gated, ΧΩΡΙΣ session) σελίδα του προμηθευτή /b/[token]: προβολή βεβαίωσης, ανέβασμα λογοτύπου
 * (κρατιέται στην καρτέλα του προμηθευτή για τις επόμενες βεβαιώσεις), υπογραφή με το χέρι ή/και σφραγίδα.
 */

export type PublicCert =
  | { ok: true; status: string; data: CertData; logo: string | null; signedAt: string | null; signerName: string | null; signerTitle: string | null; expiresAt: string }
  | { ok: false; reason: 'not_found' | 'expired' }

async function byToken(token: string) {
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) return null
  return prisma.supplierCertificate.findUnique({ where: { token } })
}

export async function getPublicCert(token: string): Promise<PublicCert> {
  const c = await byToken(token)
  if (!c) return { ok: false, reason: 'not_found' }
  if (c.status !== 'SIGNED' && c.expiresAt.getTime() < Date.now()) return { ok: false, reason: 'expired' }
  if (!c.viewedAt) await prisma.supplierCertificate.update({ where: { id: c.id }, data: { viewedAt: new Date() } })
  const sup = c.supplierTrdrId ? await prisma.trdr.findUnique({ where: { id: c.supplierTrdrId }, select: { supplierLogoKey: true } }) : null
  return {
    ok: true, status: c.status, data: c.data as unknown as CertData,
    logo: sup?.supplierLogoKey ? `/b/${token}/logo` : null,
    signedAt: c.signedAt?.toISOString() ?? null, signerName: c.signerName, signerTitle: c.signerTitle,
    expiresAt: c.expiresAt.toISOString(),
  }
}

type Img = { base64: string; mime: string }

/** Λογότυπο του προμηθευτή (μένει στην καρτέλα του και χρησιμοποιείται σε όλες τις βεβαιώσεις του). */
export async function uploadSupplierLogo(token: string, img: Img): Promise<{ ok: boolean; message?: string }> {
  const c = await byToken(token)
  if (!c || c.status === 'SIGNED' || c.expiresAt.getTime() < Date.now()) return { ok: false, message: 'Ο σύνδεσμος δεν είναι πλέον ενεργός.' }
  if (!c.supplierTrdrId) return { ok: false, message: 'Δεν βρέθηκε η καρτέλα του προμηθευτή.' }
  try {
    const key = await storeCertImage(c.id, 'logo', img.base64, img.mime, c.supplierTrdrId)
    await prisma.trdr.update({ where: { id: c.supplierTrdrId }, data: { supplierLogoKey: key } })
    return { ok: true }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.' }
  }
}

/** Υπογραφή: ονοματεπώνυμο + ιδιόχειρη υπογραφή (PNG από τον καμβά) και/ή σφραγίδα (εικόνα) → τελικό PDF. */
export async function signPublicCert(token: string, input: { signerName: string; signerTitle?: string | null; signature?: Img | null; stamp?: Img | null; place?: string | null }): Promise<{ ok: boolean; message?: string }> {
  const c = await byToken(token)
  if (!c) return { ok: false, message: 'Ο σύνδεσμος δεν βρέθηκε.' }
  if (c.status === 'SIGNED') return { ok: false, message: 'Η βεβαίωση έχει ήδη υπογραφεί.' }
  if (c.expiresAt.getTime() < Date.now()) return { ok: false, message: 'Ο σύνδεσμος έληξε — ζητήστε νέο.' }
  const name = input.signerName.trim()
  if (name.length < 3) return { ok: false, message: 'Συμπληρώστε το ονοματεπώνυμο του υπογράφοντος.' }
  if (!input.signature && !input.stamp) return { ok: false, message: 'Υπογράψτε στο πλαίσιο ή προσθέστε τη σφραγίδα της εταιρίας.' }
  try {
    const signatureKey = input.signature ? await storeCertImage(c.id, 'signature', input.signature.base64, input.signature.mime) : null
    const stampKey = input.stamp ? await storeCertImage(c.id, 'stamp', input.stamp.base64, input.stamp.mime) : null
    const data = c.data as unknown as CertData
    const place = input.place?.trim().slice(0, 80)
    await prisma.supplierCertificate.update({
      where: { id: c.id },
      data: {
        signatureKey, stampKey, signerName: name.slice(0, 120), signerTitle: input.signerTitle?.trim().slice(0, 120) || null, signedAt: new Date(),
        ...(place && place !== data.place ? { data: { ...data, place } as unknown as object } : {}),
      },
    })
    await finalizeCert(c.id)
    return { ok: true }
  } catch (err) {
    console.error('[supplier-cert] sign failed', err)
    return { ok: false, message: err instanceof Error ? err.message : 'Η υπογραφή απέτυχε — δοκιμάστε ξανά.' }
  }
}
