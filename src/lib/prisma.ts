import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Στο `next build` (prerender δημόσιων σελίδων) κάθε worker κρατά ελάχιστες συνδέσεις — η βάση είναι κοινή.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
// Ο Postgres server είναι κοινός με άλλα projects (όριο ~100 συνδέσεις): λίγες συνδέσεις ανά διεργασία, κλείσιμο αδρανών.
// DB_POOL_MAX για ρύθμιση· προεπιλογή 8 σε παραγωγή, 4 σε development/scripts.
const poolMax = Number(process.env.DB_POOL_MAX) || (process.env.NODE_ENV === 'production' ? 8 : 4)

/**
 * PgBouncer (transaction pooling, θύρα 6432 στον ίδιο server): η εφαρμογή συνδέεται μέσω αυτού όταν ορίζεται
 * PGBOUNCER_PORT — ίδιος χρήστης/κωδικός/βάση με το DATABASE_URL, άλλαζει μόνο η θύρα. Το pg-boss, τα migrations και
 * τα backups (pg_dump) μένουν ΑΠΕΥΘΕΙΑΣ στο DATABASE_URL (χρειάζονται session). Χωρίς τη μεταβλητή: όπως πριν.
 */
export function pooledDatabaseUrl(url = process.env.DATABASE_URL, port = process.env.PGBOUNCER_PORT): string | undefined {
  if (!url || !port || !/^\d+$/.test(port)) return url
  try { const u = new URL(url); u.port = port; return u.toString() } catch { return url }
}

const adapter = new PrismaPg({ connectionString: pooledDatabaseUrl(), ...(isBuild ? { max: 2, idleTimeoutMillis: 5_000 } : { max: poolMax, idleTimeoutMillis: 30_000 }) })

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
