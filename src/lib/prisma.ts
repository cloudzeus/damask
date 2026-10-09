import { PrismaClient } from '@prisma/client'
import { PrismaPg } from '@prisma/adapter-pg'

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient }

// Στο `next build` (prerender δημόσιων σελίδων) κάθε worker κρατά ελάχιστες συνδέσεις — η βάση είναι κοινή.
const isBuild = process.env.NEXT_PHASE === 'phase-production-build'
const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL, ...(isBuild ? { max: 2, idleTimeoutMillis: 5_000 } : {}) })

export const prisma = globalForPrisma.prisma ?? new PrismaClient({ adapter })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
