/**
 * Καθαρό (χωρίς DB/Next runtime) module — τύποι, σταθερές και βοηθητικές
 * συναρτήσεις του συστήματος συγκατάθεσης cookies. Εισάγεται ΚΑΙ από client
 * components (banner στο (public) layout) ΚΑΙ από unit tests — καμία
 * εξάρτηση σε prisma/next-headers εδώ. Το DB-backed φόρτωμα (loadConsentConfig)
 * ζει στο src/lib/settings.ts (μοναδικό σημείο πρόσβασης DB για ρυθμίσεις,
 * βλ. σχόλιο εκεί) και εισάγει τα DEFAULT_CONSENT_CONFIG/τύπους από εδώ.
 */

/** Cookie με τις επιλογές συγκατάθεσης (JSON) — httpOnly, το layout το διαβάζει server-side. */
export const CONSENT_COOKIE_NAME = 'damask-consent'
/** Ανώνυμο cookie uuid επισκέπτη — httpOnly, ΜΟΝΟ server-side χρήση (συνέχεια ConsentLog.visitorId). */
export const VISITOR_COOKIE_NAME = 'damask-visitor'

/** 12 μήνες, σε δευτερόλεπτα — maxAge και των δύο cookies. */
export const CONSENT_COOKIE_MAX_AGE = 60 * 60 * 24 * 365

export type ConsentModalPosition = 'bar' | 'modal'

export type ConsentModalConfig = {
  titleEl: string
  titleEn: string
  textEl: string
  textEn: string
  /** Αν η κατηγορία «Στατιστικά» προσφέρεται καθόλου στον επισκέπτη (locked off όταν false). */
  analyticsEnabled: boolean
  /** Αν η κατηγορία «Marketing» προσφέρεται καθόλου στον επισκέπτη (locked off όταν false). */
  marketingEnabled: boolean
  acceptAllLabel: string
  necessaryOnlyLabel: string
  customizeLabel: string
  /** π.χ. "2026-07" — αλλαγή της τιμής επαναφέρει το banner σε όλους (cookie version mismatch). */
  policyVersion: string
  position: ConsentModalPosition
  /** slug της LegalPage πολιτικής cookies — link μέσα στο banner. */
  cookiesPageSlug: string
}

export const DEFAULT_CONSENT_CONFIG: ConsentModalConfig = {
  titleEl: 'Χρησιμοποιούμε cookies',
  titleEn: 'We use cookies',
  textEl:
    'Χρησιμοποιούμε cookies για να λειτουργεί σωστά ο ιστότοπος, να κατανοούμε πώς τον χρησιμοποιείτε και να προσαρμόζουμε περιεχόμενο. Μπορείτε να αποδεχτείτε όλα, μόνο τα απαραίτητα, ή να προσαρμόσετε τις επιλογές σας.',
  textEn:
    'We use cookies to make the site work, understand how you use it, and personalize content. You can accept all, only the necessary ones, or customize your choices.',
  analyticsEnabled: true,
  marketingEnabled: true,
  acceptAllLabel: 'Αποδοχή όλων',
  necessaryOnlyLabel: 'Μόνο απαραίτητα',
  customizeLabel: 'Προσαρμογή',
  policyVersion: '2026-07',
  position: 'bar',
  cookiesPageSlug: 'cookies',
}

/** Οι 3 κατηγορίες συγκατάθεσης — «Απαραίτητα» είναι πάντα true, δεν στέλνεται καν επιλογή γι' αυτό. */
export type ConsentChoices = { necessary: true; analytics: boolean; marketing: boolean }

/** Τιμή του cookie damask-consent (JSON.stringify'd) — ό,τι χρειάζεται το SSR gating στο layout. */
export type ConsentCookiePayload = { analytics: boolean; marketing: boolean; policyVersion: string }

/** Ασφαλής parse του cookie — null αν λείπει, είναι κατεστραμμένο JSON, ή δεν έχει policyVersion. */
export function parseConsentCookie(raw: string | undefined | null): ConsentCookiePayload | null {
  if (!raw) return null
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return null
  }
  if (typeof data !== 'object' || data === null) return null
  const obj = data as Record<string, unknown>
  if (typeof obj.policyVersion !== 'string') return null
  return {
    analytics: obj.analytics === true,
    marketing: obj.marketing === true,
    policyVersion: obj.policyVersion,
  }
}

/**
 * true όταν πρέπει να εμφανιστεί το consent banner: λείπει το cookie, είναι
 * κατεστραμμένο, ή η αποθηκευμένη policyVersion διαφέρει από την τρέχουσα
 * (ο διαχειριστής άλλαξε το κείμενο/τις κατηγορίες → ζητάει νέα συγκατάθεση).
 */
export function shouldShowBanner(cookieRaw: string | undefined | null, config: { policyVersion: string }): boolean {
  const parsed = parseConsentCookie(cookieRaw)
  if (!parsed) return true
  return parsed.policyVersion !== config.policyVersion
}

/** Πρώτο (προτιμώμενο) locale από το Accept-Language header — μόνο "el"/"en", default "el". */
export function parseAcceptLanguageLocale(acceptLanguage: string | undefined | null): 'el' | 'en' {
  if (!acceptLanguage) return 'el'
  const primary = acceptLanguage.split(',')[0]?.trim().toLowerCase() ?? ''
  return primary.startsWith('en') ? 'en' : 'el'
}
