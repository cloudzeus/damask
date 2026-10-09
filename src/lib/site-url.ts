/**
 * Βασικό URL του δημόσιου website (canonical, sitemap, structured data). Παραγωγή: https://wwa-espa.com.
 * SITE_PUBLIC=1 μόνο στην παραγωγή — αλλιώς (staging π.χ. espa.nuboy.gr) τίποτα δεν ευρετηριάζεται.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://wwa-espa.com').replace(/\/+$/, '')
export const SITE_INDEXABLE = process.env.SITE_PUBLIC === '1'
export const SITE_NAME = 'World Wide Associates'
export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`

/** Κόβει κείμενο meta (τίτλος ≈60 / description ≈158 χαρ.) σε όριο λέξης — να μην κόβεται στη μέση στο Google. */
export function clampMeta(text: string, max: number): string {
  const t = text.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  const cut = t.slice(0, max - 1)
  return `${cut.slice(0, Math.max(cut.lastIndexOf(' '), max * 0.6)).replace(/[\s,;:—–-]+$/, '')}…`
}
