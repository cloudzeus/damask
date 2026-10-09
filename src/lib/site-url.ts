/**
 * Βασικό URL του δημόσιου website (canonical, sitemap, structured data). Παραγωγή: https://wwa-espa.com.
 * SITE_PUBLIC=1 μόνο στην παραγωγή — αλλιώς (staging π.χ. espa.nuboy.gr) τίποτα δεν ευρετηριάζεται.
 */
export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL || 'https://wwa-espa.com').replace(/\/+$/, '')
export const SITE_INDEXABLE = process.env.SITE_PUBLIC === '1'
export const SITE_NAME = 'World Wide Associates'
export const absoluteUrl = (path: string) => `${SITE_URL}${path.startsWith('/') ? path : `/${path}`}`
