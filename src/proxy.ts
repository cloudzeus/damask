import { NextResponse, type NextRequest } from 'next/server'

// Δημόσιες διαδρομές — δεν χρειάζονται session. Το "/" εξυπηρετεί το δημόσιο
// website (χωρίς redirect) — βλ. design-system/damask-pim/MASTER.md §4γ.
/**
 * SITE_PUBLIC=1 ΜΟΝΟ στο παραγωγικό deploy (wwa-espa.com): ανοίγει το δημόσιο website σε επισκέπτες/μηχανές αναζήτησης
 * και επιτρέπει την ευρετηρίαση. Χωρίς αυτό (π.χ. espa.nuboy.gr — staging): οι σελίδες του site μένουν πίσω από login
 * και ΟΛΑ παίρνουν noindex (το robots.txt απαγορεύει τα πάντα).
 */
const SITE_PUBLIC = process.env.SITE_PUBLIC === '1'
const SITE_PATHS = ['/programmata', '/ypiresies', '/etaireia', '/pelates', '/nea', '/epikoinonia', '/espa', '/prothesmies-espa', '/prothesmies-espa.ics', '/glossari', '/typos', '/sitemap.xml', '/llms.txt']
const PUBLIC_PATHS = new Set([
  '/', '/login', '/register', '/forgot-password', '/reset-password', '/api/consent', '/eligibility', '/robots.txt',
  ...(SITE_PUBLIC ? SITE_PATHS : []),
])
/** Σελίδες του website που ευρετηριάζονται — όλα τα άλλα παίρνουν X-Robots-Tag: noindex. */
const INDEXABLE_PATHS = new Set(['/', '/eligibility', '/programmata', '/ypiresies', '/etaireia', '/pelates', '/nea', '/epikoinonia', '/espa', '/prothesmies-espa', '/glossari', '/typos'])
const INDEXABLE_PREFIXES = ['/programmata/', '/nea/', '/legal/', '/espa/']
/** Στατικά αρχεία του /public (εικόνες, fonts κ.λπ.) — όχι .html (το εσωτερικό εγχειρίδιο μένει πίσω από login). */
const STATIC_FILE = /\.(?:png|jpe?g|webp|avif|gif|svg|ico|css|js|mjs|map|txt|xml|woff2?|ttf|otf|mp4|webm|pdf|json)$/i
// Δυναμικά δημόσια prefixes — /legal/[slug] (νομικές σελίδες, οποιοδήποτε slug)
// + /api/webhooks/ (εξωτερικές υπηρεσίες όπως το Viva καλούν χωρίς session cookie —
// βλ. src/app/api/webhooks/viva/route.ts, δικό του έλεγχο κάνει με verification key).
// Token-gated δημόσιες σελίδες πελατών (magic links — κάνουν δικό τους έλεγχο token):
// /portal & /go (portal/lead), /unsubscribe (newsletter), /r (αίτημα δικαιολογητικών),
// /api/file-requests (public upload endpoint με token).
const PUBLIC_PREFIXES = [
  '/legal/', '/api/webhooks/', ...(SITE_PUBLIC ? ['/programmata/', '/nea/'] : []),
  '/portal/', '/go/', '/unsubscribe/', '/r/', '/api/file-requests/',
]

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (STATIC_FILE.test(pathname) && !pathname.startsWith('/api/')) return NextResponse.next()
  if (PUBLIC_PATHS.has(pathname) || PUBLIC_PREFIXES.some(prefix => pathname.startsWith(prefix))) {
    const res = NextResponse.next()
    // Ό,τι δεν είναι σελίδα του website (login, portal, magic links, api) δεν ευρετηριάζεται.
    const indexable = SITE_PUBLIC && (INDEXABLE_PATHS.has(pathname) || INDEXABLE_PREFIXES.some(p => pathname.startsWith(p)) || pathname === '/robots.txt' || pathname === '/sitemap.xml' || pathname === '/llms.txt')
    if (!indexable) res.headers.set('X-Robots-Tag', 'noindex, nofollow')
    return res
  }

  const hasSession = req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token')
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  const res = NextResponse.next()
  res.headers.set('X-Robots-Tag', 'noindex, nofollow') // εφαρμογή (CRM) — ποτέ στο Google
  return res
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|logo).*)'],
}
