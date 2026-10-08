import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bunnyList, bunnyDownload, bunnyUploadPrivate } from '@/lib/bunny-storage'
import { SynologyClient, getSynologyConfig } from '@/lib/nas/synology'

/**
 * Ευρετήριο αρχείων + incremental backup στο Synology NAS. (Plain module.)
 *
 *   1. scanStorage(): αναδρομική λίστα ΟΛΗΣ της Bunny storage zone → FileIndexEntry
 *      (κατηγορία + πελάτης από τη διαδρομή· όσα χάθηκαν από την αποθήκη → missingAt).
 *   2. backupPending(): ανεβάζει στο NAS ΜΟΝΟ νέα/αλλαγμένα (lastChanged/μέγεθος) με την
 *      ίδια δομή φακέλων κάτω από τον φάκελο backup· όριο χρόνου ανά εκτέλεση — ό,τι
 *      μείνει συνεχίζει στην επόμενη.
 *   3. runNasBackup(): scan + backup με κλείδωμα (μία εκτέλεση τη φορά) + ιστορικό.
 * Στο NAS ΔΕΝ σβήνεται ποτέ τίποτα (αρχείο που χάθηκε από την αποθήκη μένει ως αντίγραφο).
 */

const CONCURRENCY = 3
const createId = () => `fi_${crypto.randomUUID().replace(/-/g, '')}`
const DEFAULT_BUDGET_MS = 45 * 60_000
const MAX_ATTEMPTS = 5

// ── Κατηγορία & πελάτης από τη διαδρομή ─────────────────────────────────────

export const CATEGORY_LABELS: Record<string, string> = {
  customer: 'Φάκελος πελάτη',
  dossier: 'Δικαιολογητικά',
  project: 'Έγγραφα έργων',
  quote: 'Προσφορές δαπανών',
  gemi: 'ΓΕΜΗ',
  tax: 'Έντυπα (Ε3/ΕΜΕ κ.λπ.)',
  request: 'Αιτήματα δικαιολογητικών',
  media: 'Media Gallery',
  'db-backup': 'Backups βάσης',
  template: 'Πρότυπα εντύπων',
  program: 'Αρχεία προγραμμάτων (προσκλήσεις)',
  other: 'Λοιπά',
}

type Resolver = {
  byFolder: Map<string, string>
  appTrdr: Map<string, string>
  expenseApp: Map<string, string>
  requestTrdr: Map<string, string>
}

async function buildResolver(): Promise<Resolver> {
  const [trdrs, apps, expenses, requests] = await Promise.all([
    prisma.trdr.findMany({ where: { cdnFolder: { not: null } }, select: { id: true, cdnFolder: true } }),
    prisma.programApplication.findMany({ select: { id: true, trdrId: true } }),
    prisma.programExpense.findMany({ where: { quoteStorageKey: { not: null } }, select: { id: true, applicationId: true } }),
    prisma.fileRequest.findMany({ select: { id: true, trdrId: true } }),
  ])
  return {
    byFolder: new Map(trdrs.map(t => [t.cdnFolder!.replace(/\/+$/, ''), t.id])),
    appTrdr: new Map(apps.map(a => [a.id, a.trdrId])),
    expenseApp: new Map(expenses.map(e => [e.id, e.applicationId])),
    requestTrdr: new Map(requests.map(r => [r.id, r.trdrId])),
  }
}

export function classifyKey(key: string, r: Resolver): { category: string; trdrId: string | null } {
  const seg = key.split('/')
  const [a, b, c] = seg
  switch (a) {
    case 'partners': {
      const trdrId = r.byFolder.get(`partners/${b}/${c}`) ?? null
      const category = seg.includes('gemi') ? 'gemi' : 'customer'
      return { category, trdrId }
    }
    case 'dossier': return { category: 'dossier', trdrId: b ?? null }
    case 'trdr': return { category: key.includes('/gemi/') ? 'gemi' : 'customer', trdrId: b ?? null }
    case 'tax-records': return { category: 'tax', trdrId: b ?? null }
    case 'pm':
    case 'portal': return { category: 'project', trdrId: r.appTrdr.get(b) ?? null }
    case 'expense-quotes': {
      const appId = b?.startsWith('app-') ? b.slice(4) : r.expenseApp.get(b)
      return { category: 'quote', trdrId: appId ? (r.appTrdr.get(appId) ?? null) : null }
    }
    case 'file-requests': return { category: 'request', trdrId: r.requestTrdr.get(b) ?? null }
    case 'media-gallery':
    case 'media':
    case 'wwa':
    case 'products': return { category: 'media', trdrId: null }
    case 'programs': return { category: 'program', trdrId: null }
    case 'backups': return { category: 'db-backup', trdrId: null }
    case 'tax-templates': return { category: 'template', trdrId: null }
    default: return { category: 'other', trdrId: null }
  }
}

