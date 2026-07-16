'use server'

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { getIntegration } from '@/lib/settings'
import { aadeLookup, type AadeCompany } from '@/lib/aade'
import { geocodeSearch, geocodeSuggest, geocodeReverse, GeocodeError, type GeocodeResult } from '@/lib/geocode'

/**
 * Server actions πίσω από /partners (Συναλλασσόμενοι κατά SoftOne SODTYPE —
 * 13 Πελάτες / 12 Προμηθευτές, model Trdr — EXACT SoftOne TRDR mapping) +
 * /partners/[id] (καρτέλα, χάρτης, επαφές, αιτήματα πρόσβασης user).
 * ISPROSP=1 σημαίνει «Υποψήφιος» (lead) — δεν υπάρχει πλέον ξεχωριστό enum
 * status. Gating: 'customer.view' για αναγνώσεις χωρίς side-effect (γίνονται
 * ήδη στα ίδια τα Server Components), 'customer.edit' για ΚΑΘΕ mutation —
 * ίδιο idiom με src/lib/ocr/customer-actions.ts.
 */

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

function revalidatePartners(id?: string) {
  revalidatePath('/partners')
  if (id) revalidatePath(`/partners/${id}`)
}

/** '' → null — δεν αποθηκεύουμε κενά strings σε προαιρετικά πεδία. */
function n(value: string | undefined): string | null {
  const trimmed = (value ?? '').trim()
  return trimmed === '' ? null : trimmed
}

/** '' ή undefined → null, αλλιώς parseInt — για τα S1 combo (COUNTRY/TRDCATEGORY/PAYMENT/SHIPMENT) numeric ids. */
function ni(value: string | undefined | null): number | null {
  const trimmed = (value ?? '').trim()
  if (trimmed === '') return null
  const parsed = parseInt(trimmed, 10)
  return Number.isFinite(parsed) ? parsed : null
}

// ── Δημιουργία / Επεξεργασία συναλλασσόμενου ────────────────────────────────

