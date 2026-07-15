import { PgBoss } from 'pg-boss'

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossStarted?: boolean }

export function getBoss(): PgBoss {
  globalForBoss.boss ??= new PgBoss({
    connectionString: process.env.DATABASE_URL!,
    schema: 'pgboss',
  })
  return globalForBoss.boss
}

export async function startBoss(): Promise<PgBoss> {
  const boss = getBoss()
  if (!globalForBoss.bossStarted) {
    await boss.start()
    globalForBoss.bossStarted = true
  }
  return boss
}