/** Bunny δίνει «LastChanged» σε UTC χωρίς ζώνη (ή κενό) — ποτέ invalid Date. */
function parseBunnyDate(v: string): Date {
  if (v) {
    const withZ = /[zZ]|[+-]\d\d:?\d\d$/.test(v) ? v : `${v}Z`
    const d = new Date(withZ)
    if (!Number.isNaN(d.getTime())) return d
    const d2 = new Date(v)
    if (!Number.isNaN(d2.getTime())) return d2
  }
  return new Date(0)
}

/** Άμεση ενημέρωση του καταλόγου για συγκεκριμένα αρχεία (upload/διαγραφή) — χωρίς πλήρη σάρωση. */
export async function indexStorageChanges(changes: { key: string; size?: number; op: 'put' | 'del' }[]): Promise<void> {
  const latest = new Map<string, { key: string; size?: number; op: 'put' | 'del' }>()
  for (const c of changes) latest.set(c.key, c)
  const puts = [...latest.values()].filter(c => c.op === 'put')
  const dels = [...latest.values()].filter(c => c.op === 'del').map(c => c.key)
  if (puts.length) {
    const resolver = await buildResolver()
    const now = new Date()
    const values = puts.map(p => {
      const cls = classifyKey(p.key, resolver)
      return Prisma.sql`(${createId()}, ${p.key}, ${p.size ?? 0}, ${now}, ${cls.category}, ${cls.trdrId}, ${now}, NOW(), NOW())`
    })
    await prisma.$executeRaw`
      INSERT INTO "FileIndexEntry" ("id", "key", "size", "lastChanged", "category", "trdrId", "seenAt", "createdAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("key") DO UPDATE SET
        "size" = EXCLUDED."size", "lastChanged" = EXCLUDED."lastChanged", "category" = EXCLUDED."category",
        "trdrId" = EXCLUDED."trdrId", "seenAt" = EXCLUDED."seenAt", "missingAt" = NULL, "updatedAt" = NOW()`
  }
  if (dels.length) {
    await prisma.fileIndexEntry.updateMany({ where: { key: { in: dels }, missingAt: null }, data: { missingAt: new Date() } })
  }
}

// ── 1. Σάρωση αποθήκης ─────────────────────────────────────────────────────

export async function scanStorage(opts: { onProgress?: (n: number) => void } = {}): Promise<{ scanned: number; missing: number }> {
  const resolver = await buildResolver()
  const startedAt = new Date()
  const queue: string[] = ['']
  let scanned = 0
  const batch: { key: string; size: number; lastChanged: Date; category: string; trdrId: string | null }[] = []

  // Bulk upsert (ένα INSERT … ON CONFLICT ανά παρτίδα) — γρήγορο και σε απομακρυσμένη βάση.
  const flush = async () => {
    if (!batch.length) return
    const rows = batch.splice(0)
    const values = rows.map(r => Prisma.sql`(${createId()}, ${r.key}, ${r.size}, ${r.lastChanged}, ${r.category}, ${r.trdrId}, ${startedAt}, NOW(), NOW())`)
    await prisma.$executeRaw`
      INSERT INTO "FileIndexEntry" ("id", "key", "size", "lastChanged", "category", "trdrId", "seenAt", "createdAt", "updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("key") DO UPDATE SET
        "size" = EXCLUDED."size", "lastChanged" = EXCLUDED."lastChanged", "category" = EXCLUDED."category",
        "trdrId" = EXCLUDED."trdrId", "seenAt" = EXCLUDED."seenAt", "missingAt" = NULL, "updatedAt" = NOW()`
  }

  while (queue.length) {
    const dirs = queue.splice(0, 8)
    const listings = await Promise.all(dirs.map(d => bunnyList(d).then(e => ({ d, e })).catch(() => ({ d, e: [] }))))
    for (const { d, e } of listings) {
      for (const it of e) {
        const rel = d ? `${d.replace(/\/+$/, '')}/${it.objectName}` : it.objectName
        if (it.isDirectory) { queue.push(rel); continue }
        if (it.objectName === '.keep') continue
        const cls = classifyKey(rel, resolver)
        batch.push({ key: rel, size: it.length, lastChanged: parseBunnyDate(it.lastChanged), ...cls })
        scanned++
        if (batch.length >= 200) await flush()
      }
    }
    opts.onProgress?.(scanned)
  }
  await flush()
  // Ό,τι δεν εμφανίστηκε σε αυτή τη σάρωση έχει σβηστεί από την αποθήκη.
  const missing = await prisma.fileIndexEntry.updateMany({ where: { seenAt: { lt: startedAt }, missingAt: null }, data: { missingAt: startedAt } })
  return { scanned, missing: missing.count }
}