const partnerFormShape = {
  SODTYPE: z.union([z.literal(12), z.literal(13)]),
  ISPROSP: z.union([z.literal(0), z.literal(1)]),
  NAME: z.string().trim().min(1, 'Η επωνυμία είναι υποχρεωτική.').max(200),
  AFM: z.union([z.literal(''), z.string().trim().regex(/^\d{9}$/, 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.')]),
  IRSDATA: z.string().trim().max(10).optional(), // Irsdata.CODE (combo) — string κωδικός ΔΟΥ
  JOBTYPETRD: z.string().trim().max(300).optional(),
  appLegalForm: z.string().trim().max(120).optional(),
  EMAIL: z.union([z.literal(''), z.email('Μη έγκυρο email.')]),
  PHONE01: z.string().trim().max(40).optional(),
  WEBPAGE: z.string().trim().max(300).optional(),
  ADDRESS: z.string().trim().max(200).optional(),
  CITY: z.string().trim().max(120).optional(),
  ZIP: z.string().trim().max(20).optional(),
  COUNTRY: z.string().trim().max(10).optional(),
  TRDCATEGORY: z.string().trim().max(10).optional(),
  PAYMENT: z.string().trim().max(10).optional(),
  SHIPMENT: z.string().trim().max(10).optional(),
  appLat: z.number().min(-90).max(90).nullable().optional(),
  appLng: z.number().min(-180).max(180).nullable().optional(),
  appNotes: z.string().trim().max(2000).optional(),
}

const createPartnerSchema = z.object(partnerFormShape)
const updatePartnerSchema = z.object(partnerFormShape)

export type PartnerFormValues = z.input<typeof createPartnerSchema>

const UNIQUE_AFM_MESSAGE = 'Υπάρχει ήδη καρτέλα συναλλασσόμενου με αυτό το ΑΦΜ.'

export async function createPartner(input: PartnerFormValues): Promise<ActionResult & { partnerId?: string }> {
  await requirePermission('customer.edit')

  const parsed = createPartnerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data
  const afm = n(data.AFM)

  if (afm) {
    const existing = await prisma.trdr.findFirst({ where: { AFM: afm } })
    if (existing) {
      return { ok: false, message: UNIQUE_AFM_MESSAGE, fieldErrors: { AFM: UNIQUE_AFM_MESSAGE } }
    }
  }

  try {
    const created = await prisma.trdr.create({
      data: {
        TRDR: null,
        SODTYPE: data.SODTYPE,
        ISPROSP: data.ISPROSP,
        NAME: data.NAME,
        AFM: afm,
        IRSDATA: n(data.IRSDATA),
        JOBTYPETRD: n(data.JOBTYPETRD),
        appLegalForm: n(data.appLegalForm),
        EMAIL: n(data.EMAIL),
        PHONE01: n(data.PHONE01),
        WEBPAGE: n(data.WEBPAGE),
        ADDRESS: n(data.ADDRESS),
        CITY: n(data.CITY),
        ZIP: n(data.ZIP),
        COUNTRY: ni(data.COUNTRY),
        TRDCATEGORY: ni(data.TRDCATEGORY),
        PAYMENT: ni(data.PAYMENT),
        SHIPMENT: ni(data.SHIPMENT),
        appLat: data.appLat ?? null,
        appLng: data.appLng ?? null,
        appNotes: n(data.appNotes),
      },
    })
    revalidatePartners()
    return { ok: true, message: `Ο συναλλασσόμενος «${created.NAME}» δημιουργήθηκε.`, partnerId: created.id }
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: UNIQUE_AFM_MESSAGE, fieldErrors: { AFM: UNIQUE_AFM_MESSAGE } }
    }
    throw e
  }
}

export async function updatePartner(id: string, input: PartnerFormValues): Promise<ActionResult> {
  await requirePermission('customer.edit')

  const parsed = updatePartnerSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data
  const afm = n(data.AFM)

  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }

  if (afm) {
    const dup = await prisma.trdr.findFirst({ where: { AFM: afm, id: { not: id } } })
    if (dup) return { ok: false, message: UNIQUE_AFM_MESSAGE, fieldErrors: { AFM: UNIQUE_AFM_MESSAGE } }
  }

  try {
    await prisma.trdr.update({
      where: { id },
      data: {
        SODTYPE: data.SODTYPE,
        ISPROSP: data.ISPROSP,
        NAME: data.NAME,
        AFM: afm,
        IRSDATA: n(data.IRSDATA),
        JOBTYPETRD: n(data.JOBTYPETRD),
        appLegalForm: n(data.appLegalForm),
        EMAIL: n(data.EMAIL),
        PHONE01: n(data.PHONE01),
        WEBPAGE: n(data.WEBPAGE),
        ADDRESS: n(data.ADDRESS),
        CITY: n(data.CITY),
        ZIP: n(data.ZIP),
        COUNTRY: ni(data.COUNTRY),
        TRDCATEGORY: ni(data.TRDCATEGORY),
        PAYMENT: ni(data.PAYMENT),
        SHIPMENT: ni(data.SHIPMENT),
        appLat: data.appLat ?? null,
        appLng: data.appLng ?? null,
        appNotes: n(data.appNotes),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: UNIQUE_AFM_MESSAGE, fieldErrors: { AFM: UNIQUE_AFM_MESSAGE } }
    }
    throw e
  }

  revalidatePartners(id)
  return { ok: true, message: `Οι αλλαγές για «${data.NAME}» αποθηκεύτηκαν.` }
}

/** Μόνο τοπικές καρτέλες (TRDR=null, δεν έχουν συγχρονιστεί με SoftOne) διαγράφονται. */
export async function deletePartner(id: string): Promise<ActionResult> {
  await requirePermission('customer.edit')

  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }
  if (existing.TRDR !== null) {
    return { ok: false, message: 'Δεν διαγράφονται καρτέλες συγχρονισμένες με το SoftOne.' }
  }

  await prisma.trdr.delete({ where: { id } })
  revalidatePartners()
  return { ok: true, message: `Ο συναλλασσόμενος «${existing.NAME}» διαγράφηκε.` }
}

/** ISPROSP 1→0 (πελατοποίηση lead). Ιδεμπότητο-guard: μόνο από ISPROSP=1. */
export async function convertLeadToCustomer(id: string): Promise<ActionResult> {
  await requirePermission('customer.edit')

  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }
  if (existing.ISPROSP !== 1) {
    return { ok: false, message: 'Ο συναλλασσόμενος δεν είναι υποψήφιος (Lead).' }
  }

  await prisma.trdr.update({ where: { id }, data: { ISPROSP: 0 } })
  revalidatePartners(id)
  return { ok: true, message: `Ο/Η «${existing.NAME}» έγινε Πελάτης.` }
}

// ── ΑΑΔΕ lookup ──────────────────────────────────────────────────────────

export type LookupPartnerAfmResult =
  | { ok: true; found: true; company: AadeCompany }
  | { ok: true; found: false }
  | { ok: false; message: string }

