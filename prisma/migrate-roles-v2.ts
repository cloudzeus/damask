/**
 * RBAC v2 — one-off data migration: 6-role model → 8-role model.
 *
 * Old set: ADMIN, PURCHASING, PRODUCT_MANAGER, SALES, ARCHITECT, CUSTOMER
 * New set: SUPER_ADMIN, ADMIN, MANAGER, EMPLOYEE, CUSTOMER, SUPPLIER, ARCHITECT, SALESMAN
 *
 * Run: npx tsx prisma/migrate-roles-v2.ts
 *
 * Idempotent: safe to re-run. On a second run, PURCHASING/PRODUCT_MANAGER/SALES
 * are already gone (skipped), and ADMIN → SUPER_ADMIN is only replayed if the
 * CURRENT 'ADMIN' role still looks pre-migration (still holds settings.manage,
 * which the new ADMIN definition never has) — so legitimately-assigned
 * new-style ADMIN users are never re-promoted to SUPER_ADMIN on a later run.
 */
import 'dotenv/config'
import { PERMISSIONS, ROLE_DEFAULTS, ROLE_ORDER } from '../src/lib/permissions'
import { prisma } from '../src/lib/prisma'

/** old role name → new role name, for users on roles retiring from the set */
const RETIRING_REMAP: Array<[string, string]> = [
  ['SALES', 'SALESMAN'],
  ['PRODUCT_MANAGER', 'MANAGER'],
  ['PURCHASING', 'MANAGER'],
]

/** old roles deleted once their users are remapped — ONLY if 0 users remain */
const ROLES_TO_RETIRE = ['PURCHASING', 'PRODUCT_MANAGER', 'SALES']

async function main() {
  console.log('── RBAC v2 migration: 6-role → 8-role model ──')

  // 0. Snapshot BEFORE touching anything: does the row currently named
  //    'ADMIN' still carry settings.manage (⇒ it's the OLD all-permissions
  //    ADMIN, pre-migration)? This is what makes step 3 idempotent.
  const adminSnapshot = await prisma.role.findUnique({
    where: { name: 'ADMIN' },
    include: { permissions: { include: { permission: true } } },
  })
  const adminWasPreMigration =
    adminSnapshot?.permissions.some(rp => rp.permission.key === 'settings.manage') ?? false

  // 1. Permissions catalog — upsert (ίδιο idempotent pattern με το seed).
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { key: p.key },
      update: { description: p.description },
      create: p,
    })
  }

  // 2. Upsert the 8 new roles (system:true) + reset RolePermissions στα νέα
  //    defaults. 'ADMIN', 'ARCHITECT', 'CUSTOMER' ήδη υπάρχουν ως γραμμές
  //    (ίδιο id, ίδιο unique name) — εδώ απλώς ανανεώνεται το permission
  //    set τους. Οι υπόλοιποι 5 είναι ολοκαίνουργιες γραμμές.
  for (const [name, permKeys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.upsert({
      where: { name },
      update: { system: true },
      create: { name, system: true },
    })
    const perms = await prisma.permission.findMany({ where: { key: { in: permKeys } } })
    await prisma.$transaction([
      prisma.rolePermission.deleteMany({ where: { roleId: role.id } }),
      prisma.rolePermission.createMany({
        data: perms.map(p => ({ roleId: role.id, permissionId: p.id })),
      }),
    ])
    console.log(`  upsert ${name}: ${perms.length} δικαιώματα`)
  }

  // 3. Remap χρηστών από ρόλους που αποσύρονται στο νέο ισοδύναμό τους.
  const remap = adminWasPreMigration
    ? ([['ADMIN', 'SUPER_ADMIN'], ...RETIRING_REMAP] as Array<[string, string]>)
    : RETIRING_REMAP
  if (!adminWasPreMigration) {
    console.log('  skip ADMIN → SUPER_ADMIN: ο τρέχων ρόλος ADMIN είναι ήδη νέου τύπου (χωρίς settings.manage) — δεν ξαναπροάγονται χρήστες')
  }

  for (const [oldName, newName] of remap) {
    const oldRole = await prisma.role.findUnique({ where: { name: oldName } })
    if (!oldRole) {
      console.log(`  skip ${oldName} → ${newName}: ο ρόλος ${oldName} δεν υπάρχει πια (ήδη migrated)`)
      continue
    }
    const newRole = await prisma.role.findUnique({ where: { name: newName } })
    if (!newRole) throw new Error(`Ο νέος ρόλος ${newName} δεν βρέθηκε — έπρεπε να έχει δημιουργηθεί στο βήμα 2.`)
    const { count } = await prisma.user.updateMany({
      where: { roleId: oldRole.id },
      data: { roleId: newRole.id },
    })
    console.log(`  remap ${oldName} → ${newName}: ${count} χρήστες`)
  }

  // 4. Belt & suspenders: gkozyris@i4ria.com ΠΡΕΠΕΙ να καταλήξει SUPER_ADMIN,
  //    ανεξάρτητα από edge cases στο βήμα 3 (π.χ. διακοπή mid-migration).
  const superAdmin = await prisma.role.findUniqueOrThrow({ where: { name: 'SUPER_ADMIN' } })
  const gkozyris = await prisma.user.findUnique({ where: { email: 'gkozyris@i4ria.com' } })
  if (!gkozyris) {
    console.log('  ΠΡΟΣΟΧΗ: δεν βρέθηκε χρήστης gkozyris@i4ria.com')
  } else if (gkozyris.roleId !== superAdmin.id) {
    await prisma.user.update({ where: { id: gkozyris.id }, data: { roleId: superAdmin.id } })
    console.log('  gkozyris@i4ria.com → SUPER_ADMIN (forced)')
  } else {
    console.log('  gkozyris@i4ria.com είναι ήδη SUPER_ADMIN ✓')
  }

  // 5. Διαγραφή ρόλων που αποσύρονται — ΜΟΝΟ αν έμειναν 0 χρήστες (guard).
  for (const name of ROLES_TO_RETIRE) {
    const role = await prisma.role.findUnique({
      where: { name },
      include: { _count: { select: { users: true } } },
    })
    if (!role) {
      console.log(`  skip delete ${name}: δεν υπάρχει (ήδη διαγραμμένος)`)
      continue
    }
    if (role._count.users > 0) {
      console.log(`  ΔΕΝ διαγράφηκε ${name}: έχει ακόμα ${role._count.users} χρήστες!`)
      continue
    }
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } })
    await prisma.role.delete({ where: { id: role.id } })
    console.log(`  διαγράφηκε ο ρόλος ${name}`)
  }

  // 6. Report
  const roles = await prisma.role.findMany({ include: { _count: { select: { users: true } } } })
  const rpTotal = await prisma.rolePermission.count()
  const sorted = [...roles].sort((a, b) => {
    const ia = ROLE_ORDER.indexOf(a.name)
    const ib = ROLE_ORDER.indexOf(b.name)
    return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib)
  })
  console.log('── Αποτέλεσμα ──')
  for (const r of sorted) console.log(`  ${r.name.padEnd(12)} ${r._count.users} χρήστες`)
  console.log(`  Σύνολο ρόλων: ${roles.length}`)
  console.log(`  Σύνολο rolePermission: ${rpTotal}`)
}

main()
  .catch(e => { console.error('Migration απέτυχε:', e); process.exitCode = 1 })
  .finally(() => prisma.$disconnect())
