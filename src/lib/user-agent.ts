/**
 * Ελαφρύ, ντετερμινιστικό parsing του User-Agent header — ΧΩΡΙΣ βαριά
 * εξάρτηση (ua-parser-js κ.λπ.). Καλύπτει τα OS/browsers που χρειάζεται το
 * ConsentLog: Windows/macOS/iOS/Android/Linux + Chrome/Safari/Firefox/Edge.
 * Η σειρά των ελέγχων έχει σημασία — τα UA strings είναι «φωλιασμένα»
 * (π.χ. Edge περιέχει "Chrome" + "Safari", Chrome περιέχει "Safari",
 * Android περιέχει "Linux", iOS περιέχει "like Mac OS X").
 */

export type ParsedUserAgent = { os: string; browser: string | null }

const UNKNOWN_OS = 'Άγνωστο'

function detectOs(ua: string): string {
  if (/iPhone|iPad|iPod/i.test(ua)) return 'iOS'
  if (/Android/i.test(ua)) return 'Android'
  if (/Windows/i.test(ua)) return 'Windows'
  if (/Mac OS X|Macintosh/i.test(ua)) return 'macOS'
  if (/Linux/i.test(ua)) return 'Linux'
  return UNKNOWN_OS
}

function detectBrowser(ua: string): string | null {
  if (/Edg\//i.test(ua)) return 'Edge'
  if (/OPR\/|Opera/i.test(ua)) return 'Opera'
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return 'Chrome'
  if (/Firefox\//i.test(ua)) return 'Firefox'
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return 'Safari'
  return null
}

export function parseUserAgent(userAgent: string | null | undefined): ParsedUserAgent {
  const ua = userAgent?.trim()
  if (!ua) return { os: UNKNOWN_OS, browser: null }
  return { os: detectOs(ua), browser: detectBrowser(ua) }
}
