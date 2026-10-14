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
/** Sync βοηθητικών πινάκων SoftOne (VAT/COUNTRY/IRSDATA/κ.λπ. — src/lib/s1-sync.ts).
 * Το χειροκίνητο κουμπί «Sync βοηθητικών από SoftOne» (καρτέλα «Διασυνδέσεις»)
 * ΔΕΝ περνάει από αυτή την ουρά — καλεί syncAllReferences απευθείας από το server
 * action (src/app/(app)/settings/s1-sync-actions.ts), ίδιο idiom με QUEUE_BACKUP.
 * Η ουρά είναι πλέον scheduled dispatcher tick (κάθε 5′, Europe/Athens): διαβάζει
 * το objects.sync, βρίσκει ποια sync targets είναι due (enabled + non-manual +
 * πέρασε το interval) και τρέχει το καθένα μέσω runSyncTarget. Μόνο το
 * 's1-references' έχει engine σήμερα· products/partners εκκρεμούν (pending). */
export const QUEUE_S1_REF_SYNC = 's1-ref-sync'
/** Ημερήσιο digest εκκρεμοτήτων (ΕΣΠΑ PM — C2c). Scheduled tick 08:00 Europe/Athens,
 * τρέχει runPmReminders (src/lib/pm/reminders-run.ts): μαζεύει ανοιχτές
 * ApplicationObligation ανά assignee, στέλνει ένα email digest (mailer-gated,
 * no-op αν δεν έχει ρυθμιστεί Mailgun) και καταγράφει ReminderLog (idempotent —
 * ένα SENT/ημέρα/χρήστη). */
