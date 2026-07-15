import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'

export type AuthUserPayload = {
  id: string
  email: string
  name: string
  role: string
  permissions: string[]
  customerId: string | null
}

export async function verifyCredentials(
  email: string,
  password: string,
): Promise<AuthUserPayload | null> {
  const user = await prisma.user.findUnique({
    where: { email },
    include: { role: { include: { permissions: { include: { permission: true } } } } },
  })
  if (!user || !user.active) return null
  if (!(await bcrypt.compare(password, user.passwordHash))) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role.name,
    permissions: user.role.permissions.map(rp => rp.permission.key),
    customerId: user.customerId ?? null,
  }
}
