'use server'

import { revalidatePath } from 'next/cache'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { logActivity } from '@/lib/activity/log'
import { deliverCustomerEmail } from '@/lib/email/deliver'
import type { CertData } from './content'
import { buildDefaultCertData, newCertToken, CERT_TTL_DAYS, storeCertImage, finalizeCert } from './core'

/**
 * Γραφείο: σύνταξη / αποθήκευση / αποστολή «Βεβαίωσης προμηθευτή» μιας δαπάνης (perm programs.manage).
 * Η υπογραφή γίνεται από τον προμηθευτή στη δημόσια σελίδα /b/[token] (email ή εσωτερικά σε tablet/κινητό).
 */

const APP_URL = (process.env.AUTH_URL ?? 'http://localhost:3000').replace(/\/$/, '')
export type CertState = {
  id: string | null
  status: 'NEW' | 'DRAFT' | 'SENT' | 'SIGNED'
  data: CertData
  link: string | null
  supplierEmail: string | null
  supplierName: string | null
  hasLogo: boolean
  sentTo: string | null
  sentAt: string | null
  viewedAt: string | null
  signedAt: string | null
  signerName: string | null
}

export async function getSupplierCert(expenseId: string): Promise<CertState> {
  await requirePermission('programs.manage')
  const [cert, exp] = await Promise.all([
    prisma.supplierCertificate.findUnique({ where: { expenseId } }),
    prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { supplier: { select: { NAME: true, EMAIL: true, supplierLogoKey: true } } } }),
  ])
  const base = {
    supplierEmail: exp.supplier?.EMAIL ?? null, supplierName: exp.supplier?.NAME ?? null, hasLogo: !!exp.supplier?.supplierLogoKey,
  }
  if (!cert) {
    return { id: null, status: 'NEW', data: await buildDefaultCertData(expenseId), link: null, sentTo: null, sentAt: null, viewedAt: null, signedAt: null, signerName: null, ...base }
  }
  return {
    id: cert.id, status: cert.status as CertState['status'], data: cert.data as unknown as CertData,
    link: `${APP_URL}/b/${cert.token}`, sentTo: cert.sentTo, sentAt: cert.sentAt?.toISOString() ?? null,
    viewedAt: cert.viewedAt?.toISOString() ?? null, signedAt: cert.signedAt?.toISOString() ?? null, signerName: cert.signerName, ...base,
  }
}

function clean(d: CertData): CertData {
  const t = (v: unknown, max = 300) => String(v ?? '').trim().slice(0, max)
  return {
    supplier: { name: t(d.supplier.name), afm: t(d.supplier.afm, 12), doy: t(d.supplier.doy, 80), address: t(d.supplier.address) },
    buyer: { name: t(d.buyer.name), afm: t(d.buyer.afm, 12), doy: t(d.buyer.doy, 80), address: t(d.buyer.address) },
    programTitle: t(d.programTitle, 400),
    invoiceNumber: t(d.invoiceNumber, 60),
    invoiceDate: /^\d{4}-\d{2}-\d{2}$/.test(d.invoiceDate) ? d.invoiceDate : '',
    items: d.items.map(i => ({ code: t(i.code, 60), description: t(i.description, 400), quantity: t(i.quantity, 20) || '1', unit: t(i.unit, 20), serial: t(i.serial, 400) })).filter(i => i.description).slice(0, 60),
    place: t(d.place, 80),
    paid: { enabled: !!d.paid?.enabled, amount: t(d.paid?.amount, 30), date: /^\d{4}-\d{2}-\d{2}$/.test(d.paid?.date ?? '') ? d.paid.date : '', method: t(d.paid?.method, 60) },
    vehicle: { enabled: !!d.vehicle?.enabled, vin: t(d.vehicle?.vin, 40) },
    software: !!d.software,
    issuerRole: d.issuerRole === 'manufacturer' ? 'manufacturer' : 'supplier',
  }
}

/** Προσυμπλήρωση από την αγορά (για «Γραμμές από το παραστατικό» σε ήδη συνταγμένη βεβαίωση). */
export async function getCertDefaults(expenseId: string): Promise<{ data: CertData; fromInvoice: boolean }> {
  await requirePermission('programs.manage')
  const p = await prisma.expensePurchase.findUnique({ where: { expenseId }, select: { invoiceLines: true } })
  return { data: await buildDefaultCertData(expenseId), fromInvoice: Array.isArray(p?.invoiceLines) && p.invoiceLines.length > 0 }
}

/** Αποθήκευση/ενημέρωση. Αν ήταν υπογεγραμμένη, οποιαδήποτε αλλαγή την ξαναφέρνει σε πρόχειρο (νέα υπογραφή). */
export async function saveSupplierCert(expenseId: string, data: CertData): Promise<CertState> {
  const session = await requirePermission('programs.manage')
  const d = clean(data)
  if (!d.items.length) throw new Error('Προσθέστε τουλάχιστον ένα είδος.')
  const exp = await prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { supplierTrdrId: true } })
  const existing = await prisma.supplierCertificate.findUnique({ where: { expenseId }, select: { id: true, status: true } })
  const json = d as unknown as Prisma.InputJsonValue
  if (existing) {
    await prisma.supplierCertificate.update({
      where: { id: existing.id },
      data: {
        data: json, supplierTrdrId: exp.supplierTrdrId,
        ...(existing.status === 'SIGNED' ? { status: 'DRAFT', signedAt: null, signatureKey: null, stampKey: null, pdfKey: null } : {}),
      },
    })
  } else {
    await prisma.supplierCertificate.create({
      data: { expenseId, token: newCertToken(), data: json, supplierTrdrId: exp.supplierTrdrId, expiresAt: new Date(Date.now() + CERT_TTL_DAYS * 864e5), createdById: session.user.id },
    })
  }
  await logActivity('supplier_cert.save', { entityType: 'expense', entityId: expenseId, userId: session.user.id })
  return getSupplierCert(expenseId)
}

