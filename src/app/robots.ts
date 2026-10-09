import type { MetadataRoute } from 'next'
import { SITE_INDEXABLE, absoluteUrl } from '@/lib/site-url'

/** robots.txt — στην παραγωγή επιτρέπει το website και κρύβει την εφαρμογή· σε staging απαγορεύει τα πάντα. */
export default function robots(): MetadataRoute.Robots {
  if (!SITE_INDEXABLE) return { rules: { userAgent: '*', disallow: '/' } }
  return {
    rules: {
      userAgent: '*',
      allow: '/',
      disallow: ['/api/', '/login', '/register', '/forgot-password', '/reset-password', '/portal', '/go/', '/r/', '/unsubscribe/',
        '/dashboard', '/partners', '/programs', '/pm', '/settings', '/files', '/media', '/cms', '/leads', '/users', '/roles', '/costs'],
    },
    sitemap: absoluteUrl('/sitemap.xml'),
    host: absoluteUrl('/'),
  }
}