export const QUEUE_PM_REMINDERS = 'pm-reminders'
/** Νυχτερινό incremental backup αρχείων στο Synology NAS (src/lib/nas/backup.ts). */
export const QUEUE_NAS_BACKUP = 'nas-backup'
/** Νυχτερινή «απόσταξη» συζητήσεων του Thanos σε μαθήματα (src/lib/thanos/learning.ts distillTurns). */
export const QUEUE_THANOS_DISTILL = 'thanos-distill'
/** Μαζική εισαγωγή δωρεάν stock φωτογραφιών (Pexels/Pixabay) στο Media Gallery (src/lib/stock/bulk-import.ts). */
export const QUEUE_STOCK_IMPORT = 'stock-import'
/** Αυτόματη αρθρογραφία SEO: ημερήσιο tick (ιδέες από espa.gr + άρθρο με τον εβδομαδιαίο ρυθμό) — src/lib/seo-content/engine.ts. */
export const QUEUE_SEO_AUTOPILOT = 'seo-autopilot'
/** Συγγραφή ενός άρθρου από ιδέα (χειροκίνητο «Γράψε τώρα»). */
export const QUEUE_SEO_WRITE = 'seo-write'

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

  // SoftOne εκτός προδιαγραφών (FEATURES.softone): χωρίς dispatcher — και αφαίρεση παλιού schedule.
  const { FEATURES } = await import('@/lib/features')
  await boss.createQueue(QUEUE_S1_REF_SYNC)
  if (!FEATURES.softone) await boss.unschedule(QUEUE_S1_REF_SYNC).catch(() => {})
  else {
  // Dispatcher tick: κάθε 5′ διαβάζει το objects.sync, βρίσκει ποια targets είναι due
  // (enabled + non-manual + πέρασε το interval) και τρέχει το engine τους. Μόνο το
  // 's1-references' έχει engine· products/partners επιστρέφουν "pending" (no-op).
  await boss.work(QUEUE_S1_REF_SYNC, async () => {
    try {
      const { getSyncConfigs } = await import('@/lib/sync-config-server')
      const { dueTargetKeys } = await import('@/lib/sync-targets')
      const { runSyncTarget } = await import('@/lib/sync-engines')
      const configs = await getSyncConfigs()
      const due = dueTargetKeys(configs, Date.now())
      for (const key of due) {
        const res = await runSyncTarget(key, () => new Date().toISOString())
        if (!res.ok && !res.pending) console.warn('[pg-boss] s1 sync target απέτυχε', key, res.message)
      }
    } catch (err) {
      // Ποτέ throw προς το pg-boss εδώ — infra failure (π.χ. DB outage στο getSyncConfigs/SyncLog)
      // θα προκαλούσε retry-storm στον scheduled dispatcher. Log + swallow.
      console.error('[pg-boss] s1 sync dispatcher απέτυχε', err)
    }
  })
  await boss.schedule(QUEUE_S1_REF_SYNC, '*/5 * * * *', null, { tz: 'Europe/Athens' })
  }

  await boss.createQueue(QUEUE_PM_REMINDERS)
  await boss.work(QUEUE_PM_REMINDERS, async () => {
    try { const { runPmReminders } = await import('@/lib/pm/reminders-run'); await runPmReminders(Date.now()) }
    catch (err) { console.error('[pg-boss] pm-reminders dispatcher απέτυχε', err) } // never rethrow — scheduled tick
    // Υπενθύμιση επανεπικοινωνίας δικαιολογητικών (ανά αίτηση cadence) — ίδιο ημερήσιο tick.
    try { const { runDocFollowupReminders } = await import('@/lib/pm/doc-followup-run'); await runDocFollowupReminders(Date.now()) }
    catch (err) { console.error('[pg-boss] doc-followup dispatcher απέτυχε', err) }
    // Λήξη-reopen: ληγμένα εγκεκριμένα δικαιολογητικά → ξανά PENDING + alert.
    try { const { runDocExpiryReopen } = await import('@/lib/pm/doc-expiry-run'); await runDocExpiryReopen(Date.now()) }
    catch (err) { console.error('[pg-boss] doc-expiry dispatcher απέτυχε', err) }
  })
  await boss.schedule(QUEUE_PM_REMINDERS, '0 8 * * *', null, { tz: 'Europe/Athens' })

  await boss.createQueue(QUEUE_NAS_BACKUP)
  await boss.work(QUEUE_NAS_BACKUP, async () => {
    try {
      // 1. σάρωση αποθήκης + ευρετήριο αναζήτησης (πάντα) · 2. backup στο NAS (αν ρυθμισμένο)
      const { scanStorage, runNasBackup } = await import('@/lib/nas/backup')
      const { reindexDocuments } = await import('@/lib/search/documents')
      await scanStorage()
      await reindexDocuments().catch(err => console.error('[pg-boss] search reindex απέτυχε', err))
      const r = await runNasBackup({ trigger: 'cron', skipScan: true })
      if (r.skipped) console.log('[pg-boss] nas-backup:', r.skipped)
    } catch (err) {
      console.error('[pg-boss] nas-backup απέτυχε', err) // never rethrow — scheduled tick, ιστορικό στο NasBackupRun
    }
  })
  // Κάθε βράδυ 02:00 Ελλάδα — πριν το backup βάσης (03:30), το οποίο πιάνεται την επόμενη νύχτα.
  await boss.schedule(QUEUE_NAS_BACKUP, '0 2 * * *', null, { tz: 'Europe/Athens' })
  // Χάθηκε το νυχτερινό (server κλειστός στις 02:00); → αναπλήρωση σε 2′ από την εκκίνηση.
  try {
    const { nasBackupOverdue } = await import('@/lib/nas/backup')
    if (await nasBackupOverdue()) {
      await boss.send(QUEUE_NAS_BACKUP, null, { startAfter: 120, singletonKey: 'nas-catchup' })
      console.log('[pg-boss] nas-backup: αναπλήρωση χαμένου νυχτερινού σε 2′')
    }
  } catch (err) {
    console.error('[pg-boss] nas catch-up check απέτυχε', err)
  }

  // Άμεση ευρετηρίαση: κάθε upload/διαγραφή → καταχώριση στον κατάλογο + reindex (μόνο τα αλλαγμένα παίρνουν embedding).
  const { QUEUE_SEARCH_INDEX } = await import('@/lib/search/live-index')
  await boss.createQueue(QUEUE_SEARCH_INDEX)
  await boss.work<import('@/lib/search/live-index').StorageChange>(QUEUE_SEARCH_INDEX, { batchSize: 100 }, async jobs => {
    const { indexStorageChanges } = await import('@/lib/nas/backup')
    const { reindexDocuments } = await import('@/lib/search/documents')
    await indexStorageChanges(jobs.map(j => j.data))
    await reindexDocuments()
  })

  // Μαζική εισαγωγή αρχείων: αναγνώριση στο παρασκήνιο (σειριακά, με «μνήμη ορίων» AI). Κάθε λεπτό + «σκούντημα» μετά
  // από κάθε ανέβασμα· αν μείνουν αρχεία μετά το χρονικό όριο του γύρου, ο γύρος ξαναστέλνεται αμέσως.
  const { QUEUE_IMPORT_RECOGNIZE, runImportSweep, kickImportSweep } = await import('@/lib/import/recognize')
  await boss.createQueue(QUEUE_IMPORT_RECOGNIZE)
  await boss.work(QUEUE_IMPORT_RECOGNIZE, async () => {
    try {
      if (await runImportSweep(50_000)) kickImportSweep()
    } catch (err) {
      console.error('[pg-boss] import-recognize απέτυχε', err) // never rethrow — επόμενος γύρος σε 1′
    }
  })
  await boss.schedule(QUEUE_IMPORT_RECOGNIZE, '* * * * *', null, { tz: 'Europe/Athens' })

  // Αλλαγές καταλόγου (τύποι/Οδηγοί/εκπαίδευση) → ξαναεξέταση αναγνώριστων + ανάγνωση τιμών αποθηκευμένων. Κάθε 15′
  // (φθηνός έλεγχος έκδοσης) και ~2′ μετά από κάθε αλλαγή (kickCatalogRecheck).
  const { QUEUE_CATALOG_RECHECK, runCatalogRecheck } = await import('@/lib/import/catalog')
  await boss.createQueue(QUEUE_CATALOG_RECHECK)
  await boss.work(QUEUE_CATALOG_RECHECK, async () => {
    try {
      const r = await runCatalogRecheck()
      if (r.requeued || r.valuesRead) console.log(`[pg-boss] catalog-recheck: ${r.requeued} ξανά στην ουρά, ${r.valuesRead} δικαιολογητικά με νέες τιμές (${r.valuesPending} εκκρεμούν)`)
    } catch (err) {
      console.error('[pg-boss] catalog-recheck απέτυχε', err) // never rethrow — επόμενος γύρος σε 15′
    }
  })
  await boss.schedule(QUEUE_CATALOG_RECHECK, '*/15 * * * *', null, { tz: 'Europe/Athens' })

  // Πακέτα δικαιολογητικών σειράς (π.χ. 12 Φ2 σε ένα PDF) → ένα έγγραφο ανά περίοδο.
  const { QUEUE_SERIES_BUNDLE, runBundleJob } = await import('@/lib/documents/bundle')
  await boss.createQueue(QUEUE_SERIES_BUNDLE)
  await boss.work<{ docId: string; userId: string | null }>(QUEUE_SERIES_BUNDLE, async jobs => {
    for (const job of jobs) {
      const r = await runBundleJob(job.data.docId, job.data.userId)
      if (r?.bundle) console.log(`[pg-boss] series-bundle ${job.data.docId}: ${r.created.length} περίοδοι, ${r.existing.length} υπήρχαν`)
    }
  })

  // Συμφιλίωση εκκρεμοτήτων με τα δικαιολογητικά της εταιρίας (μετά από ανεβάσματα).
  const { QUEUE_OBLIGATIONS_RECONCILE, reconcileTrdrObligations } = await import('@/lib/pm/obligations-reconcile')
  await boss.createQueue(QUEUE_OBLIGATIONS_RECONCILE)
  await boss.work<{ trdrId: string }>(QUEUE_OBLIGATIONS_RECONCILE, async jobs => {
    for (const job of jobs) {
      const r = await reconcileTrdrObligations(job.data.trdrId, { ai: true })
      if (r.covered.length || r.waived || r.series) console.log(`[pg-boss] obligations-reconcile ${job.data.trdrId}: ${r.covered.length} καλύφθηκαν, ${r.waived} δεν απαιτούνται, ${r.series} σειρές`)
    }
  })

  // Αυτόματη καταχώριση εγγράφων στην υλοποίηση έργου (κατ' απαίτηση από τη σελίδα· η πρόοδος σε Setting).
  const { QUEUE_IMPL_AUTOFILE, runImplAutofile } = await import('@/lib/pm/impl-autofile')
  await boss.createQueue(QUEUE_IMPL_AUTOFILE)
  await boss.work<{ applicationId: string; userId: string | null }>(QUEUE_IMPL_AUTOFILE, async jobs => {
    for (const job of jobs) {
      const r = await runImplAutofile(job.data.applicationId, job.data.userId)
      console.log(`[pg-boss] impl-autofile ${job.data.applicationId}: ${r.state} — ${JSON.stringify(r.counts)}`)
    }
  })

  await boss.createQueue(QUEUE_THANOS_DISTILL)
  await boss.work(QUEUE_THANOS_DISTILL, async () => {
    try {
      const { distillTurns } = await import('@/lib/thanos/learning')
      const r = await distillTurns()
      if (r.turns) console.log(`[pg-boss] thanos-distill: ${r.turns} συζητήσεις → ${r.lessons} νέα μαθήματα`)
    } catch (err) {
      console.error('[pg-boss] thanos-distill απέτυχε', err) // never rethrow — scheduled tick
    }
  })
  await boss.schedule(QUEUE_THANOS_DISTILL, '30 4 * * *', null, { tz: 'Europe/Athens' })

  await boss.createQueue(QUEUE_STOCK_IMPORT)
  await boss.work<{ target?: number }>(QUEUE_STOCK_IMPORT, async ([job]) => {
    try {
      const { runStockImport } = await import('@/lib/stock/bulk-import')
      const r = await runStockImport(job?.data?.target ?? 500)
      console.log(`[pg-boss] stock-import: ${r.imported} εικόνες (${r.skipped} υπήρχαν, ${r.failed} αποτυχίες)`)
    } catch (err) {
      console.error('[pg-boss] stock-import απέτυχε', err) // never rethrow — η πρόοδος/σφάλμα γράφεται στο status
    }
  })

  await boss.createQueue(QUEUE_SEO_AUTOPILOT)
  await boss.work(QUEUE_SEO_AUTOPILOT, async () => {
    try {
      const { runAutopilot } = await import('@/lib/seo-content/engine')
      const r = await runAutopilot()
      console.log('[pg-boss] seo-autopilot:', JSON.stringify(r))
    } catch (err) {
      console.error('[pg-boss] seo-autopilot απέτυχε', err) // never rethrow — scheduled tick
    }
    // Ίδιο ημερήσιο tick: νέες προσκλήσεις για επιχειρήσεις από το espa.gr → πρόχειρα προγράμματα (έλεγχος από γραφείο).
    try {
      const { harvestEspaCalls } = await import('@/lib/programs/espa-harvest')
      const h = await harvestEspaCalls()
      console.log('[pg-boss] espa-calls:', JSON.stringify({ checked: h.checked, business: h.business, created: h.created.length }))
    } catch (err) {
      console.error('[pg-boss] espa-calls απέτυχε', err)
    }
    // Ίδιο ημερήσιο tick: δυνητικά προγράμματα όλων των πελατών (νέοι πελάτες/ΚΑΔ/προγράμματα της ημέρας).
    try {
      const { runPotentialMatching } = await import('@/lib/pm/potential-matching')
      const m = await runPotentialMatching()
      console.log('[pg-boss] potential-matching:', JSON.stringify({ programs: m.programs, customers: m.customers, matches: m.matches }))
    } catch (err) {
      console.error('[pg-boss] potential-matching απέτυχε', err)
    }
    // Ίδιο ημερήσιο tick: αιτήματα κριτικής Google σε νέες εγκρίσεις/πληρωμές (τοπικό SEO).
    try {
      const { runReviewRequests } = await import('@/lib/reviews/review-requests')
      console.log('[pg-boss] review-requests:', JSON.stringify(await runReviewRequests()))
    } catch (err) {
      console.error('[pg-boss] review-requests απέτυχε', err)
    }
  })
  await boss.schedule(QUEUE_SEO_AUTOPILOT, '30 9 * * *', null, { tz: 'Europe/Athens' })

  await boss.createQueue(QUEUE_SEO_WRITE)
  await boss.work<{ ideaId: string; publish: boolean }>(QUEUE_SEO_WRITE, async ([job]) => {
    if (!job?.data?.ideaId) return
    try {
      const { writeArticle } = await import('@/lib/seo-content/engine')
      await writeArticle(job.data.ideaId, { publish: !!job.data.publish })
    } catch (err) {
      console.error('[pg-boss] seo-write απέτυχε', err) // το σφάλμα γράφεται στην ιδέα (status ERROR)
    }
  })

  console.log('[pg-boss] started')
}

export type { ImportTotals }
