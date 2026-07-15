'use server'

import { z } from 'zod'
import { revalidatePath, revalidateTag } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import {
  setSetting, getIntegration, saveIntegration, saveLastCheck,
  type CheckResult, PUBLIC_TRACKING_CACHE_TAG,
} from '@/lib/settings'
import {
  testSoftOne, testMailgun, testBunny, testDeepSeek, testClaude, testGemini, testViva,
  type SoftOneTestConfig, type MailgunTestConfig, type BunnyTestConfig, type DeepSeekTestConfig, type ClaudeTestConfig, type GeminiTestConfig,
} from '@/lib/connection-tests'
import { lookupAfm } from '@/lib/aade'
import {
  getVivaSettings, saveVivaSettings as persistVivaSettings, saveVivaLastCheck,
  type VivaEnvironment, type VivaEnvInput,
} from '@/lib/viva'

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

function revalidateSettings() {
  revalidatePath('/settings')
}

/** Merge στοιχείων φόρμας πάνω στην αποθηκευμένη (DB+env) τιμή — μόνο τα ΜΗ κενά πεδία της
 * φόρμας υπερισχύουν. Έτσι το «Δοκιμή σύνδεσης» δουλεύει και για μη-αποθηκευμένες ακόμα
 * αλλαγές, ενώ ένα άδειο (άθικτο) secret πεδίο συνεχίζει να παίρνει την ήδη αποθηκευμένη τιμή. */
function mergeNonEmpty<T extends Record<string, unknown>>(base: T, overrides: Record<string, string>): T {
  const merged: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(overrides)) {
    if (value.trim() !== '') merged[key] = value
  }
  return merged as T
}

const VALIDATION_MESSAGE = 'Έλεγξε τα στοιχεία που συμπλήρωσες.'

// ══════════════════════════════════════════════════════════════════════════
// 1. SoftOne
// ══════════════════════════════════════════════════════════════════════════

export type SoftoneValues = {
  serial: string; username: string; password: string; appId: string
  company: string; branch: string; module: string; refid: string
}

const softoneSchema = z.object({
  serial: z.string().trim().max(60),
  username: z.string().trim().max(120),
  password: z.string().max(200),
  appId: z.string().trim().max(60),
  company: z.string().trim().max(30),
  branch: z.string().trim().max(30),
  module: z.string().trim().max(30),
  refid: z.string().trim().max(30),
})

export async function saveSoftoneSettings(values: SoftoneValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = softoneSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('softone', parsed.data, ['password'])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις SoftOne αποθηκεύτηκαν.' }
}

