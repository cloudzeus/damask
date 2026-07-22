import 'dotenv/config'
import { PERMISSIONS, ROLE_DEFAULTS } from '../src/lib/permissions'
import { prisma } from '../src/lib/prisma'

/** Non-destructive: upserts all code-registry permissions into the DB, and ADDS any
 *  missing default grants per role (never deletes existing grants). Run after adding
 *  a new object/permission so its menu item becomes reachable without a full reseed. */
async function main() {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({ where: { key: p.key }, update: { description: p.description }, create: p })
  }
  let added = 0
  for (const [name, keys] of Object.entries(ROLE_DEFAULTS)) {
    const role = await prisma.role.findUnique({ where: { name } })
    if (!role) continue
    const perms = await prisma.permission.findMany({ where: { key: { in: keys } } })
    const existing = new Set((await prisma.rolePermission.findMany({ where: { roleId: role.id }, select: { permissionId: true } })).map(rp => rp.permissionId))
    const toAdd = perms.filter(p => !existing.has(p.id)).map(p => ({ roleId: role.id, permissionId: p.id }))
    if (toAdd.length) { await prisma.rolePermission.createMany({ data: toAdd }); added += toAdd.length }
    console.log(`role ${name}: +${toAdd.length} grants`)
  }
  console.log(`Sync ολοκληρώθηκε: ${PERMISSIONS.length} permissions upserted, ${added} grants added (non-destructive).`)
}
main().catch(e => { console.error('sync-permissions απέτυχε:', e); process.exitCode = 1 }).finally(() => prisma.$disconnect())
