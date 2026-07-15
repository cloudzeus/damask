import { NextResponse, type NextRequest } from 'next/server'

// Δημόσιες διαδρομές — δεν χρειάζονται session. Το "/" εξυπηρετεί το δημόσιο
// website (χωρίς redirect) — βλ. design-system/damask-pim/MASTER.md §4γ.
const PUBLIC_PATHS = new Set(['/', '/login', '/register', '/forgot-password', '/reset-password'])

export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl
  if (PUBLIC_PATHS.has(pathname)) return NextResponse.next()

  const hasSession = req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token')
  if (!hasSession) {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!api/auth|_next/static|_next/image|favicon.ico|logo).*)'],
}
