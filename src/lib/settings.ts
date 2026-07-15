import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

/**
 * Γενικό key/value settings store (model Setting — prisma/schema.prisma).
 * Keys ακολουθούν σύμβαση namespacing: "integration.<name>", "company.profile",
 * "seo.defaults". Αυτό το module είναι το ΜΟΝΑΔΙΚΟ σημείο πρόσβασης στη DB για
 * ρυθμίσεις — καμία άλλη lib δεν διαβάζει/γράφει το Setting model απευθείας.
 */

export async function getSetting<T = unknown>(key: string): Promise<T | null> {
  const row = await prisma.setting.findUnique({ where: { key } })
  return row ? (row.value as T) : null
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  await prisma.setting.upsert({
    where: { key },
    update: { value: value as Prisma.InputJsonValue },
    create: { key, value: value as Prisma.InputJsonValue },
  })
}

/** Αποτέλεσμα «Δοκιμή σύνδεσης» — αποθηκεύεται ΜΕΣΑ στο value κάθε integration ως _lastCheck. */
export type CheckResult = { ok: boolean; message: string; at: string }

/**
 * next/cache tag για τις ρυθμίσεις που διαβάζει το (public) layout (Google
 * Tags/Facebook pixel injection) — οι save actions του gtags/facebook κάνουν
 * revalidateTag(PUBLIC_TRACKING_CACHE_TAG, 'max') ώστε η αλλαγή να φανεί χωρίς
 * να περιμένει τη λήξη του cache window.
 */
export const PUBLIC_TRACKING_CACHE_TAG = 'public-tracking-settings'

/** Οι 7 κάρτες της καρτέλας «Διασυνδέσεις» + το AADE (ζει στην καρτέλα «Εταιρεία» αλλά είναι integration-shaped). */
export type IntegrationName = 'softone' | 'mailgun' | 'bunny' | 'deepseek' | 'claude' | 'gtags' | 'facebook' | 'aade'

function settingKeyFor(name: IntegrationName): string {
  return `integration.${name}`
}

/**
 * .env μεταβλητές που ήδη υπάρχουν για SoftOne/BunnyCDN/DeepSeek (βλ. .env.example) —
 * λειτουργούν ως fallback ΜΟΝΟ όταν το αντίστοιχο πεδίο δεν έχει τιμή στη DB. Οι
 * υπάρχουσες libs (softone.ts κ.λπ.) συνεχίζουν να διαβάζουν τα ίδια env vars
 * απευθείας — αυτό το fallback αφορά μόνο τα νέα Settings test buttons/libs.
 * Mailgun/Claude/Google Tags/Facebook/AADE είναι integrations χωρίς προϋπάρχοντα
 * .env — DB-only (κενό fallback map).
 */
// ΣΗΜΑΝΤΙΚΟ: υπολογίζεται μέσα σε συνάρτηση (όχι top-level const) ώστε να
// διαβάζει το process.env ΚΑΘΕ φορά που καλείται getIntegration, όχι μία
// φορά κατά το module import — αλλιώς οποιαδήποτε μεταβολή του env μετά την
// εκκίνηση (π.χ. σε tests, ή hot-reload σε dev) θα αγνοούνταν σιωπηλά.
function envFallbackFor(name: IntegrationName): Record<string, string | undefined> {
  switch (name) {
    case 'softone':
      return {
        serial: process.env.S1_SERIAL,
        username: process.env.S1_USERNAME,
        password: process.env.S1_PASSWORD,
        appId: process.env.S1_APP_ID,
        company: process.env.S1_COMPANY,
        branch: process.env.S1_BRANCH,
        module: process.env.S1_MODULE,
        refid: process.env.S1_REFID,
      }
    case 'bunny':
      return {
        storageZone: process.env.BUNNY_STORAGE_ZONE,
        storagePassword: process.env.BUNNY_STORAGE_PASSWORD,
        storageApi: process.env.BUNNY_STORAGE_API,
        s3Endpoint: process.env.BUNNY_S3_ENDPOINT,
        pullZoneUrl: process.env.BUNNY_PULL_ZONE_URL,
      }
    case 'deepseek':
      return {
        apiKey: process.env.DEEPSEEK_API_KEY,
        apiUrl: process.env.DEEPSEEK_API_URL,
      }
    // Mailgun/Claude/Google Tags/Facebook/AADE: integrations χωρίς προϋπάρχον .env — DB-only.
    default:
      return {}
  }
}

/**
 * Merge DB → env fallback: η τιμή της DB υπερισχύει αν έχει οριστεί (μη κενή)·
 * αλλιώς πέφτει στο αντίστοιχο .env var (S1_*, BUNNY_*, DEEPSEEK_* μόνο). Καθαρό
 * read-time merge — ποτέ δεν γράφει πίσω στη DB.
 */
export async function getIntegration<T extends Record<string, unknown> = Record<string, unknown>>(
  name: IntegrationName,
): Promise<T> {
  const saved = (await getSetting<Record<string, unknown>>(settingKeyFor(name))) ?? {}
  const fallback = envFallbackFor(name)
  const merged: Record<string, unknown> = { ...saved }
  for (const [field, envValue] of Object.entries(fallback)) {
    const current = merged[field]
    if ((current === undefined || current === null || current === '') && envValue) {
      merged[field] = envValue
    }
  }
  return merged as T
}