// ── 2. Backup νέων/αλλαγμένων ───────────────────────────────────────────────

function nasLocation(rootPath: string, key: string): { dir: string; name: string } {
  const i = key.lastIndexOf('/')
  return { dir: `${rootPath}${i > 0 ? `/${key.slice(0, i)}` : ''}`, name: key.slice(i + 1) }
}

export async function backupPending(opts: { budgetMs?: number } = {}): Promise<{ uploaded: number; bytes: number; failed: number; pending: number }> {
  const cfg = await getSynologyConfig()
  if (!cfg) throw new Error('Δεν έχει ρυθμιστεί το Synology NAS (Ρυθμίσεις → Διασυνδέσεις).')
  const deadline = Date.now() + (opts.budgetMs ?? DEFAULT_BUDGET_MS)
  const client = new SynologyClient(cfg)
  await client.login()
  // Ο φάκελος backup δημιουργείται αν δεν υπάρχει (μέσα στον κοινόχρηστο).
  await client.ensureFolder(cfg.rootPath)
  let uploaded = 0, bytes = 0, failed = 0
  try {
    // Νέα (ποτέ backup) ή αλλαγμένα από το τελευταίο backup — ταξινόμηση: μικρότερα πρώτα.
    const pendingWhere = {
      missingAt: null,
      nasAttempts: { lt: MAX_ATTEMPTS },
      OR: [{ nasBackedUpAt: null }, { nasSourceChanged: null }],
    }
    const changed = await prisma.$queryRaw<{ id: string }[]>`
      SELECT id FROM "FileIndexEntry"
      WHERE "missingAt" IS NULL AND "nasAttempts" < ${MAX_ATTEMPTS} AND "nasBackedUpAt" IS NOT NULL
        AND ("nasSourceChanged" IS DISTINCT FROM "lastChanged" OR "nasSize" IS DISTINCT FROM "size")`
    const fresh = await prisma.fileIndexEntry.findMany({ where: pendingWhere, select: { id: true }, orderBy: { size: 'asc' } })
    const ids = [...fresh.map(f => f.id), ...changed.map(c => c.id)]
    const rows = ids.length
      ? await prisma.fileIndexEntry.findMany({ where: { id: { in: ids } }, select: { id: true, key: true, size: true, lastChanged: true }, orderBy: { size: 'asc' } })
      : []
    let idx = 0
    const worker = async () => {
      while (idx < rows.length && Date.now() < deadline) {
        const row = rows[idx++]
        try {
          const body = await bunnyDownload(row.key)
          const { dir, name } = nasLocation(cfg.rootPath, row.key)
          await client.upload(dir, name, body)
          await prisma.fileIndexEntry.update({
            where: { id: row.id },
            data: { nasBackedUpAt: new Date(), nasSize: body.length, nasSourceChanged: row.lastChanged, nasError: null, nasAttempts: 0 },
          })
          uploaded++
          bytes += body.length
        } catch (err) {
          failed++
          await prisma.fileIndexEntry.update({
            where: { id: row.id },
            data: { nasError: (err instanceof Error ? err.message : String(err)).slice(0, 400), nasAttempts: { increment: 1 } },
          }).catch(() => {})
          // Χάθηκε η σύνδεση με το NAS → σταμάτα (θα συνεχίσει στην επόμενη εκτέλεση).
          if (err instanceof Error && /σύνδεση με το NAS|συνεδρία/i.test(err.message)) { idx = rows.length; break }
        }
      }
    }
    await Promise.all(Array.from({ length: CONCURRENCY }, worker))
    const pending = Math.max(0, rows.length - uploaded - failed)
    return { uploaded, bytes, failed, pending }
  } finally {
    await client.logout()
  }
}

