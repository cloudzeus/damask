import { DefaultSession } from 'next-auth'

declare module 'next-auth' {
  interface Session {
    user: DefaultSession['user'] & {
      id: string
      role: string
      permissions: string[]
      trdrId: string | null
      portalHome: boolean
    }
  }
}
