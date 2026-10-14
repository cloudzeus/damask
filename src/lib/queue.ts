import { PgBoss } from 'pg-boss'

const globalForBoss = globalThis as unknown as { boss?: PgBoss; bossStarted?: boolean }

export function getBoss(): PgBoss {
  if (!globalForBoss.boss) {
    const boss = new PgBoss({
      connectionString: process.env.DATABASE_URL!,
      schema: 'pgboss',
      // Κοινός Postgres server (όριο συνδέσεων): ο pg-boss κρατούσε ~9 αδρανείς συνδέσεις — 3 αρκούν.
      max: Number(process.env.PGBOSS_POOL_MAX) || 3,
    })
    boss.on('error', err => console.error('[pg-boss] error:', err))
    globalForBoss.boss = boss
  }
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
