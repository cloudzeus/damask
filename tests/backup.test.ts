import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { EventEmitter } from 'node:events'
import type { ChildProcess } from 'node:child_process'

/**
 * Καλύπτει τα 4 σημεία που ζητήθηκαν ρητά: parseDbUrl, prune logic (κρατάει
 * Ν νεότερα), σειρά του restore guard (πρώτα safety backup, ΜΕΤΑ το restore
 * — και ΚΑΘΟΛΟΥ restore αν το safety backup αποτύχει), resolvePgDump/
 * resolvePgRestore priority. Δεν αγγίζει ΠΟΤΕ πραγματικό pg_dump/pg_restore
 * ή Postgres — spawn/fs/prisma/bunny-storage είναι όλα mocked.
 *
 * Το κοινό mutable state ζει μέσα σε vi.hoisted() — τα vi.mock() factories
 * τρέχουν hoisted πριν από ΟΠΟΙΟΔΗΠΟΤΕ top-level const του αρχείου, άρα ένα
 * απλό `const x = {...}` πριν το vi.mock που το χρησιμοποιεί ΔΕΝ αρκεί
 * (TDZ) — μόνο ό,τι ζει μέσα σε vi.hoisted() είναι εγγυημένα έτοιμο νωρίτερα.
 */

type FakeRow = {
  id: string; filename: string; storageKey: string; sizeBytes: bigint; status: string
  trigger: string; errorMessage: string | null; createdById: string | null; createdAt: Date
}

const h = vi.hoisted(() => ({
  settingsStore: new Map<string, unknown>(),
  rows: [] as FakeRow[],
  nextId: { value: 1 },
  spawn: { exitCode: 0, enoent: false },
  fs: {
    access: vi.fn(async (path: string): Promise<void> => { throw Object.assign(new Error(`ENOENT: ${path}`), { code: 'ENOENT' }) }),
    readFile: vi.fn(async () => Buffer.from('fake-dump-bytes')),
    writeFile: vi.fn(async () => {}),
    unlink: vi.fn(async () => {}),
  },
  bunny: {
    bunnyUploadPrivate: vi.fn(async () => ({ key: 'x' })),
    bunnyDownload: vi.fn(async () => Buffer.from('fake-dump-bytes')),
    bunnyDeleteOne: vi.fn(async () => {}),
    bunnyDeleteMany: vi.fn(async () => {}),
  },
}))

vi.mock('@/lib/settings', () => ({
  getSetting: vi.fn(async (key: string) => h.settingsStore.get(key) ?? null),
}))
vi.mock('@/lib/bunny-storage', () => h.bunny)
vi.mock('node:fs', () => ({ promises: h.fs }))
vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => {
    const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
    child.stderr = new EventEmitter()
    queueMicrotask(() => {
      if (h.spawn.enoent) child.emit('error', Object.assign(new Error('spawn ENOENT'), { code: 'ENOENT' }))
      else child.emit('close', h.spawn.exitCode)
    })
    return child
  }),
}))
vi.mock('@/lib/prisma', () => ({
  prisma: {
    dbBackup: {
      create: vi.fn(async ({ data }: { data: Partial<FakeRow> }) => {
        const row: FakeRow = {
          id: `bk_${h.nextId.value++}`,
          filename: data.filename!,
          storageKey: data.storageKey!,
          sizeBytes: (data.sizeBytes as bigint) ?? BigInt(0),
          status: (data.status as string) ?? 'PENDING',
          trigger: data.trigger!,
          errorMessage: null,
          createdById: data.createdById ?? null,
          createdAt: new Date(),
        }
        h.rows.push(row)
        return { ...row }
      }),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<FakeRow> }) => {
        const row = h.rows.find(r => r.id === where.id)
        if (!row) throw new Error('not found')
        Object.assign(row, data)
        return { ...row }
      }),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
        const row = h.rows.find(r => r.id === where.id)
        return row ? { ...row } : null
      }),
      findMany: vi.fn(async ({ where, orderBy }: { where?: { status?: string }; orderBy?: { createdAt: 'asc' | 'desc' } } = {}) => {
        let result = h.rows.slice()
        if (where?.status) result = result.filter(r => r.status === where.status)
        if (orderBy?.createdAt === 'desc') result.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
        return result.map(r => ({ ...r }))
      }),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const ids = new Set(where.id.in)
        const before = h.rows.length
        h.rows = h.rows.filter(r => !ids.has(r.id))
        return { count: before - h.rows.length }
      }),
      delete: vi.fn(async ({ where }: { where: { id: string } }) => {
        const idx = h.rows.findIndex(r => r.id === where.id)
        if (idx === -1) throw new Error('not found')
        const [removed] = h.rows.splice(idx, 1)
        return removed
      }),
    },
  },
}))

