import NextAuth from 'next-auth'
import Credentials from 'next-auth/providers/credentials'
import { verifyCredentials } from '@/auth.config'

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
    jwt({ token, user }) {
      if (user) {
        const u = user as import('@/auth.config').AuthUserPayload
        token.role = u.role
        token.permissions = u.permissions
        token.trdrId = u.trdrId
      }
      return token
    },
    session({ session, token }) {
      session.user.id = token.sub!
      session.user.role = token.role as string
      session.user.permissions = (token.permissions as string[]) ?? []
      session.user.trdrId = (token.trdrId as string | null) ?? null
      return session
    },
  },
})