export async function lookupPartnerAfm(afm: string): Promise<LookupPartnerAfmResult> {
  await requirePermission('customer.edit')
  try {
    const company = await aadeLookup(afm)
    if (!company) return { ok: true, found: false }
    return { ok: true, found: true, company }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Σφάλμα επικοινωνίας με την υπηρεσία ΑΑΔΕ.' }
  }
}

// ── Geocoding ────────────────────────────────────────────────────────────

async function geocodeApiKey(): Promise<string> {
  const maps = await getIntegration<{ geocodeApiKey?: string }>('maps')
  return maps.geocodeApiKey?.trim() ?? ''
}

export type GeocodeAddressResult =
  | { ok: true; result: GeocodeResult }
  | { ok: false; message: string }

/** Γεωκωδικοποίηση διεύθυνσης (κουμπί «Γεωκωδικοποίηση» όταν δεν επιλέχθηκε Google Places πρόταση). */
export async function geocodeAddressAction(address: string): Promise<GeocodeAddressResult> {
  await requirePermission('customer.edit')
  try {
    const apiKey = await geocodeApiKey()
    const results = await geocodeSearch(address, apiKey)
    if (results.length === 0) return { ok: false, message: 'Δεν βρέθηκε τοποθεσία για αυτή τη διεύθυνση.' }
    return { ok: true, result: results[0] }
  } catch (err) {
    if (err instanceof GeocodeError) return { ok: false, message: err.message }
    return { ok: false, message: 'Σφάλμα γεωκωδικοποίησης.' }
  }
}

const GEOCODE_SUGGEST_MIN_CHARS = 3
const GEOCODE_SUGGEST_LIMIT = 6

export type GeocodeSuggestResult =
  | { ok: true; results: GeocodeResult[] }
  | { ok: false; message: string }

/** Fallback autocomplete διεύθυνσης μέσω geocode.maps.co — καλείται από το GooglePlacesInput
 * (partners/google-places-input.tsx) όταν το Google Places (New) δεν είναι διαθέσιμο. Read-only,
 * ίδιο gating με getMapsClientConfig ('customer.view'). */
export async function geocodeSuggestAction(query: string): Promise<GeocodeSuggestResult> {
  await requirePermission('customer.view')
  const clean = query.trim()
  if (clean.length < GEOCODE_SUGGEST_MIN_CHARS) return { ok: true, results: [] }
  try {
    const apiKey = await geocodeApiKey()
    const results = await geocodeSuggest(clean, apiKey, GEOCODE_SUGGEST_LIMIT)
    return { ok: true, results }
  } catch (err) {
    if (err instanceof GeocodeError) return { ok: false, message: err.message }
    return { ok: false, message: 'Σφάλμα αναζήτησης διεύθυνσης.' }
  }
}

/** Reverse-geocode (κλικ στον χάρτη) — επιστρέφει διεύθυνση για confirm πριν αποθηκευτούν οι συντεταγμένες. */
export async function reverseGeocodeAction(lat: number, lng: number): Promise<GeocodeAddressResult> {
  await requirePermission('customer.edit')
  try {
    const apiKey = await geocodeApiKey()
    const result = await geocodeReverse(lat, lng, apiKey)
    if (!result) return { ok: false, message: 'Δεν βρέθηκε διεύθυνση για αυτό το σημείο.' }
    return { ok: true, result }
  } catch (err) {
    if (err instanceof GeocodeError) return { ok: false, message: err.message }
    return { ok: false, message: 'Σφάλμα reverse geocoding.' }
  }
}

/** Ενημέρωση συντεταγμένων (μετά από confirm στο χάρτη ή «Ενημέρωση από διεύθυνση»). */
export async function updatePartnerCoordinates(id: string, lat: number, lng: number): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const parsed = z.object({ lat: z.number().min(-90).max(90), lng: z.number().min(-180).max(180) }).safeParse({ lat, lng })
  if (!parsed.success) return { ok: false, message: 'Μη έγκυρες συντεταγμένες.' }

  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }

  await prisma.trdr.update({ where: { id }, data: { appLat: parsed.data.lat, appLng: parsed.data.lng } })
  revalidatePartners(id)
  return { ok: true, message: 'Οι συντεταγμένες ενημερώθηκαν.' }
}

