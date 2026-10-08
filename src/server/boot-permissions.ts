import { prisma } from '@/lib/prisma'
import { PERMISSIONS, ROLE_DEFAULTS } from '@/lib/permissions'

/**
 * Στην εκκίνηση του server: καταχωρεί στη βάση ΜΟΝΟ τα δικαιώματα που προστέθηκαν στον κώδικα
 * (π.χ. νέο αντικείμενο μενού) και τα δίνει στους προεπιλεγμένους ρόλους τους.
 * Ποτέ δεν ξαναδίνει δικαίωμα που υπήρχε ήδη — ό,τι αφαίρεσε ένας διαχειριστής μένει αφαιρεμένο
 * (σε αντίθεση με το `npm run db:sync-permissions`, που συμπληρώνει όλα τα defaults).
 */
export async function syncNewPermissions(): Promise<{ created: string[]; grants: number }> {
  const existing = new Set((await prisma.permission.findMany({ select: { key: true } })).map(p => p.key))
  const fresh = PERMISSIONS.filter(p => !existing.has(p.key))
  if (fresh.length === 0) return { created: [], grants: 0 }

  await prisma.permission.createMany({ data: fresh, skipDuplicates: true })
  const created = await prisma.permission.findMany({ where: { key: { in: fresh.map(p => p.key) } }, select: { id: true, key: true } })
  const idOf = new Map(created.map(p => [p.key, p.id]))

  let grants = 0
  for (const [name, keys] of Object.entries(ROLE_DEFAULTS)) {
    const ids = keys.map(k => idOf.get(k)).filter((x): x is string => !!x)
    if (!ids.length) continue
    const role = await prisma.role.findUnique({ where: { name }, select: { id: true } })
    if (!role) continue
    const r = await prisma.rolePermission.createMany({ data: ids.map(permissionId => ({ roleId: role.id, permissionId })), skipDuplicates: true })
    grants += r.count
  }
  return { created: created.map(p => p.key), grants }
}