// ── module υπό δοκιμή (μετά τα mocks) ──
import {
  parseDbUrl, resolvePgDump, resolvePgRestore, runBackup, pruneOldBackups, restoreBackup,
} from '@/lib/backup'

function mkRow(overrides: Partial<FakeRow> = {}): FakeRow {
  const row: FakeRow = {
    id: `bk_${h.nextId.value++}`,
    filename: 'damask-2026-01-01.dump',
    storageKey: `backups/damask-${h.nextId.value}.dump`,
    sizeBytes: BigInt(1000),
    status: 'READY',
    trigger: 'cron',
    errorMessage: null,
    createdById: null,
    createdAt: new Date(),
    ...overrides,
  }
  h.rows.push(row)
  return row
}

beforeEach(() => {
  vi.clearAllMocks()
  h.settingsStore.clear()
  h.rows = []
  h.nextId.value = 1
  h.spawn.exitCode = 0
  h.spawn.enoent = false
  // vi.clearAllMocks() διαγράφει και τα mockImplementation overrides — ξαναβάζουμε τα defaults.
  h.fs.access.mockImplementation(async () => { throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' }) })
  h.fs.readFile.mockImplementation(async () => Buffer.from('fake-dump-bytes'))
  h.fs.writeFile.mockImplementation(async () => {})
  h.fs.unlink.mockImplementation(async () => {})
  h.bunny.bunnyUploadPrivate.mockImplementation(async () => ({ key: 'x' }))
  h.bunny.bunnyDownload.mockImplementation(async () => Buffer.from('fake-dump-bytes'))
  h.bunny.bunnyDeleteOne.mockImplementation(async () => {})
  h.bunny.bunnyDeleteMany.mockImplementation(async () => {})
  delete process.env.PG_DUMP
  delete process.env.PG_RESTORE
  delete process.env.DATABASE_URL
})
afterEach(() => {
  delete process.env.PG_DUMP
  delete process.env.PG_RESTORE
  delete process.env.DATABASE_URL
})

// ══════════════════════════════════════════════════════════════════════════
describe('parseDbUrl', () => {
  it('εξάγει host/port/user/password/database από ένα Postgres URL', () => {
    const result = parseDbUrl('postgres://dbuser:s3cret@10.0.0.5:5432/damask?schema=public')
    expect(result).toEqual({ host: '10.0.0.5', port: '5432', user: 'dbuser', password: 's3cret', database: 'damask' })
  })

  it('default port 5432 όταν λείπει από το URL', () => {
    const result = parseDbUrl('postgres://u:p@dbhost/mydb')
    expect(result.port).toBe('5432')
  })

  it('αποκωδικοποιεί URL-encoded ειδικούς χαρακτήρες στο password', () => {
    const result = parseDbUrl('postgres://u:p%40ss%2Fw0rd@dbhost:5432/mydb')
    expect(result.password).toBe('p@ss/w0rd')
  })

  it('αγνοεί το ?schema= query param της Prisma (μόνο pathname → database)', () => {
    const result = parseDbUrl('postgres://u:p@dbhost:5432/damask?schema=public&sslmode=require')
    expect(result.database).toBe('damask')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('resolvePgDump / resolvePgRestore — προτεραιότητα', () => {
  it('setting > όλα τα υπόλοιπα — δεν καν ελέγχει το filesystem', async () => {
    h.settingsStore.set('backups.pgDumpPath', '/custom/pg_dump')
    process.env.PG_DUMP = '/env/pg_dump'
    const result = await resolvePgDump()
    expect(result).toBe('/custom/pg_dump')
    expect(h.fs.access).not.toHaveBeenCalled()
  })

  it('env var > Homebrew candidates όταν δεν υπάρχει setting', async () => {
    process.env.PG_DUMP = '/env/pg_dump'
    const result = await resolvePgDump()
    expect(result).toBe('/env/pg_dump')
    expect(h.fs.access).not.toHaveBeenCalled()
  })

  it('χωρίς setting/env — επιλέγει τον ΠΡΩΤΟ candidate που υπάρχει (postgresql@16 πρώτο)', async () => {
    h.fs.access.mockImplementation(async (p: string) => {
      if (p !== '/opt/homebrew/opt/postgresql@16/bin/pg_dump') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })
    const result = await resolvePgDump()
    expect(result).toBe('/opt/homebrew/opt/postgresql@16/bin/pg_dump')
  })

  it('προσπερνάει candidates που δεν υπάρχουν και πιάνει έναν χαμηλότερης προτεραιότητας (π.χ. μόνο @17 εγκατεστημένο)', async () => {
    h.fs.access.mockImplementation(async (p: string) => {
      if (p !== '/opt/homebrew/opt/postgresql@17/bin/pg_dump') throw Object.assign(new Error('ENOENT'), { code: 'ENOENT' })
    })
    const result = await resolvePgDump()
    expect(result).toBe('/opt/homebrew/opt/postgresql@17/bin/pg_dump')
  })

  it('τίποτα διαθέσιμο — πέφτει στο bare "pg_dump" (PATH)', async () => {
    const result = await resolvePgDump()
    expect(result).toBe('pg_dump')
  })

  it('resolvePgRestore ακολουθεί ΤΗΝ ΙΔΙΑ λογική προτεραιότητας με δικό του setting key', async () => {
    h.settingsStore.set('backups.pgRestorePath', '/custom/pg_restore')
    const result = await resolvePgRestore()
    expect(result).toBe('/custom/pg_restore')
  })

  it('resolvePgRestore πέφτει σε bare "pg_restore" όταν τίποτα δεν βρίσκεται', async () => {
    const result = await resolvePgRestore()
    expect(result).toBe('pg_restore')
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('runBackup', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://u:p@dbhost:5432/damask?schema=public'
  })

  it('πετάει με ΚΑΘΑΡΟ ελληνικό μήνυμα όταν το pg_dump binary δεν υπάρχει (ENOENT)', async () => {
    h.spawn.enoent = true
    await expect(runBackup({ trigger: 'manual' })).rejects.toThrow(/Δεν βρέθηκε το εργαλείο pg_dump/)
    expect(h.rows).toHaveLength(1)
    expect(h.rows[0].status).toBe('FAILED')
    expect(h.rows[0].errorMessage).toMatch(/Δεν βρέθηκε το εργαλείο pg_dump/)
  })

  it('επιτυχές backup → status READY, σωστό sizeBytes, upload στο bunny-storage', async () => {
    const backup = await runBackup({ trigger: 'manual', userId: 'user-1' })
    expect(backup.status).toBe('READY')
    expect(backup.sizeBytes).toBe(BigInt(Buffer.from('fake-dump-bytes').length))
    expect(backup.trigger).toBe('manual')
    expect(backup.createdById).toBe('user-1')
    expect(h.bunny.bunnyUploadPrivate).toHaveBeenCalledTimes(1)
    expect(h.fs.unlink).toHaveBeenCalled() // tmp file καθαρίζεται πάντα (finally)
  })

  it('φτιάχνει filename με το ζητούμενο πρόθεμα (χρησιμοποιείται από το restore safety backup)', async () => {
    const backup = await runBackup({ trigger: 'manual', filenamePrefix: 'pre-restore' })
    expect(backup.filename.startsWith('pre-restore-')).toBe(true)
  })

  it('μια αποτυχία στο prune ΔΕΝ μετατρέπει σε FAILED ένα ήδη επιτυχές backup', async () => {
    h.bunny.bunnyDeleteMany.mockRejectedValueOnce(new Error('bunny hiccup'))
    h.settingsStore.set('backups.retentionDays', 1) // κρατάει μόνο 1 → prune έχει σίγουρα κάτι να διαγράψει
    mkRow({ status: 'READY', createdAt: new Date(Date.now() - 10_000) })
    mkRow({ status: 'READY', createdAt: new Date(Date.now() - 5_000) })
    const backup = await runBackup({ trigger: 'manual' })
    expect(backup.status).toBe('READY')
    expect(h.bunny.bunnyDeleteMany).toHaveBeenCalled() // το prune όντως έτρεξε (και απέτυχε) — όχι false positive
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('pruneOldBackups — κρατάει τα Ν πιο πρόσφατα READY', () => {
  it('διαγράφει ό,τι είναι πέρα από τα Ν νεότερα (bunny + DB row)', async () => {
    const base = Date.now()
    for (let i = 0; i < 5; i++) {
      mkRow({ status: 'READY', storageKey: `backups/f${i}.dump`, createdAt: new Date(base - i * 60_000) })
    }
    const result = await pruneOldBackups(3)
    expect(result.deletedCount).toBe(2)
    // τα 2 ΠΑΛΑΙΟΤΕΡΑ (i=3,4 — μεγαλύτερο "πριν") διαγράφονται
    expect(h.bunny.bunnyDeleteMany).toHaveBeenCalledWith(expect.arrayContaining(['backups/f3.dump', 'backups/f4.dump']))
    expect(h.rows).toHaveLength(3)
    expect(h.rows.map(r => r.storageKey)).toEqual(['backups/f0.dump', 'backups/f1.dump', 'backups/f2.dump'])
  })

  it('λιγότερα backups από το retention — δεν διαγράφει τίποτα', async () => {
    mkRow({ status: 'READY' })
    mkRow({ status: 'READY' })
    const result = await pruneOldBackups(30)
    expect(result.deletedCount).toBe(0)
    expect(h.bunny.bunnyDeleteMany).not.toHaveBeenCalled()
    expect(h.rows).toHaveLength(2)
  })

  it('αγνοεί μη-READY backups (FAILED/PENDING δεν μετράνε στο retention ούτε διαγράφονται εδώ)', async () => {
    for (let i = 0; i < 4; i++) mkRow({ status: 'READY', storageKey: `backups/r${i}.dump`, createdAt: new Date(Date.now() - i * 1000) })
    mkRow({ status: 'FAILED', storageKey: 'backups/failed.dump' })
    const result = await pruneOldBackups(2)
    expect(result.deletedCount).toBe(2) // μόνο τα 2 πλεονάζοντα READY
    expect(h.rows.some(r => r.storageKey === 'backups/failed.dump')).toBe(true) // το FAILED παραμένει άθικτο
  })

  it('retentionDays <= 0 → no-op ασφαλείας (δεν διαγράφει τα πάντα)', async () => {
    mkRow({ status: 'READY' })
    const result = await pruneOldBackups(0)
    expect(result.deletedCount).toBe(0)
    expect(h.rows).toHaveLength(1)
  })
})

// ══════════════════════════════════════════════════════════════════════════
describe('restoreBackup — σειρά του guard (safety backup ΠΡΩΤΑ, μετά το restore)', () => {
  beforeEach(() => {
    process.env.DATABASE_URL = 'postgres://u:p@dbhost:5432/damask?schema=public'
  })

  it('τρέχει ΠΡΩΤΑ ένα πλήρες safety backup, ΜΕΤΑ σημειώνει RESTORING, ΜΕΤΑ κατεβάζει/κάνει restore', async () => {
    const target = mkRow({ status: 'READY', storageKey: 'backups/target.dump', filename: 'target.dump' })
    const callLog: string[] = []
    h.bunny.bunnyUploadPrivate.mockImplementation(async () => { callLog.push('safety-backup-uploaded'); return { key: 'x' } })
    h.bunny.bunnyDownload.mockImplementation(async () => { callLog.push('target-downloaded'); return Buffer.from('fake') })

    const { restored, safetyBackup } = await restoreBackup(target.id, { userId: 'user-1' })

    expect(restored.status).toBe('READY')
    expect(safetyBackup.filename.startsWith('pre-restore-')).toBe(true)
    expect(safetyBackup.trigger).toBe('manual')
    expect(callLog).toEqual(['safety-backup-uploaded', 'target-downloaded'])
  })

  it('αν το safety backup αποτύχει, το restore ΔΕΝ προχωράει καθόλου — το target μένει READY', async () => {
    const target = mkRow({ status: 'READY', storageKey: 'backups/target.dump', filename: 'target.dump' })
    h.spawn.enoent = true // κάνει αποτυχία το pg_dump του safety backup

    await expect(restoreBackup(target.id)).rejects.toThrow()

    const targetAfter = h.rows.find(r => r.id === target.id)!
    expect(targetAfter.status).toBe('READY') // ΔΕΝ έφτασε ποτέ σε RESTORING
    expect(h.bunny.bunnyDownload).not.toHaveBeenCalled() // το πραγματικό restore ΔΕΝ ξεκίνησε καθόλου
  })

  it('αρνείται restore από backup που δεν είναι READY', async () => {
    const target = mkRow({ status: 'PENDING' })
    await expect(restoreBackup(target.id)).rejects.toThrow(/PENDING/)
    expect(h.bunny.bunnyUploadPrivate).not.toHaveBeenCalled() // ούτε καν το safety backup ξεκίνησε
  })

  it('backup id που δεν υπάρχει → σφάλμα, καμία ενέργεια', async () => {
    await expect(restoreBackup('nope')).rejects.toThrow(/δεν βρέθηκε/)
    expect(h.bunny.bunnyUploadPrivate).not.toHaveBeenCalled()
  })

  it('αν το ίδιο το restore (pg_restore) αποτύχει μετά το safety backup, η γραμμή επιστρέφει σε READY με errorMessage (όχι στραβωμένη σε RESTORING για πάντα)', async () => {
    const target = mkRow({ status: 'READY', storageKey: 'backups/target.dump', filename: 'target.dump' })
    let callCount = 0
    const { spawn } = await import('node:child_process')
    vi.mocked(spawn).mockImplementation(() => {
      callCount += 1
      const child = new EventEmitter() as EventEmitter & { stderr: EventEmitter }
      child.stderr = new EventEmitter()
      queueMicrotask(() => {
        // 1η κλήση = pg_dump του safety backup (πετυχαίνει)· 2η = pg_restore (αποτυχία)
        if (callCount === 1) child.emit('close', 0)
        else child.emit('close', 1)
      })
      return child as unknown as ChildProcess
    })

    await expect(restoreBackup(target.id)).rejects.toThrow()

    const targetAfter = h.rows.find(r => r.id === target.id)!
    expect(targetAfter.status).toBe('READY')
    expect(targetAfter.errorMessage).toMatch(/restore απέτυχε/)
  })
})
