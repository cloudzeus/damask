import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Στο `next build` (prerender δημόσιων σελίδων) κάθε worker κρατά ελάχιστες συνδέσεις — η βάση είναι κοινή.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
// Ο Postgres server είναι κοινός με άλλα projects (όριο ~100 συνδέσεις): λίγες συνδέσεις ανά διεργασία, κλείσιμο αδρανών.
// DB_POOL_MAX για ρύθμιση· προεπιλογή 8 σε παραγωγή, 4 σε development/scripts.
const poolMax = Number(process.env.DB_POOL_MAX) || (process.env.NODE_ENV === 'production' ? 8 : 4)
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, ...(isBuild ? { max: 2, idleTimeoutMillis: 5_000 } : { max: poolMax, idleTimeoutMillis: 30_000 }) })

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
