import { spawn } from 'node:child_process'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import os from 'node:os'
import { randomBytes } from 'node:crypto'
import { prisma } from '@/lib/prisma'
import { getSetting } from '@/lib/settings'
import { bunnyUploadPrivate, bunnyDownload, bunnyDeleteOne, bunnyDeleteMany } from '@/lib/bunny-storage'
import { logApiUsage } from '@/lib/api-usage'
import type { DbBackup, DbBackupStatus } from '@prisma/client'

/**
 * Ημερήσια αντίγραφα ασφαλείας DB → BunnyCDN (καρτέλα «Backups» στο
 * /settings). Adaptation του proven reference lib/backup.ts στο DAMASK:
 * prisma singleton src/lib/prisma.ts, settings μέσω src/lib/settings.ts
 * (keys backups.retentionDays/pgDumpPath/pgRestorePath/storagePrefix),
 * upload/download/delete μέσω src/lib/bunny-storage.ts (raw Bunny Storage
 * HTTP API — ΟΧΙ S3 SDK, βλ. σχόλιο εκεί). Βελτιώσεις πάνω στο reference:
 * (1) το ίδιο robust version-aware path resolution εφαρμόζεται ΚΑΙ σε
 * pg_restore (το reference το είχε μόνο για pg_dump — κενό που θα έσπαγε το
 * restore με το ίδιο "server version mismatch" πρόβλημα)· (2) φιλικό
 * ελληνικό μήνυμα σφάλματος όταν το binary δεν βρίσκεται (ENOENT)· (3) ένα
 * αποτυχημένο prune ΔΕΝ ακυρώνει ένα ήδη επιτυχημένο backup.
 */

const DEFAULT_RETENTION_DAYS = 30
const DEFAULT_STORAGE_PREFIX = 'backups'

export type BackupTrigger = 'cron' | 'manual'

export function parseDbUrl(url: string): { host: string; port: string; user: string; password: string; database: string } {
  const u = new URL(url)
  return {
    host: u.hostname,
    port: u.port || '5432',
    user: decodeURIComponent(u.username),
    password: decodeURIComponent(u.password),
    database: u.pathname.replace(/^\//, ''),
  }
}

async function runPg(bin: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const child = spawn(bin, args, { env, stdio: ['ignore', 'pipe', 'pipe'] })
    let stderr = ''
    child.stderr?.on('data', d => { stderr += d.toString() })
    child.on('error', reject)
    child.on('close', code => {
      if (code === 0) resolve()
      else reject(new Error(`${path.basename(bin)} exited ${code}: ${stderr.slice(-2000)}`))
    })
  })
}

/** Φιλικό ελληνικό μήνυμα όταν το pg_dump/pg_restore binary δεν βρίσκεται καθόλου
 * (ENOENT) — το ωμό μήνυμα Node ("spawn pg_dump ENOENT") δεν λέει τίποτα σε
 * μη τεχνικό χρήστη στο UI. Οτιδήποτε άλλο σφάλμα περνάει ανέγγιχτο. */
function friendlyPgErrorMessage(err: unknown, bin: string, kind: 'pg_dump' | 'pg_restore'): string {
  const raw = err as NodeJS.ErrnoException | undefined
  const rawMessage = raw?.message ?? String(err)
  if (raw?.code === 'ENOENT' || /ENOENT/.test(rawMessage)) {
    return `Δεν βρέθηκε το εργαλείο ${kind} (δοκιμάστηκε: «${bin}»). Εγκατέστησε τον PostgreSQL client στον server ή όρισε τη σωστή διαδρομή στο Backups → Ρυθμίσεις για προχωρημένους.`
  }
  return rawMessage
}

type PgBinaryKind = 'pg_dump' | 'pg_restore'

// Σειρά προτεραιότητας φακέλων Homebrew έκδοσης — @16 ΠΡΩΤΟ: ο DAMASK server
// (DATABASE_URL) επαληθεύτηκε ζωντανά ως PostgreSQL 16.14 (Ubuntu, remote) — ΟΧΙ
// 17. Ένα ασύμβατο τοπικό pg_dump/pg_restore (π.χ. το bare `pg_dump` στο PATH,
// συχνά διαφορετική major version) σκάει με "server version mismatch". @17/@15
// μένουν ως fallback για μελλοντικό upgrade/downgrade του server.
const PG_VERSIONED_DIRS = ['postgresql@16', 'postgresql@17', 'postgresql@15']
const HOMEBREW_PREFIXES = ['/opt/homebrew/opt', '/usr/local/opt'] // Apple Silicon πρώτα, μετά Intel
const LINUX_VERSIONED_BINDIRS = ['/usr/lib/postgresql/16/bin', '/usr/lib/postgresql/17/bin', '/usr/lib/postgresql/15/bin'] // Debian/Ubuntu apt (π.χ. μελλοντικό Docker image)

