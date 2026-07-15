import type { Prisma } from '@prisma/client'
import { startBoss } from '@/lib/queue'
import { prisma } from '@/lib/prisma'
import { runProductImport, type RawImportRow, type ImportTotals } from '@/lib/import/product-upsert'
import { runBackup } from '@/lib/backup'

export const QUEUE_HEALTH = 'health'
/** Μεγάλες εισαγωγές Excel (>500 γραμμές — src/app/(app)/import/actions.ts executeImport). */
export const QUEUE_IMPORT = 'import'
/** Ημερήσιο DB backup → BunnyCDN (καρτέλα «Backups» στο /settings). Το χειροκίνητο
 * κουμπί «Backup τώρα» ΔΕΝ περνάει από αυτή την ουρά — καλεί runBackup απευθείας
 * από το server action (src/app/(app)/settings/backups-actions.ts). */
export const QUEUE_BACKUP = 'backup'

export type ImportJobPayload = { jobId: string; rows: RawImportRow[] }

export async function startQueue(): Promise<void> {
  const boss = await startBoss()

  await boss.createQueue(QUEUE_HEALTH)
  await boss.work(QUEUE_HEALTH, async () => {
    console.log('[pg-boss] health ok', new Date().toISOString())
  })
  // κάθε ώρα — αποδεικνύει ότι το cron scheduling δουλεύει· τα sync jobs έρχονται στη Φάση 2
  await boss.schedule(QUEUE_HEALTH, '0 * * * *')

  await boss.createQueue(QUEUE_IMPORT)
  await boss.work<ImportJobPayload>(QUEUE_IMPORT, async jobs => {
    const { jobId, rows } = jobs[0].data
    await prisma.importJob.update({ where: { id: jobId }, data: { status: 'RUNNING' } }).catch(() => {})
    try {
      const totals = await runProductImport(rows, async partial => {
        // Πρόοδος ανά chunk (1000 γραμμές) — το GET /api/import/status/[id] κάνει polling πάνω σε αυτό.
        await prisma.importJob.update({
          where: { id: jobId },
          data: { totals: partial as unknown as Prisma.InputJsonValue },
        })
      })
      const status: 'DONE' | 'FAILED' = totals.failed > 0 && totals.created + totals.updated === 0 ? 'FAILED' : 'DONE'
      await prisma.importJob.update({
        where: { id: jobId },
        data: { status, totals: totals as unknown as Prisma.InputJsonValue },
      })
    } catch (err) {
      console.error('[pg-boss] import job απέτυχε', jobId, err)
      await prisma.importJob.update({ where: { id: jobId }, data: { status: 'FAILED' } }).catch(() => {})
      throw err // pg-boss κάνει retry με exponential backoff (spec §13) πριν το τελικό fail
    }
  })

  await boss.createQueue(QUEUE_BACKUP)
  await boss.work(QUEUE_BACKUP, async () => {
    try {
      await runBackup({ trigger: 'cron' })
    } catch (err) {
      console.error('[pg-boss] daily backup job απέτυχε', err)
      throw err // pg-boss κάνει retry με exponential backoff (ίδιο idiom με QUEUE_IMPORT) —
                // το runBackup έχει ήδη σημειώσει τη γραμμή DbBackup ως FAILED πριν φτάσει εδώ.
    }
  })
  // Καθημερινά 03:30 Ελλάδα (Europe/Athens — pg-boss 12 ScheduleOptions.tz, χειρίζεται
  // αυτόματα θερινή/χειμερινή ώρα). Χωρίς `data` payload — το runBackup(cron) δεν χρειάζεται.
  await boss.schedule(QUEUE_BACKUP, '30 3 * * *', null, { tz: 'Europe/Athens' })

  console.log('[pg-boss] started')
}

export type { ImportTotals }