/** «Δοκιμή σύνδεσης» — standalone login→authenticate ΜΕ ΤΑ ΔΟΘΕΝΤΑ (πιθανώς μη αποθηκευμένα ακόμα) creds. Δεν αγγίζει το S1Session. */
export async function testSoftoneSettings(values: SoftoneValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getIntegration<SoftOneTestConfig>('softone')
  const result = await testSoftOne(mergeNonEmpty(stored, values))
  const check = await saveLastCheck('softone', result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// 2. Mailgun
// ══════════════════════════════════════════════════════════════════════════

export type MailgunValues = { apiKey: string; domain: string; region: string; fromEmail: string; fromName: string }

const mailgunSchema = z.object({
  apiKey: z.string().max(200),
  domain: z.string().trim().max(200),
  region: z.enum(['EU', 'US']),
  fromEmail: z.union([z.literal(''), z.email('Μη έγκυρο email.')]),
  fromName: z.string().trim().max(120),
})

export async function saveMailgunSettings(values: MailgunValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = mailgunSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('mailgun', parsed.data, ['apiKey'])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις Mailgun αποθηκεύτηκαν.' }
}

export async function testMailgunSettings(values: MailgunValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getIntegration<MailgunTestConfig>('mailgun')
  const result = await testMailgun(mergeNonEmpty(stored, values))
  const check = await saveLastCheck('mailgun', result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// 3. BunnyCDN
// ══════════════════════════════════════════════════════════════════════════

export type BunnyValues = { storageZone: string; storagePassword: string; storageApi: string; s3Endpoint: string; pullZoneUrl: string }

const bunnySchema = z.object({
  storageZone: z.string().trim().max(120),
  storagePassword: z.string().max(200),
  storageApi: z.string().trim().max(300),
  s3Endpoint: z.string().trim().max(300),
  pullZoneUrl: z.string().trim().max(300),
})

export async function saveBunnySettings(values: BunnyValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = bunnySchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('bunny', parsed.data, ['storagePassword'])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις BunnyCDN αποθηκεύτηκαν.' }
}

export async function testBunnySettings(values: BunnyValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getIntegration<BunnyTestConfig>('bunny')
  const result = await testBunny(mergeNonEmpty(stored, values))
  const check = await saveLastCheck('bunny', result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// 4. DeepSeek
// ══════════════════════════════════════════════════════════════════════════

export type DeepseekValues = { apiKey: string; apiUrl: string; model: string }

const deepseekSchema = z.object({
  apiKey: z.string().max(200),
  apiUrl: z.string().trim().max(300),
  model: z.string().trim().max(120),
})

export async function saveDeepseekSettings(values: DeepseekValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = deepseekSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('deepseek', parsed.data, ['apiKey'])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις DeepSeek αποθηκεύτηκαν.' }
}

export async function testDeepseekSettings(values: DeepseekValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getIntegration<DeepSeekTestConfig>('deepseek')
  const result = await testDeepSeek(mergeNonEmpty(stored, values))
  const check = await saveLastCheck('deepseek', result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// 5. Claude API
// ══════════════════════════════════════════════════════════════════════════

export type ClaudeValues = { apiKey: string; model: string }

const claudeSchema = z.object({
  apiKey: z.string().max(200),
  model: z.string().trim().max(120),
})

export async function saveClaudeSettings(values: ClaudeValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = claudeSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('claude', parsed.data, ['apiKey'])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις Claude API αποθηκεύτηκαν.' }
}

export async function testClaudeSettings(values: ClaudeValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getIntegration<ClaudeTestConfig>('claude')
  const result = await testClaude(mergeNonEmpty(stored, values))
  const check = await saveLastCheck('claude', result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// 5α. Google Gemini (integration.gemini) — vision OCR (src/lib/ocr/*) + γενικό
//     REST client (src/lib/gemini.ts). model: select με 3 προεπιλογές + ελεύθερο
//     κείμενο (validated ως απλό trimmed string, όχι enum — ο χρήστης μπορεί να
//     βάλει οποιοδήποτε μελλοντικό μοντέλο). fallbackModels: comma-separated.
// ══════════════════════════════════════════════════════════════════════════

export type GeminiValues = { apiKey: string; model: string; fallbackModels: string }

const geminiSchema = z.object({
  apiKey: z.string().max(200),
  model: z.string().trim().max(120),
  fallbackModels: z.string().trim().max(300),
})

export async function saveGeminiSettings(values: GeminiValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = geminiSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('gemini', parsed.data, ['apiKey'])
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις Google Gemini αποθηκεύτηκαν.' }
}

export async function testGeminiSettings(values: GeminiValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getIntegration<GeminiTestConfig>('gemini')
  const result = await testGemini(mergeNonEmpty(stored, { apiKey: values.apiKey, model: values.model }))
  const check = await saveLastCheck('gemini', result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// 6. Google Tags — χωρίς test, μόνο format validation. Wire στο (public) layout.
// ══════════════════════════════════════════════════════════════════════════

export type GoogleTagsValues = { gtagId: string; gtmId: string; siteVerification: string }

const GTAG_ID_RE = /^G-[A-Za-z0-9]+$/
const GTM_ID_RE = /^GTM-[A-Za-z0-9]+$/

const googleTagsSchema = z.object({
  gtagId: z.union([z.literal(''), z.string().trim().regex(GTAG_ID_RE, 'Η μορφή πρέπει να είναι G-XXXXXXX.')]),
  gtmId: z.union([z.literal(''), z.string().trim().regex(GTM_ID_RE, 'Η μορφή πρέπει να είναι GTM-XXXXXXX.')]),
  siteVerification: z.string().trim().max(200),
})

export async function saveGoogleTagsSettings(values: GoogleTagsValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = googleTagsSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('gtags', parsed.data, [])
  revalidateSettings()
  revalidateTag(PUBLIC_TRACKING_CACHE_TAG, 'max')
  return { ok: true, message: 'Οι ρυθμίσεις Google Tags αποθηκεύτηκαν.' }
}

// ══════════════════════════════════════════════════════════════════════════
// 7. Facebook — χωρίς test, μόνο format validation. Wire στο (public) layout.
// ══════════════════════════════════════════════════════════════════════════

export type FacebookValues = { pixelId: string; appId: string }

const FB_ID_RE = /^\d{5,20}$/

const facebookSchema = z.object({
  pixelId: z.union([z.literal(''), z.string().trim().regex(FB_ID_RE, 'Το Pixel ID πρέπει να είναι αριθμός.')]),
  appId: z.union([z.literal(''), z.string().trim().regex(FB_ID_RE, 'Το App ID πρέπει να είναι αριθμός.')]),
})

export async function saveFacebookSettings(values: FacebookValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = facebookSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await saveIntegration('facebook', parsed.data, [])
  revalidateSettings()
  revalidateTag(PUBLIC_TRACKING_CACHE_TAG, 'max')
  return { ok: true, message: 'Οι ρυθμίσεις Facebook αποθηκεύτηκαν.' }
}

// ══════════════════════════════════════════════════════════════════════════
// 8. Viva Payments (integration.viva) — σχήμα εμφωλευμένο (demo/production),
//    ΔΕΝ περνάει από saveIntegration/getIntegration (βλ. src/lib/viva.ts).
// ══════════════════════════════════════════════════════════════════════════

export type VivaEnvValues = VivaEnvInput

export type VivaSettingsValues = {
  environment: VivaEnvironment
  bankInstructions: string
  demo: VivaEnvValues
  production: VivaEnvValues
}

const vivaEnvSchema = z.object({
  clientId: z.string().trim().max(120),
  clientSecret: z.string().max(200),
  sourceCode: z.string().trim().max(60),
  webhookVerificationKey: z.string().trim().max(200),
  merchantId: z.string().trim().max(120),
  apiKey: z.string().max(200),
})

const vivaSettingsSchema = z.object({
  environment: z.enum(['demo', 'production']),
  bankInstructions: z.string().trim().max(1000),
  demo: vivaEnvSchema,
  production: vivaEnvSchema,
})

/** Ίδιο με fieldErrorsFromZod αλλά με «σπασμένο» (dotted) key — π.χ. "demo.clientId" — γιατί το σχήμα εδώ είναι εμφωλευμένο (demo/production), το path[0] μόνο θα έχανε ΠΟΙΟ πεδίο μέσα στο section απέτυχε. */
function dottedFieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

export async function saveVivaSettings(values: VivaSettingsValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = vivaSettingsSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: dottedFieldErrors(parsed.error) }
  await persistVivaSettings(parsed.data)
  revalidateSettings()
  revalidatePath('/payments')
  return { ok: true, message: 'Οι ρυθμίσεις Viva Payments αποθηκεύτηκαν.' }
}

/** «Δοκιμή σύνδεσης» — OAuth token request στο ΔΟΘΕΝ (πιθανώς μη αποθηκευμένο ακόμα) environment/creds, όχι απαραίτητα το ενεργό. */
export async function testVivaSettings(environment: VivaEnvironment, values: VivaEnvValues): Promise<CheckResult> {
  await requirePermission('settings.manage')
  const stored = await getVivaSettings()
  const merged = mergeNonEmpty(stored[environment], values)
  const result = await testViva(environment, merged)
  const check = await saveVivaLastCheck(environment, result)
  revalidateSettings()
  return check
}

// ══════════════════════════════════════════════════════════════════════════
// Εταιρεία (company.profile) + ΑΑΔΕ credentials (integration.aade)
// ══════════════════════════════════════════════════════════════════════════

export type LogoEntry = { assetId: string; url: string; label: string }

export type CompanyProfileValues = {
  name: string; title: string; afm: string; doy: string; jobTypeDesc: string; gemiNumber: string
  address: string; city: string; zip: string; district: string; country: string
  phone: string; phone2: string; fax: string; email: string; website: string; iban: string
  hours: string; googleMapsLink: string; lat: string; lng: string
  logos: LogoEntry[]
  aadeUsername: string; aadePassword: string; afmCalledFor: string
}

const logoEntrySchema = z.object({ assetId: z.string().min(1), url: z.string().min(1), label: z.string().max(80) })

const companyProfileSchema = z.object({
  name: z.string().trim().max(200),
  title: z.string().trim().max(200),
  afm: z.union([z.literal(''), z.string().trim().regex(/^\d{9}$/, 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.')]),
  doy: z.string().trim().max(120),
  jobTypeDesc: z.string().trim().max(300),
  gemiNumber: z.string().trim().max(60),
  address: z.string().trim().max(200),
  city: z.string().trim().max(120),
  zip: z.string().trim().max(20),
  district: z.string().trim().max(120),
  country: z.string().trim().max(120),
  phone: z.string().trim().max(40),
  phone2: z.string().trim().max(40),
  fax: z.string().trim().max(40),
  email: z.union([z.literal(''), z.email('Μη έγκυρο email.')]),
  website: z.string().trim().max(300),
  iban: z.string().trim().max(60),
  hours: z.string().trim().max(300),
  googleMapsLink: z.string().trim().max(500),
  lat: z.string().trim().max(30),
  lng: z.string().trim().max(30),
  logos: z.array(logoEntrySchema).max(20),
  aadeUsername: z.string().trim().max(120),
  aadePassword: z.string().max(200),
  afmCalledFor: z.string().trim().max(20),
})

export async function saveCompanyProfile(values: CompanyProfileValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = companyProfileSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }

  const { aadeUsername, aadePassword, afmCalledFor, ...profile } = parsed.data
  await setSetting('company.profile', profile)
  await saveIntegration('aade', { username: aadeUsername, password: aadePassword, afmCalledFor }, ['password'])

  revalidateSettings()
  revalidateTag(PUBLIC_TRACKING_CACHE_TAG, 'max') // λογότυπα/όνομα εταιρείας μπορεί να καταναλωθούν δημόσια αργότερα
  return { ok: true, message: 'Το προφίλ εταιρείας αποθηκεύτηκε.' }
}

export type AadeLookupResult =
  | {
      ok: true
      data: {
        name: string; commerTitle: string; address: string; addressNo: string
        zip: string; district: string; doyDescr: string; jobTypeDesc: string
      }
    }
  | { ok: false; message: string; reason: string }

/** Προσυμπλήρωση (ΟΧΙ αποθήκευση) — ο χρήστης πατάει «Αποθήκευση» μετά για να κρατήσει τα στοιχεία. */
export async function lookupCompanyAfm(afm: string): Promise<AadeLookupResult> {
  await requirePermission('settings.manage')
  const result = await lookupAfm(afm)
  if (!result.ok) return { ok: false, message: result.message, reason: result.reason }
  return {
    ok: true,
    data: {
      name: result.data.onomasia ?? '',
      commerTitle: result.data.commerTitle ?? '',
      address: result.data.postalAddress ?? '',
      addressNo: result.data.postalAddressNo ?? '',
      zip: result.data.postalZipCode ?? '',
      district: result.data.postalAreaDescription ?? '',
      doyDescr: result.data.doyDescr ?? '',
      jobTypeDesc: result.data.firmActDescr ?? '',
    },
  }
}

// ══════════════════════════════════════════════════════════════════════════
// SEO & Analytics (seo.defaults)
// ══════════════════════════════════════════════════════════════════════════

export type OgImageValue = { assetId: string; url: string } | null

export type SeoDefaultsValues = {
  metaTitleEl: string; metaTitleEn: string
  metaDescriptionEl: string; metaDescriptionEn: string
  ogImage: OgImageValue
  keywords: string
  robotsDefault: string
  socialFacebook: string; socialInstagram: string; socialLinkedin: string; socialYoutube: string
  defaultLocale: string
}

const seoDefaultsSchema = z.object({
  metaTitleEl: z.string().trim().max(200),
  metaTitleEn: z.string().trim().max(200),
  metaDescriptionEl: z.string().trim().max(500),
  metaDescriptionEn: z.string().trim().max(500),
  ogImage: z.object({ assetId: z.string(), url: z.string() }).nullable(),
  keywords: z.string().trim().max(500),
  robotsDefault: z.enum(['index,follow', 'noindex,nofollow', 'index,nofollow', 'noindex,follow']),
  socialFacebook: z.string().trim().max(300),
  socialInstagram: z.string().trim().max(300),
  socialLinkedin: z.string().trim().max(300),
  socialYoutube: z.string().trim().max(300),
  defaultLocale: z.enum(['el', 'en']),
})

export async function saveSeoDefaults(values: SeoDefaultsValues): Promise<ActionResult> {
  await requirePermission('settings.manage')
  const parsed = seoDefaultsSchema.safeParse(values)
  if (!parsed.success) return { ok: false, message: VALIDATION_MESSAGE, fieldErrors: fieldErrorsFromZod(parsed.error) }
  await setSetting('seo.defaults', parsed.data)
  revalidateSettings()
  return { ok: true, message: 'Οι ρυθμίσεις SEO αποθηκεύτηκαν.' }
}