/** Προτεραιότητα: explicit setting → env var → πρώτο Homebrew/apt install που ταιριάζει → bare bin στο PATH. */
async function resolvePgBinary(kind: PgBinaryKind, settingKey: string, envVar: string): Promise<string> {
  const fromSetting = await getSetting<string>(settingKey)
  if (fromSetting?.trim()) return fromSetting.trim()

  const fromEnv = process.env[envVar]
  if (fromEnv?.trim()) return fromEnv.trim()

  const candidates: string[] = []
  for (const dir of PG_VERSIONED_DIRS) {
    for (const prefix of HOMEBREW_PREFIXES) candidates.push(`${prefix}/${dir}/bin/${kind}`)
  }
  candidates.push(...LINUX_VERSIONED_BINDIRS.map(dir => `${dir}/${kind}`))

  for (const candidate of candidates) {
    try {
      await fs.access(candidate)
      return candidate
    } catch {
      // δοκίμασε το επόμενο candidate
    }
  }
  return kind // τελευταία επιλογή — ό,τι λύσει το PATH (μπορεί να είναι λάθος version)
}

export async function resolvePgDump(): Promise<string> {
  return resolvePgBinary('pg_dump', 'backups.pgDumpPath', 'PG_DUMP')
}

export async function resolvePgRestore(): Promise<string> {
  return resolvePgBinary('pg_restore', 'backups.pgRestorePath', 'PG_RESTORE')
}

async function resolveStoragePrefix(): Promise<string> {
  const raw = await getSetting<string>('backups.storagePrefix')
  return (raw?.trim() || DEFAULT_STORAGE_PREFIX).replace(/^\/+|\/+$/g, '')
}

async function resolveRetentionDays(): Promise<number> {
  const raw = await getSetting<number>('backups.retentionDays')
  const n = Number(raw)
  return Number.isFinite(n) && n > 0 ? n : DEFAULT_RETENTION_DAYS
}

export async function runBackup(opts: {
  trigger: BackupTrigger
  userId?: string | null
  /** Πρόθεμα filename — χρησιμοποιείται ΜΟΝΟ από restoreBackup() για το αυτόματο
   * safety backup πριν από ένα restore ("pre-restore-..."), ώστε να ξεχωρίζει
   * οπτικά στον πίνακα χωρίς να χρειάζεται νέα στήλη/enum τιμή. */
  filenamePrefix?: string
}): Promise<DbBackup> {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('Το DATABASE_URL δεν έχει οριστεί.')
  const db = parseDbUrl(dbUrl)

  const pgDump = await resolvePgDump()
  const prefix = await resolveStoragePrefix()
  const retentionDays = await resolveRetentionDays()

  const stamp = new Date().toISOString().replace(/[:.]/g, '-')
  const baseFilename = `damask-${stamp}-${randomBytes(4).toString('hex')}.dump`
  const filename = opts.filenamePrefix ? `${opts.filenamePrefix}-${baseFilename}` : baseFilename
  const storageKey = `${prefix}/${filename}`
  const tmpFile = path.join(os.tmpdir(), filename)

  const record = await prisma.dbBackup.create({
    data: {
      filename,
      storageKey,
      sizeBytes: BigInt(0),
      status: 'PENDING',
      trigger: opts.trigger,
      createdById: opts.userId ?? null,
    },
  })

  try {
    // pg_dump custom format (-F c) — συμπιεσμένο, υποστηρίζει selective/parallel restore.
    const args = [
      '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database,
      '-F', 'c', '--no-owner', '--no-acl', '-f', tmpFile,
    ]
    await runPg(pgDump, args, { ...process.env, PGPASSWORD: db.password })

    const buf = await fs.readFile(tmpFile)
    await bunnyUploadPrivate({ key: storageKey, body: buf, contentType: 'application/octet-stream' })
    void logApiUsage({
      service: 'bunnycdn', operation: 'backup', units: buf.length / 1e9,
      userId: opts.userId, refType: 'dbBackup', refId: record.id,
    })

    const updated = await prisma.dbBackup.update({
      where: { id: record.id },
      data: { status: 'READY', sizeBytes: BigInt(buf.length) },
    })

    // Best-effort housekeeping — ΔΕΝ πρέπει ένα πρόβλημα στο prune (π.χ. Bunny
    // hiccup διαγράφοντας ένα παλιό αρχείο) να μετατρέψει σε "FAILED" ένα
    // backup που μόλις ολοκληρώθηκε επιτυχώς.
    try {
      await pruneOldBackups(retentionDays)
    } catch (pruneErr) {
      console.error('[backup] pruneOldBackups απέτυχε μετά από επιτυχές backup (το backup παραμένει READY):', pruneErr)
    }

    return updated
  } catch (err) {
    const message = friendlyPgErrorMessage(err, pgDump, 'pg_dump')
    await prisma.dbBackup.update({
      where: { id: record.id },
      data: { status: 'FAILED', errorMessage: message.slice(0, 1000) },
    })
    throw new Error(message)
  } finally {
    await fs.unlink(tmpFile).catch(() => {})
  }
}

