import { describe, it, expect, vi } from 'vitest'
vi.mock('@prisma/client', () => ({ PrismaClient: class {} }))
vi.mock('@prisma/adapter-pg', () => ({ PrismaPg: class {} }))
import { pooledDatabaseUrl } from '@/lib/prisma'

describe('pooledDatabaseUrl (PgBouncer)', () => {
  const url = 'postgresql://u:p%40ss@100.70.50.43:5432/damask?schema=public'
  it('αλλάζει μόνο τη θύρα', () => {
    expect(pooledDatabaseUrl(url, '6432')).toBe('postgresql://u:p%40ss@100.70.50.43:6432/damask?schema=public')
  })
  it('χωρίς PGBOUNCER_PORT → όπως πριν', () => {
    expect(pooledDatabaseUrl(url, undefined)).toBe(url)
    expect(pooledDatabaseUrl(url, 'abc')).toBe(url)
  })
})
