import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bunnyDownload, bunnyUploadPrivate } from '@/lib/bunny-storage'
import type { CertData, CertItem } from './content'
import { renderSupplierCertPdf, type CertImages } from './pdf'

/**
 * (Plain module — χωρίς έλεγχο δικαιωμάτων· ο καλών κάνει session ή token έλεγχο.)
 * Βεβαίωση προμηθευτή: προσυμπλήρωση από την αγορά, εικόνες (λογότυπο/υπογραφή/σφραγίδα), τελικό PDF.
 */

export const CERT_TTL_DAYS = 90
const n = (v: unknown) => (v == null ? '' : String(v))

function qty(q: Prisma.Decimal | null): string {
  if (q == null) return '1'
  const x = Number(q)
  return Number.isInteger(x) ? String(x) : x.toLocaleString('el-GR', { maximumFractionDigits: 3 })
}

async function doyName(code: string | null): Promise<string> {
  if (!code) return ''
  const row = await prisma.irsdata.findFirst({ where: { CODE: code }, select: { NAME: true } }).catch(() => null)
  return row?.NAME ?? code
}

const addr = (t: { ADDRESS: string | null; ZIP: string | null; CITY: string | null }) =>
  [t.ADDRESS, [t.ZIP, t.CITY].filter(Boolean).join(' ')].filter(Boolean).join(', ')

/** Προσυμπλήρωση από τη δαπάνη: προμηθευτής, δικαιούχος, πρόγραμμα, τιμολόγιο, είδη (γραμμές δαπάνης). */
export async function buildDefaultCertData(expenseId: string): Promise<CertData> {
  const e = await prisma.programExpense.findUniqueOrThrow({
    where: { id: expenseId },
    select: {
      description: true, date: true, docNumber: true, vendor: true, vendorAfm: true,
      supplier: { select: { NAME: true, AFM: true, IRSDATA: true, ADDRESS: true, ZIP: true, CITY: true } },
      lines: { orderBy: { order: 'asc' }, select: { product: true, description: true, quantity: true, unit: true } },
      purchase: { select: { invoiceNumber: true, invoiceDate: true, serial: true, paidAmount: true, ocrNumber: true, ocrDate: true, invoiceLines: true } },
      application: {
        select: {
          trdr: { select: { NAME: true, AFM: true, ADDRESS: true, ZIP: true, CITY: true, IRSDATA: true } },
          program: { select: { title: true, cmsContent: true } },
        },
      },
    },
  })
  const sup = e.supplier
  const buyer = e.application.trdr
  const p = e.purchase
  const serial = p?.serial?.trim() ?? ''
  // 1η πηγή: οι γραμμές του καταχωρημένου ΠΑΡΑΣΤΑΤΙΚΟΥ (OCR τιμολογίου: περιγραφή/κωδικός/ποσότητα/σειριακός) —
  // η βεβαίωση πρέπει να ταυτίζεται με το τιμολόγιο. Εφεδρεία: οι γραμμές της δαπάνης (προσφορά).
  const inv = Array.isArray(p?.invoiceLines) ? (p.invoiceLines as { description?: string; code?: string | null; serial?: string | null; quantity?: number | null }[]) : []
  let items: CertItem[] = inv.length
    ? inv.filter(l => l.description?.trim()).map(l => ({
        code: n(l.code), description: String(l.description).slice(0, 300),
        quantity: l.quantity == null ? '1' : Number.isInteger(l.quantity) ? String(l.quantity) : l.quantity.toLocaleString('el-GR', { maximumFractionDigits: 3 }),
        unit: '', serial: n(l.serial),
      }))
    : e.lines.map(l => ({
        code: '', description: [l.product, l.description].filter(Boolean).join(' — ').slice(0, 300),
        quantity: qty(l.quantity), unit: n(l.unit), serial: '',
      }))
  if (!items.length) items = [{ code: '', description: e.description.slice(0, 300), quantity: '1', unit: '', serial: '' }]
  // Ένας σειριακός στην αγορά και ένα είδος → πάει σε αυτό· πολλά είδη → τα συμπληρώνει ο χρήστης.
  if (serial && items.length === 1 && !items[0].serial) items[0].serial = serial
  const invoiceDate = p?.invoiceDate ?? p?.ocrDate ?? e.date
  return {
    supplier: {
      name: sup?.NAME ?? n(e.vendor),
      afm: sup?.AFM ?? n(e.vendorAfm),
      doy: sup ? await doyName(sup.IRSDATA) : '',
      address: sup ? addr(sup) : '',
    },
    buyer: { name: buyer.NAME, afm: n(buyer.AFM), doy: await doyName(buyer.IRSDATA), address: addr(buyer) },
    programTitle: (e.application.program.cmsContent as { cardTitle?: string } | null)?.cardTitle || e.application.program.title,
    invoiceNumber: p?.invoiceNumber ?? p?.ocrNumber ?? n(e.docNumber),
    invoiceDate: invoiceDate ? invoiceDate.toISOString().slice(0, 10) : '',
    items,
    place: sup?.CITY ?? '',
    paid: { enabled: false, amount: p?.paidAmount != null ? Number(p.paidAmount).toLocaleString('el-GR', { minimumFractionDigits: 2 }) : '', date: '', method: 'τραπεζική μεταφορά' },
    vehicle: { enabled: false, vin: '' },
    software: false,
    issuerRole: 'supplier',
  }
}