/**
 * Κρατάει τα `retentionDays` πιο πρόσφατα READY backups, διαγράφει τα
 * υπόλοιπα (Bunny + DB row). ΣΗΜΕΙΩΣΗ ονοματολογίας: παρά το όνομα setting
 * "retentionDays", η λογική είναι count-based ("κράτα τα Ν νεότερα"), όχι
 * ημερολογιακή αποκοπή (createdAt >= now - N days) — απλούστερο, προβλέψιμο,
 * και επαρκές όσο τρέχει ≤1 cron backup/ημέρα (τότε Ν backups ≈ Ν ημέρες).
 * Αν αργότερα προστεθούν συχνά manual backups, τα «νεότερα Ν» μπορεί να
 * καλύπτουν λιγότερο από Ν ημερολογιακές ημέρες — αποδεκτό tradeoff για v1.
 */
export async function pruneOldBackups(retentionDays: number): Promise<{ deletedCount: number }> {
  if (!Number.isFinite(retentionDays) || retentionDays <= 0) return { deletedCount: 0 }

  const ready = await prisma.dbBackup.findMany({
    where: { status: 'READY' },
    orderBy: { createdAt: 'desc' },
  })
  const toDelete = ready.slice(retentionDays)
  if (toDelete.length === 0) return { deletedCount: 0 }

  await bunnyDeleteMany(toDelete.map(b => b.storageKey))
  await prisma.dbBackup.deleteMany({ where: { id: { in: toDelete.map(b => b.id) } } })
  return { deletedCount: toDelete.length }
}

export async function restoreBackup(
  id: string,
  opts: { userId?: string | null } = {},
): Promise<{ restored: DbBackup; safetyBackup: DbBackup }> {
  const dbUrl = process.env.DATABASE_URL
  if (!dbUrl) throw new Error('Το DATABASE_URL δεν έχει οριστεί.')
  const db = parseDbUrl(dbUrl)

  const record = await prisma.dbBackup.findUnique({ where: { id } })
  if (!record) throw new Error('Το backup δεν βρέθηκε.')
  if (record.status !== 'READY') {
    throw new Error(`Δεν μπορεί να γίνει restore — το backup είναι σε κατάσταση ${record.status}.`)
  }

  // ΚΑΝΟΝΑΣ ΑΣΦΑΛΕΙΑΣ (μη διαπραγματεύσιμος, ΠΡΩΤΟ βήμα): φρέσκο αντίγραφο
  // ασφαλείας ΤΗΣ ΤΡΕΧΟΥΣΑΣ κατάστασης πριν αγγίξουμε καθόλου τη ζωντανή DB —
  // ώστε το restore να είναι ΠΑΝΤΑ αναστρέψιμο. Αν αυτό αποτύχει, πετάει ΕΔΩ
  // και το restore ΔΕΝ προχωράει καθόλου· το target backup μένει άθικτο σε
  // status READY (δεν έχει ακόμα σημειωθεί RESTORING).
  const safetyBackup = await runBackup({ trigger: 'manual', userId: opts.userId ?? null, filenamePrefix: 'pre-restore' })

  const pgRestore = await resolvePgRestore()
  await prisma.dbBackup.update({ where: { id }, data: { status: 'RESTORING', errorMessage: null } })

  const tmpFile = path.join(os.tmpdir(), `restore-${record.filename}`)
  try {
    const buf = await bunnyDownload(record.storageKey)
    await fs.writeFile(tmpFile, buf)

    const args = [
      '-h', db.host, '-p', db.port, '-U', db.user, '-d', db.database,
      '--clean', '--if-exists', '--no-owner', '--no-acl', tmpFile,
    ]
    await runPg(pgRestore, args, { ...process.env, PGPASSWORD: db.password })

    const restored = await prisma.dbBackup.update({ where: { id }, data: { status: 'READY', errorMessage: null } })
    return { restored, safetyBackup }
  } catch (err) {
    const message = friendlyPgErrorMessage(err, pgRestore, 'pg_restore')
    await prisma.dbBackup.update({
      where: { id },
      data: { status: 'READY', errorMessage: `Το restore απέτυχε: ${message.slice(0, 800)}` },
    })
    throw new Error(message)
  } finally {
    await fs.unlink(tmpFile).catch(() => {})
  }
}

export async function deleteBackup(id: string): Promise<void> {
  const record = await prisma.dbBackup.findUnique({ where: { id } })
  if (!record) return
  if (record.status === 'RESTORING') {
    throw new Error('Δεν μπορεί να διαγραφεί ένα backup όσο βρίσκεται σε εξέλιξη restore.')
  }
  await bunnyDeleteOne(record.storageKey).catch(() => {})
  await prisma.dbBackup.delete({ where: { id } })
}

/** Πλάκα-ασφαλές (BigInt → number) list για να περάσει ως prop σε Client
 * Component — το Next.js server→client serialization ΔΕΝ υποστηρίζει BigInt. */
export type BackupListItem = {
  id: string
  filename: string
  sizeBytes: number
  status: DbBackupStatus
  trigger: string
  errorMessage: string | null
  createdById: string | null
  createdAt: Date
}

export async function listBackups(): Promise<BackupListItem[]> {
  const rows = await prisma.dbBackup.findMany({ orderBy: { createdAt: 'desc' } })
  return rows.map(row => ({ ...row, sizeBytes: Number(row.sizeBytes) }))
}