/** «Ενημέρωση από διεύθυνση» στην καρτέλα — γεωκωδικοποιεί τη διεύθυνση της καρτέλας και αποθηκεύει. */
export async function refreshCoordinatesFromAddress(id: string): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }

  const address = [existing.ADDRESS, existing.CITY, existing.ZIP].filter(Boolean).join(', ')
  if (!address) return { ok: false, message: 'Δεν υπάρχει διεύθυνση στην καρτέλα.' }

  try {
    const apiKey = await geocodeApiKey()
    const results = await geocodeSearch(address, apiKey)
    if (results.length === 0) return { ok: false, message: 'Δεν βρέθηκε τοποθεσία για τη διεύθυνση της καρτέλας.' }
    const { lat, lng } = results[0]
    await prisma.trdr.update({ where: { id }, data: { appLat: lat, appLng: lng } })
    revalidatePartners(id)
    return { ok: true, message: 'Οι συντεταγμένες ενημερώθηκαν από τη διεύθυνση.' }
  } catch (err) {
    if (err instanceof GeocodeError) return { ok: false, message: err.message }
    return { ok: false, message: 'Σφάλμα γεωκωδικοποίησης.' }
  }
}

// ── Λογότυπο ─────────────────────────────────────────────────────────────

/** MediaPicker (gallery/upload) — αποθηκεύει το URL του επιλεγμένου asset ως λογότυπο. */
export async function setPartnerLogo(id: string, url: string): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const clean = url.trim()
  if (!clean) return { ok: false, message: 'Μη έγκυρο αρχείο.' }

  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }

  await prisma.trdr.update({ where: { id }, data: { appLogoUrl: clean } })
  revalidatePartners(id)
  return { ok: true, message: 'Το λογότυπο ενημερώθηκε.' }
}

function domainOf(website: string): string | null {
  try {
    const withProtocol = /^https?:\/\//i.test(website) ? website : `https://${website}`
    return new URL(withProtocol).hostname
  } catch {
    return null
  }
}

/** «Από website» — favicon μέσω Google's s2 favicon service (χωρίς δικό μας hosting/upload). */
export async function setPartnerLogoFromWebsite(id: string): Promise<ActionResult> {
  await requirePermission('customer.edit')

  const existing = await prisma.trdr.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }
  if (!existing.WEBPAGE) return { ok: false, message: 'Συμπλήρωσε πρώτα website στα στοιχεία της καρτέλας.' }

  const domain = domainOf(existing.WEBPAGE)
  if (!domain) return { ok: false, message: 'Το website δεν είναι έγκυρο URL.' }

  const logoUrl = `https://www.google.com/s2/favicons?domain=${encodeURIComponent(domain)}&sz=128`
  await prisma.trdr.update({ where: { id }, data: { appLogoUrl: logoUrl } })
  revalidatePartners(id)
  return { ok: true, message: 'Το λογότυπο ενημερώθηκε από το website.' }
}

// ── Client-side config (Google Places script + MapTiler tiles) ──────────

export type MapsClientConfig = { googleMapsApiKey: string | null; maptilerApiKey: string | null }

/** Επιστρέφει τα keys που χρειάζεται ο browser (Google Places script, MapTiler tiles URL) —
 * ΠΟΤΕ το geocodeApiKey/gemiApiKey, αυτά μένουν server-only. */
export async function getMapsClientConfig(): Promise<MapsClientConfig> {
  await requirePermission('customer.view')
  const maps = await getIntegration<{ googleMapsApiKey?: string; maptilerApiKey?: string }>('maps')
  return {
    googleMapsApiKey: maps.googleMapsApiKey?.trim() || null,
    maptilerApiKey: maps.maptilerApiKey?.trim() || null,
  }
}

// ── Επαφές (mirror CUSPRSN/SUPPRSN) ─────────────────────────────────────

const contactFormShape = {
  name: z.string().trim().min(1, 'Το όνομα είναι υποχρεωτικό.').max(150),
  position: z.string().trim().max(150).optional(),
  email: z.union([z.literal(''), z.email('Μη έγκυρο email.')]),
  phone: z.string().trim().max(40).optional(),
  mobile: z.string().trim().max(40).optional(),
  isPrimary: z.boolean(),
}
const contactFormSchema = z.object(contactFormShape)
export type ContactFormValues = z.input<typeof contactFormSchema>

export async function createContact(trdrId: string, input: ContactFormValues): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const parsed = contactFormSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  const data = parsed.data

  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId } })
  if (!trdr) return { ok: false, message: 'Ο συναλλασσόμενος δεν βρέθηκε.' }

  await prisma.$transaction(async tx => {
    if (data.isPrimary) {
      await tx.contact.updateMany({ where: { trdrId, isPrimary: true }, data: { isPrimary: false } })
    }
    await tx.contact.create({
      data: {
        trdrId,
        name: data.name,
        position: n(data.position),
        email: n(data.email),
        phone: n(data.phone),
        mobile: n(data.mobile),
        isPrimary: data.isPrimary,
      },
    })
  })

  revalidatePartners(trdrId)
  return { ok: true, message: `Η επαφή «${data.name}» προστέθηκε.` }
}

