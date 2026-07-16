'use server'

import { z } from 'zod'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { aadeLookup, type AadeCompany } from '@/lib/aade'

/**
 * Server actions πίσω από την κάρτα «Εξακρίβωση & Καρτέλα» του OCR review panel
 * (src/components/ocr/customer-card-panel.tsx): επαλήθευση της εταιρείας στο
 * παραστατικό μέσω ΑΑΔΕ (vat.wwa.gr, src/lib/aade.ts) και δημιουργία καρτέλας
 * πελάτη (Customer, trdr=null — δεν έχει συγχρονιστεί ακόμα με SoftOne).
 *
 * Gating: 'customer.edit' και για τα δύο — η επαλήθευση ΑΦΜ δεν έχει νόημα να
 * είναι πιο ανοιχτή από τη δημιουργία της καρτέλας που προκύπτει από αυτήν.
 */

export type VerifyIssuerAfmResult =
  | { ok: true; found: true; company: AadeCompany }
  | { ok: true; found: false }
  | { ok: false; message: string }

export async function verifyIssuerAfm(afm: string): Promise<VerifyIssuerAfmResult> {
  await requirePermission('customer.edit')
  const clean = String(afm ?? '').trim()
  if (!/^\d{9}$/.test(clean)) {
    return { ok: false, message: 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.' }
  }
  try {
    const company = await aadeLookup(clean)
    if (!company) return { ok: true, found: false }
    return { ok: true, found: true, company }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας με την υπηρεσία ΑΑΔΕ.' }
  }
}

const createCustomerFromOcrSchema = z.object({
  name: z.string().trim().min(1, 'Η επωνυμία είναι υποχρεωτική.').max(200),
  afm: z.union([z.literal(''), z.string().trim().regex(/^\d{9}$/, 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.')]),
  // sodtype: 13 πελάτης / 12 προμηθευτής (SoftOne TRDR convention, βλ. prisma
  // schema comment) — προεπιλογή 12 (Προμηθευτής) στο UI callsite (customer-card-panel.tsx)
  // γιατί ο εκδότης παραστατικού ΑΓΟΡΑΣ είναι σχεδόν πάντα προμηθευτής.
  sodtype: z.union([z.literal(12), z.literal(13)]).default(12),
  doy: z.string().trim().max(120).optional(),
  website: z.string().trim().max(300).optional(),
  address: z.string().trim().max(200).optional(),
  city: z.string().trim().max(120).optional(),
  zip: z.string().trim().max(20).optional(),
  phones: z.array(z.string().trim().min(1).max(40)).max(10),
  emails: z.array(z.string().trim().min(1).max(200)).max(10),
})

export type CreateCustomerFromOcrInput = z.input<typeof createCustomerFromOcrSchema>

export type CreateCustomerFromOcrResult =
  | { ok: true; customerId: string }
  | { ok: false; duplicate: true; customerId: string; customerName: string; message: string }
  | { ok: false; duplicate: false; message: string; fieldErrors?: Record<string, string> }

/**
 * Δημιουργεί καρτέλα πελάτη (Customer, trdr=null) από τα (πιθανώς επεξεργασμένα
 * από τον χρήστη) στοιχεία του review panel. Το πρώτο τηλέφωνο/email πάνε στα
 * Customer.phone/email· τα υπόλοιπα γίνονται από ένα Contact row το καθένα
 * (name: «Από παραστατικό»). Duplicate-check by ΑΦΜ πριν τη δημιουργία.
 */
export async function createCustomerFromOcr(input: CreateCustomerFromOcrInput): Promise<CreateCustomerFromOcrResult> {
  await requirePermission('customer.edit')

  const parsed = createCustomerFromOcrSchema.safeParse(input)
  if (!parsed.success) {
    const fieldErrors: Record<string, string> = {}
    for (const issue of parsed.error.issues) {
      const key = String(issue.path[0] ?? '')
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { ok: false, duplicate: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors }
  }

  const { name, afm, sodtype, doy, website, address, city, zip, phones, emails } = parsed.data
  const afmClean = afm || null

  if (afmClean) {
    const existing = await prisma.customer.findFirst({ where: { afm: afmClean } })
    if (existing) {
      return {
        ok: false,
        duplicate: true,
        customerId: existing.id,
        customerName: existing.name,
        message: `Υπάρχει ήδη καρτέλα με αυτό το ΑΦΜ: «${existing.name}».`,
      }
    }
  }

  const extraContacts: { name: string; phone?: string; email?: string }[] = [
    ...phones.slice(1).map(phone => ({ name: 'Από παραστατικό', phone })),
    ...emails.slice(1).map(email => ({ name: 'Από παραστατικό', email })),
  ]

  const customer = await prisma.customer.create({
    data: {
      trdr: null,
      sodtype,
      status: 'CUSTOMER', // OCR καρτέλες προκύπτουν από πραγματικό παραστατικό, όχι lead pipeline
      name,
      afm: afmClean,
      doy: doy || null,
      website: website || null,
      email: emails[0] ?? null,
      phone: phones[0] ?? null,
      address: address || null,
      city: city || null,
      zip: zip || null,
      contacts: extraContacts.length ? { create: extraContacts } : undefined,
    },
  })

  return { ok: true, customerId: customer.id }
}