/** Αποστολή στον προμηθευτή με σύνδεσμο υπογραφής (μέσω του κοινού tagged μονοπατιού email). */
export async function sendSupplierCert(expenseId: string, input: { to: string; note?: string | null }): Promise<{ ok: boolean; message: string }> {
  const session = await requirePermission('programs.manage')
  const to = input.to.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) return { ok: false, message: 'Μη έγκυρο email.' }
  const cert = await prisma.supplierCertificate.findUnique({ where: { expenseId } })
  if (!cert) return { ok: false, message: 'Αποθηκεύστε πρώτα τη βεβαίωση.' }
  const exp = await prisma.programExpense.findUniqueOrThrow({ where: { id: expenseId }, select: { applicationId: true, application: { select: { programId: true } } } })
  const d = cert.data as unknown as CertData
  const link = `${APP_URL}/b/${cert.token}`
  const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!))
  const bodyHtml = [
    `<p>Αγαπητοί συνεργάτες της ${esc(d.supplier.name)},</p>`,
    `<p>για την αγορά της επιχείρησης <b>${esc(d.buyer.name)}</b> με το τιμολόγιο <b>${esc(d.invoiceNumber || '—')}</b>, χρειάζεται η βεβαίωση προμηθευτή (καινούργιο – αμεταχείριστο – μη παρακράτηση κυριότητας) που ζητά το πρόγραμμα «${esc(d.programTitle)}».</p>`,
    '<p>Την έχουμε ήδη συντάξει με όλα τα στοιχεία της αγοράς. Χρειάζεται μόνο να την ελέγξετε και να την υπογράψετε — με το δάχτυλο σε κινητό/tablet ή προσθέτοντας τη σφραγίδα σας. Μπορείτε να ανεβάσετε και το λογότυπό σας ώστε να εμφανίζεται στη βεβαίωση.</p>',
    input.note?.trim() ? `<p>${esc(input.note.trim())}</p>` : '',
    `<p style="margin:24px 0"><a href="${link}" style="background:#001B72;color:#fff;padding:12px 22px;border-radius:999px;text-decoration:none;font-weight:700">Έλεγχος & υπογραφή βεβαίωσης</a></p>`,
    `<p style="color:#666;font-size:13px">Ο σύνδεσμος ισχύει έως ${cert.expiresAt.toLocaleDateString('el-GR')}. Αν δεν λειτουργεί, αντιγράψτε τον: ${link}</p>`,
  ].join('\n')
  const r = await deliverCustomerEmail({ id: session.user.id, name: session.user.name }, {
    trdrId: cert.supplierTrdrId ?? undefined, applicationId: exp.applicationId, programId: exp.application.programId,
    to, subject: `Βεβαίωση προμηθευτή — τιμολόγιο ${d.invoiceNumber || ''} (${d.buyer.name})`.trim(), bodyHtml,
  })
  if (!r.ok) return { ok: false, message: r.error ?? 'Η αποστολή απέτυχε.' }
  await prisma.supplierCertificate.update({ where: { id: cert.id }, data: { sentTo: to, sentAt: new Date(), ...(cert.status === 'DRAFT' ? { status: 'SENT' } : {}) } })
  // Το email του προμηθευτή κρατιέται στην καρτέλα του αν έλειπε.
  if (cert.supplierTrdrId) await prisma.trdr.updateMany({ where: { id: cert.supplierTrdrId, EMAIL: null }, data: { EMAIL: to } })
  await logActivity('supplier_cert.send', { entityType: 'expense', entityId: expenseId, userId: session.user.id, meta: { to } })
  return { ok: true, message: `Στάλθηκε στο ${to}.` }
}

/** Υπογραφή από το γραφείο για λογαριασμό του προμηθευτή (π.χ. ήρθε σφραγισμένη σε χαρτί) — ανέβασμα σφραγίδας/υπογραφής. */
export async function signSupplierCertInternally(expenseId: string, input: { signerName: string; signerTitle?: string | null; signature?: { base64: string; mime: string } | null; stamp?: { base64: string; mime: string } | null }): Promise<CertState> {
  const session = await requirePermission('programs.manage')
  const cert = await prisma.supplierCertificate.findUniqueOrThrow({ where: { expenseId } })
  if (!input.signature && !input.stamp) throw new Error('Χρειάζεται υπογραφή ή σφραγίδα.')
  const signatureKey = input.signature ? await storeCertImage(cert.id, 'signature', input.signature.base64, input.signature.mime) : cert.signatureKey
  const stampKey = input.stamp ? await storeCertImage(cert.id, 'stamp', input.stamp.base64, input.stamp.mime) : cert.stampKey
  await prisma.supplierCertificate.update({ where: { id: cert.id }, data: { signatureKey, stampKey, signerName: input.signerName.trim().slice(0, 120) || null, signerTitle: input.signerTitle?.trim().slice(0, 120) || null, signedAt: new Date() } })
  await finalizeCert(cert.id)
  await logActivity('supplier_cert.sign', { entityType: 'expense', entityId: expenseId, userId: session.user.id, meta: { internal: true } })
  revalidatePath('/programs')
  return getSupplierCert(expenseId)
}
