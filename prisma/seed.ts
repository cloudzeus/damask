import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PERMISSIONS, ROLE_DEFAULTS } from '../src/lib/permissions'
import { prisma } from '../src/lib/prisma'

async function main() {
  // 1. Permissions — upsert ώστε το seed να είναι επανεκτελέσιμο
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    })
  }

  // 2. Ρόλοι + αναθέσεις
  for (const [name, permKeys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, system: true },
    })
    const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } })
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.rolePermission.createMany({
      data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
    })
  }

  // 3. Admin user
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'ADMIN' } })
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026'
  await prisma.user.upsert({
    where: { email: 'gkozyris@i4ria.com' },
    update: {},
    create: {
      email: 'gkozyris@i4ria.com',
      name: 'Giannis Kozyris',
      passwordHash: await bcrypt.hash(password, 12),
      roleId: adminRole.id,
    },
  })
  console.log('Seed ολοκληρώθηκε. Admin: gkozyris@i4ria.com')
}

main().finally(() => prisma.$disconnect())