export const newCertToken = () => crypto.randomBytes(24).toString('base64url')

async function dataUri(key: string | null | undefined): Promise<string | null> {
  if (!key) return null
  try {
    const buf = await bunnyDownload(key)
    const ext = key.split('.').pop()?.toLowerCase()
    const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg'
    return `data:${mime};base64,${buf.toString('base64')}`
  } catch { return null }
}

export type CertRow = {
  id: string; expenseId: string; data: Prisma.JsonValue; supplierTrdrId: string | null
  signerName: string | null; signerTitle: string | null; signatureKey: string | null; stampKey: string | null; signedAt: Date | null
}

/** PDF (πρόχειρο ή υπογεγραμμένο) με όλες τις εικόνες που υπάρχουν. */
export async function renderCertPdf(cert: CertRow): Promise<Buffer> {
  const supplier = cert.supplierTrdrId ? await prisma.trdr.findUnique({ where: { id: cert.supplierTrdrId }, select: { supplierLogoKey: true } }) : null
  const images: CertImages = {
    logo: await dataUri(supplier?.supplierLogoKey),
    signature: await dataUri(cert.signatureKey),
    stamp: await dataUri(cert.stampKey),
  }
  return renderSupplierCertPdf({ data: cert.data as unknown as CertData, signer: { name: cert.signerName, title: cert.signerTitle }, signedAt: cert.signedAt?.toISOString() ?? null, images })
}

/** Εικόνα (base64) → Bunny private· επιστρέφει key. Μόνο png/jpg/webp, έως 5MB. */
export async function storeCertImage(certId: string, kind: 'signature' | 'stamp' | 'logo', base64: string, mime: string, ownerId?: string): Promise<string> {
  const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : mime === 'image/jpeg' ? 'jpg' : null
  if (!ext) throw new Error('Επιτρέπονται μόνο εικόνες PNG, JPG ή WEBP.')
  const body = Buffer.from(base64, 'base64')
  if (!body.length || body.length > 5 * 1024 * 1024) throw new Error('Η εικόνα πρέπει να είναι έως 5MB.')
  const key = kind === 'logo'
    ? `supplier-logos/${ownerId ?? certId}/${crypto.randomUUID()}.${ext}`
    : `supplier-certs/${certId}/${kind}-${crypto.randomUUID()}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: mime })
  return key
}

/** Ολοκλήρωση: τελικό PDF → αρχείο «Βεβαίωση προμηθευτή» της αγοράς + ειδοποίηση γραφείου. */
export async function finalizeCert(certId: string): Promise<{ pdfKey: string }> {
  const cert = await prisma.supplierCertificate.findUniqueOrThrow({ where: { id: certId } })
  const pdf = await renderCertPdf(cert)
  const pdfKey = `supplier-certs/${certId}/vevaiosi-${Date.now()}.pdf`
  await bunnyUploadPrivate({ key: pdfKey, body: pdf, contentType: 'application/pdf' })
  const data = cert.data as unknown as CertData
  const name = `Βεβαίωση προμηθευτή — ${data.invoiceNumber || 'τιμολόγιο'}.pdf`
  await prisma.$transaction([
    prisma.supplierCertificate.update({ where: { id: certId }, data: { pdfKey, status: 'SIGNED' } }),
    prisma.expensePurchase.upsert({
      where: { expenseId: cert.expenseId },
      create: { expenseId: cert.expenseId, supplierCertKey: pdfKey, supplierCertName: name },
      update: { supplierCertKey: pdfKey, supplierCertName: name },
    }),
  ])
  const exp = await prisma.programExpense.findUnique({ where: { id: cert.expenseId }, select: { applicationId: true, application: { select: { trdr: { select: { NAME: true } } } } } })
  const { createNotification } = await import('@/lib/notifications/service')
  await createNotification({
    title: `Υπογράφηκε βεβαίωση προμηθευτή: ${data.supplier.name}`,
    body: `${exp?.application.trdr.NAME ?? ''} — τιμολόγιο ${data.invoiceNumber || '—'}. Μπήκε αυτόματα στα έγγραφα αγοράς.`,
    entityType: 'ProgramApplication', entityId: exp?.applicationId ?? null, meta: { kind: 'supplier-cert-signed', certId },
  })
  return { pdfKey }
}
