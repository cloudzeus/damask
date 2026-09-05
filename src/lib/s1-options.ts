import { prisma } from '@/lib/prisma'

/**
 * Server-only φόρτωση options για τα S1 combo components (src/components/s1/*).
 * ΜΟΝΟ ISACTIVE=1 γραμμές — τα combos στις φόρμες /partners δεν πρέπει να
 * δείχνουν ανενεργές τιμές mirror. `value` = string version του SoftOne
 * numeric id (Select components δουλεύουν με string values) εκτός από το
 * IRSDATA combo που χρησιμοποιεί το CODE (string) — βλ. Trdr.IRSDATA στο schema.
 */

export type S1Option = { value: string; label: string }

export async function getVatOptions(): Promise<S1Option[]> {
  const rows = await prisma.vat.findMany({ where: { ISACTIVE: 1 }, orderBy: { VAT: 'asc' } })
  return rows.map(r => ({ value: String(r.VAT), label: `${r.NAME} (${r.PERCNT}%)` }))
}

export async function getCountryOptions(): Promise<S1Option[]> {
  const rows = await prisma.country.findMany({ where: { ISACTIVE: 1 }, orderBy: { NAME: 'asc' } })
  return rows.map(r => ({ value: String(r.COUNTRY), label: r.NAME }))
}

/** value = CODE (string κωδικός ΔΟΥ) — ΟΧΙ το numeric IRSDATA id, βλ. σχόλιο Trdr.IRSDATA. */
export async function getIrsdataOptions(): Promise<S1Option[]> {
  const rows = await prisma.irsdata.findMany({ where: { ISACTIVE: 1 }, orderBy: { NAME: 'asc' } })
  return rows.filter(r => r.CODE).map(r => ({ value: r.CODE!, label: `${r.NAME}${r.CODE ? ` (${r.CODE})` : ''}` }))
}

export async function getTrdCategoryOptions(): Promise<S1Option[]> {
  const rows = await prisma.trdCategory.findMany({ where: { ISACTIVE: 1 }, orderBy: { NAME: 'asc' } })
  return rows.map(r => ({ value: String(r.TRDCATEGORY), label: r.NAME }))
}

export async function getPaymentOptions(): Promise<S1Option[]> {
  const rows = await prisma.s1Payment.findMany({ where: { ISACTIVE: 1 }, orderBy: { NAME: 'asc' } })
  return rows.map(r => ({ value: String(r.PAYMENT), label: r.NAME }))
}

export async function getShipmentOptions(): Promise<S1Option[]> {
  const rows = await prisma.shipment.findMany({ where: { ISACTIVE: 1 }, orderBy: { NAME: 'asc' } })
  return rows.map(r => ({ value: String(r.SHIPMENT), label: r.NAME }))
}

export async function getCurrencyOptions(): Promise<S1Option[]> {
  const rows = await prisma.soCurrency.findMany({ where: { ISACTIVE: 1 }, orderBy: { NAME: 'asc' } })
  return rows.map(r => ({ value: String(r.SOCURRENCY), label: `${r.NAME} (${r.SHORTCUT})` }))
}

export async function getSeriesOptions(sodtype?: number): Promise<S1Option[]> {
  const rows = await prisma.series.findMany({
    where: { ISACTIVE: 1, ...(sodtype !== undefined ? { SODTYPE: sodtype } : {}) },
    orderBy: { NAME: 'asc' },
  })
  return rows.map(r => ({ value: String(r.SERIES), label: r.NAME }))
}

/** Ενεργοί συστήστες ως options για το partner form (ΟΧΙ S1 — app-only Referrer).
 * Gated από το customer.view της σελίδας /partners, όχι από referrer.view. */
export async function getReferrerOptions(): Promise<S1Option[]> {
  const rows = await prisma.referrer.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, type: true },
  })
  return rows.map(r => ({ value: r.id, label: `${r.name} · ${r.type === 'COMPANY' ? 'Εταιρία' : 'Ιδιώτης'}` }))
}

/** Όλα τα partner-form combos σε ένα call (partners/page.tsx + partners/[id]/page.tsx). */
export async function getPartnerFormOptions() {
  const [country, irsdata, trdCategory, payment, shipment, referrer] = await Promise.all([
    getCountryOptions(),
    getIrsdataOptions(),
    getTrdCategoryOptions(),
    getPaymentOptions(),
    getShipmentOptions(),
    getReferrerOptions(),
  ])
  return { country, irsdata, trdCategory, payment, shipment, referrer }
}