// ── 3. Εκτέλεση με κλείδωμα & ιστορικό ───────────────────────────────────────

export async function runNasBackup(opts: { trigger: 'cron' | 'manual'; userId?: string | null; budgetMs?: number; skipScan?: boolean }): Promise<{ runId: string | null; skipped?: string }> {
  const cfg = await getSynologyConfig()
  // Παράλειψη του νυχτερινού → γράφεται στο ιστορικό, ώστε να φαίνεται ότι ΔΕΝ έγινε backup και γιατί.
  const skip = async (reason: string) => {
    if (opts.trigger === 'cron') {
      await prisma.nasBackupRun.create({ data: { trigger: 'cron', status: 'SKIPPED', finishedAt: new Date(), message: reason } })
    }
    return { runId: null, skipped: reason }
  }
  if (!cfg) return skip('Δεν έγινε backup: δεν έχουν αποθηκευτεί στοιχεία σύνδεσης Synology (Ρυθμίσεις → Διασυνδέσεις → Synology NAS).')
  if (opts.trigger === 'cron' && !cfg.enabled) return skip('Δεν έγινε backup: το νυχτερινό backup είναι απενεργοποιημένο.')
  const running = await prisma.nasBackupRun.findFirst({ where: { status: 'RUNNING', startedAt: { gt: new Date(Date.now() - 3 * 3600_000) } }, select: { id: true } })
  if (running) return { runId: running.id, skipped: 'Τρέχει ήδη backup.' }

  const run = await prisma.nasBackupRun.create({ data: { trigger: opts.trigger, triggeredById: opts.userId ?? null }, select: { id: true } })
  try {
    const scanned = opts.skipScan
      ? await prisma.fileIndexEntry.count({ where: { missingAt: null } })
      : (await scanStorage({
          onProgress: n => { void prisma.nasBackupRun.update({ where: { id: run.id }, data: { scanned: n } }).catch(() => {}) },
        })).scanned
    await prisma.nasBackupRun.update({ where: { id: run.id }, data: { scanned } })
    // Ευρετήριο αναζήτησης (μετά τη σάρωση) — μη κρίσιμο για το backup.
    if (!opts.skipScan) {
      const { reindexDocuments } = await import('@/lib/search/documents')
      await reindexDocuments().catch(err => console.error('[search] reindex failed', err))
    }
    const r = await backupPending({ budgetMs: opts.budgetMs })
    await prisma.nasBackupRun.update({
      where: { id: run.id },
      data: {
        status: r.failed ? 'PARTIAL' : 'OK',
        finishedAt: new Date(),
        uploaded: r.uploaded,
        uploadedBytes: BigInt(r.bytes),
        failed: r.failed,
        pending: r.pending,
        message: r.pending ? `Συνεχίζει στην επόμενη εκτέλεση (${r.pending} αρχεία).` : null,
      },
    })
  } catch (err) {
    await prisma.nasBackupRun.update({
      where: { id: run.id },
      data: { status: 'ERROR', finishedAt: new Date(), message: (err instanceof Error ? err.message : String(err)).slice(0, 500) },
    })
  }
  return { runId: run.id }
}

/** Επαναφορά αρχείου από το NAS στην αποθήκη (π.χ. όταν σβήστηκε κατά λάθος). */
export async function restoreFromNas(key: string): Promise<void> {
  const cfg = await getSynologyConfig()
  if (!cfg) throw new Error('Δεν έχει ρυθμιστεί το Synology NAS.')
  const client = new SynologyClient(cfg)
  try {
    await client.login()
    const { dir, name } = nasLocation(cfg.rootPath, key)
    const body = await client.download(`${dir}/${name}`)
    await bunnyUploadPrivate({ key, body })
    await prisma.fileIndexEntry.update({ where: { key }, data: { missingAt: null, seenAt: new Date() } }).catch(() => {})
  } finally {
    await client.logout()
  }
}
