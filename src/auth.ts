import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifyCredentials } from '@/auth.config'
import { prisma } from '@/lib/prisma'

// Πόσο συχνά ξαναδιαβάζουμε role/permissions από τη DB μέσα στο jwt callback.
// Χωρίς αυτό, νέα permissions/ρόλοι seed-αρισμένοι στη DB δεν φαίνονται στους
// ήδη συνδεδεμένους χρήστες μέχρι να ξανακάνουν login (βλ. CMS sidebar bug).
const PERMS_REFRESH_MS = 60_000

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: 'jwt' },
  pages: { signIn: '/login' },
  providers: [
    Credentials({
      credentials: { email: {}, password: {} },
      async authorize(creds) {
        if (typeof creds?.email !== 'string' || typeof creds?.password !== 'string') return null
        return verifyCredentials(creds.email, creds.password)
      },
    }),
  ],
  callbacks: {
    authorized({ auth }) {
      return !!auth?.user
    },
    async jwt({ token, user }) {
      if (user) {
        const u = user as import('@/auth.config').AuthUserPayload
        token.role = u.role
        token.permissions = u.permissions
        token.trdrId = u.trdrId
        token.portalHome = u.portalHome
        token.permsAt = Date.now()
        return token
      }

      const permsAt = token.permsAt as number | undefined
      if (!permsAt || Date.now() - permsAt > PERMS_REFRESH_MS) {
        const dbUser = await prisma.user.findUnique({
          where: { id: token.sub! },
          include: { role: { include: { permissions: { include: { permission: true } } } } },
        })
        if (!dbUser || !dbUser.active) {
          // Χρήστης διαγράφηκε/απενεργοποιήθηκε — άκυρη session, καθάρισε cookie.
          return null
        }
        token.role = dbUser.role.name
        token.permissions = dbUser.role.permissions.map(rp => rp.permission.key)
        token.trdrId = dbUser.trdrId ?? null
        token.portalHome = dbUser.role.b2b
        token.permsAt = Date.now()
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = token.role as string
      session.user.permissions = (token.permissions as string[]) ?? []
      session.user.trdrId = (token.trdrId as string | null) ?? null
      session.user.portalHome = (token.portalHome as boolean) ?? false
      return session
    },
  },
})