/** Ακατέργαστη (χωρίς env merge) τιμή integration — για read-before-write σε save/test actions. */
export async function getIntegrationRaw(name: IntegrationName): Promise<Record<string, unknown>> {
  return (await getSetting<Record<string, unknown>>(settingKeyFor(name))) ?? {}
}

/**
 * Αποθηκεύει το αποτέλεσμα ενός «Δοκιμή σύνδεσης» ΜΕΣΑ στο ήδη αποθηκευμένο value
 * (key _lastCheck) — δεν αγγίζει τα υπόλοιπα πεδία, δεν γράφει ανεξέλεγκτες
 * (μη αποθηκευμένες ακόμα) μεταβολές της φόρμας.
 */
export async function saveLastCheck(name: IntegrationName, result: Omit<CheckResult, 'at'>): Promise<CheckResult> {
  const key = settingKeyFor(name)
  const existing = (await getSetting<Record<string, unknown>>(key)) ?? {}
  const check: CheckResult = { ...result, at: new Date().toISOString() }
  await setSetting(key, { ...existing, _lastCheck: check })
  return check
}

/**
 * Αποθηκεύει πεδία integration σεβόμενο «κενό = δεν αλλάζει» για secret πεδία
 * (ίδια σύμβαση με το password στο users/actions.ts updateUser): για κάθε key
 * στο `secretKeys`, αν η νέα τιμή είναι κενό string, κρατάει την ήδη αποθηκευμένη
 * τιμή αντί να τη σβήσει. Τα υπόλοιπα πεδία αποθηκεύονται πάντα ως έχουν
 * (κενό = σκόπιμη διαγραφή προαιρετικού πεδίου).
 */
export async function saveIntegration(
  name: IntegrationName,
  values: Record<string, string>,
  secretKeys: string[] = [],
): Promise<void> {
  const key = settingKeyFor(name)
  const existing = (await getSetting<Record<string, unknown>>(key)) ?? {}
  const next: Record<string, unknown> = { ...existing }
  for (const [field, value] of Object.entries(values)) {
    if (secretKeys.includes(field) && value.trim() === '') continue
    next[field] = value
  }
  await setSetting(key, next)
}

/** Μασκάρισμα secret για εμφάνιση: μόνο τα τελευταία 4 ψηφία ορατά (π.χ. «••••••1234»). null αν δεν υπάρχει τιμή. */
export function maskSecret(value: unknown): string | null {
  const str = typeof value === 'string' ? value.trim() : ''
  if (!str) return null
  if (str.length <= 4) return '•'.repeat(str.length)
  return `${'•'.repeat(Math.min(10, str.length - 4))}${str.slice(-4)}`
}

/** Ελάχιστα πεδία που πρέπει να έχουν τιμή ώστε μια κάρτα να θεωρείται «Ρυθμισμένο». */
const REQUIRED_FIELDS: Record<IntegrationName, string[]> = {
  softone: ['serial', 'username', 'password', 'appId'],
  mailgun: ['apiKey', 'domain'],
  bunny: ['storageZone', 'storagePassword', 'storageApi', 'pullZoneUrl'],
  deepseek: ['apiKey'],
  claude: ['apiKey'],
  gtags: [], // ειδική περίπτωση — βλ. παρακάτω (gtagId Ή gtmId αρκεί)
  facebook: ['pixelId'],
  aade: ['username', 'password'],
}

function nonEmpty(value: unknown): boolean {
  return String(value ?? '').trim() !== ''
}

/** true αν τα ελάχιστα πεδία της integration έχουν τιμή (merged DB+env). */
export function isIntegrationConfigured(name: IntegrationName, merged: Record<string, unknown>): boolean {
  if (name === 'gtags') return nonEmpty(merged.gtagId) || nonEmpty(merged.gtmId)
  return REQUIRED_FIELDS[name].every(field => nonEmpty(merged[field]))
}

export type PublicTrackingSettings = {
  gtagId: string
  gtmId: string
  siteVerification: string
  facebookPixelId: string
  facebookAppId: string
}

/**
 * Ρυθμίσεις tracking που καταναλώνει το (public) layout (Google Tags scripts +
 * Facebook pixel + site verification meta tag). ΣΚΟΠΙΜΑ plain — χωρίς next/cache
 * εδώ, ώστε το src/lib/settings.ts να μένει καθαρό Node/DB module (εύκολα
 * unit-testable, χωρίς εξάρτηση σε Next.js request context). Το caching με
 * revalidate γίνεται στον caller (src/app/(public)/tracking-settings.ts) που
 * είναι Next-runtime-only και δεν εισάγεται ποτέ από unit tests.
 */
export async function loadPublicTrackingSettings(): Promise<PublicTrackingSettings> {
  const [gtags, facebook] = await Promise.all([
    getIntegration<{ gtagId?: string; gtmId?: string; siteVerification?: string }>('gtags'),
    getIntegration<{ pixelId?: string; appId?: string }>('facebook'),
  ])
  return {
    gtagId: gtags.gtagId?.trim() ?? '',
    gtmId: gtags.gtmId?.trim() ?? '',
    siteVerification: gtags.siteVerification?.trim() ?? '',
    facebookPixelId: facebook.pixelId?.trim() ?? '',
    facebookAppId: facebook.appId?.trim() ?? '',
  }
}