export async function updateContact(contactId: string, input: ContactFormValues): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const parsed = contactFormSchema.safeParse(input)
  if (!parsed.success) return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  const data = parsed.data

  const existing = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!existing) return { ok: false, message: 'Η επαφή δεν βρέθηκε.' }

  await prisma.$transaction(async tx => {
    if (data.isPrimary) {
      await tx.contact.updateMany({
        where: { trdrId: existing.trdrId, isPrimary: true, id: { not: contactId } },
        data: { isPrimary: false },
      })
    }
    await tx.contact.update({
      where: { id: contactId },
      data: {
        name: data.name,
        position: n(data.position),
        email: n(data.email),
        phone: n(data.phone),
        mobile: n(data.mobile),
        isPrimary: data.isPrimary,
      },
    })
  })

  revalidatePartners(existing.trdrId)
  return { ok: true, message: `Οι αλλαγές για «${data.name}» αποθηκεύτηκαν.` }
}

export async function deleteContact(contactId: string): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const existing = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!existing) return { ok: false, message: 'Η επαφή δεν βρέθηκε.' }

  await prisma.contact.delete({ where: { id: contactId } })
  revalidatePartners(existing.trdrId)
  return { ok: true, message: `Η επαφή «${existing.name}» διαγράφηκε.` }
}

export async function setPrimaryContact(contactId: string): Promise<ActionResult> {
  await requirePermission('customer.edit')
  const existing = await prisma.contact.findUnique({ where: { id: contactId } })
  if (!existing) return { ok: false, message: 'Η επαφή δεν βρέθηκε.' }

  await prisma.$transaction([
    prisma.contact.updateMany({ where: { trdrId: existing.trdrId, isPrimary: true }, data: { isPrimary: false } }),
    prisma.contact.update({ where: { id: contactId }, data: { isPrimary: true } }),
  ])

  revalidatePartners(existing.trdrId)
  return { ok: true, message: `Η «${existing.name}» ορίστηκε κύρια επαφή.` }
}

// ── Αίτημα πρόσβασης user από επαφή ────────────────────────────────────────

const UNIQUE_REQUEST_EMAIL_MESSAGE = 'Υπάρχει ήδη αίτημα ή λογαριασμός με αυτό το email.'

/**
 * Δημιουργεί AccessRequest από επαφή (⋮ «Αίτημα πρόσβασης user» στο /partners/[id]) —
 * type παράγεται από το SODTYPE του συναλλασσόμενου (13→CUSTOMER, 12→SUPPLIER),
 * contactId συνδέει το αίτημα με την επαφή ώστε το approveAccessRequest
 * (src/app/(app)/users/actions.ts) να γράψει πίσω Contact.userId + User.trdrId.
 * Εμφανίζεται στο ίδιο panel εγκρίσεων με τα /register αιτήματα (AccessRequestsPanel, /users).
 */
export async function requestContactAccess(contactId: string): Promise<ActionResult> {
  await requirePermission('customer.edit')

  const contact = await prisma.contact.findUnique({ where: { id: contactId }, include: { trdr: true } })
  if (!contact) return { ok: false, message: 'Η επαφή δεν βρέθηκε.' }
  if (contact.userId) return { ok: false, message: 'Η επαφή έχει ήδη λογαριασμό χρήστη.' }
  if (!contact.email) return { ok: false, message: 'Η επαφή δεν έχει email — συμπλήρωσέ το πρώτα.' }

  const existingRequest = await prisma.accessRequest.findFirst({ where: { contactId, status: 'PENDING' } })
  if (existingRequest) return { ok: false, message: 'Υπάρχει ήδη αίτημα σε αναμονή για αυτή την επαφή.' }

  const type = contact.trdr.SODTYPE === 12 ? 'SUPPLIER' : 'CUSTOMER'

  try {
    await prisma.accessRequest.create({
      data: {
        type,
        name: contact.name,
        company: contact.trdr.NAME,
        afm: contact.trdr.AFM ?? '',
        phone: contact.phone ?? contact.mobile ?? '',
        email: contact.email.toLowerCase(),
        contactId: contact.id,
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: UNIQUE_REQUEST_EMAIL_MESSAGE }
    }
    throw e
  }

  revalidatePartners(contact.trdrId)
  revalidatePath('/users')
  return { ok: true, message: `Το αίτημα πρόσβασης για «${contact.name}» δημιουργήθηκε.` }
}
