import 'dotenv/config'
import bcrypt from 'bcryptjs'
import { PERMISSIONS, ROLE_DEFAULTS } from '../src/lib/permissions'
import { prisma } from '../src/lib/prisma'
import { seedReferenceDefaults } from '../src/lib/s1-sync'

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
  const B2B_ROLE_NAMES = new Set(['ARCHITECT', 'CUSTOMER', 'SUPPLIER'])
  // Προστατευμένοι ρόλοι (system=true, δεν διαγράφονται). Οι υπόλοιποι
  // (SUPPLIER, ARCHITECT, SALESMAN) είναι διαγράψιμοι από τον SUPER_ADMIN.
  const SYSTEM_ROLE_NAMES = new Set(['SUPER_ADMIN', 'ADMIN', 'MANAGER', 'EMPLOYEE', 'CUSTOMER'])
  for (const [name, permKeys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: {},
      create: { name, system: SYSTEM_ROLE_NAMES.has(name), b2b: B2B_ROLE_NAMES.has(name) },
    })
    const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } })
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
      }),
    ])
  }

  // 3. Admin user — SUPER_ADMIN (RBAC v2). update:{} σκόπιμα κενό: reseed δεν
  // πρέπει ποτέ να υποβαθμίσει τον ρόλο ενός ήδη υπάρχοντος χρήστη.
  const superAdminRole = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } })
  const password = process.env.SEED_ADMIN_PASSWORD ?? 'damask!2026'
  await prisma.user.upsert({
    where: { email: 'gkozyris@i4ria.com' },
    update: {},
    create: {
      email: 'gkozyris@i4ria.com',
      name: 'Giannis Kozyris',
      passwordHash: await bcrypt.hash(password, 12),
      roleId: superAdminRole.id,
    },
  })
  console.log('Seed ολοκληρώθηκε. Admin: gkozyris@i4ria.com (SUPER_ADMIN)')

  // 4. S1 reference mirrors — προσωρινό seed (VAT/COUNTRY) μόνο αν άδειο πίνακας.
  // Θα αντικατασταθούν με upsert στο πρώτο πραγματικό SoftOne sync.
  await seedReferenceDefaults()
  console.log('S1 reference mirrors: seed ελέγχθηκε (VAT/COUNTRY μόνο αν άδεια).')
}

main()
  .catch(e => { console.error('Seed απέτυχε:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
