import { NextResponse, type NextRequest } from 'next/server'

export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has('authjs.session-token') || req.cookies.has('__Secure-authjs.session-token')
  if (!hasSession && req.nextUrl.pathname !== '/login') {
    return NextResponse.redirect(new URL('/login', req.url))
  }
  return NextResponse.next()
}

export const config = {
  matcher: ['/((?!login|api/auth|_next/static|_next/image|favicon.ico|logo).*)'],
}
