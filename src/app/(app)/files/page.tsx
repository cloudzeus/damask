import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { PageHeader } from '@/components/ui/page-header'
import { getSynologyConfig } from '@/lib/nas/synology'
import { CATEGORY_LABELS } from '@/lib/nas/backup'
import { getIntegration } from '@/lib/settings'
import { listBackupRuns } from './actions'
import { FilesClient, type FileRow } from './files-client'

/** Κατηγορίες «συστήματος» όπου κάθε αρχείο πρέπει να αντιστοιχεί σε εγγραφή της βάσης. */
const ORPHAN_CATEGORIES = new Set(['dossier', 'project', 'quote', 'tax', 'request', 'template', 'db-backup', 'gemi', 'media'])

export default async function FilesPage() {
  await requirePermission('files.manage')

  const [entries, cfg, runs, bunny] = await Promise.all([
    prisma.fileIndexEntry.findMany({ orderBy: { lastChanged: 'desc' }, take: 20_000 }),
    getSynologyConfig(),
    listBackupRuns(),
    getIntegration<{ pullZoneUrl?: string }>('bunny'),
  ])

  const trdrIds = [...new Set(entries.map(e => e.trdrId).filter((x): x is string => !!x))]
  const trdrs = trdrIds.length ? await prisma.trdr.findMany({ where: { id: { in: trdrIds } }, select: { id: true, NAME: true } }) : []
  const nameOf = new Map(trdrs.map(t => [t.id, t.NAME]))

  // Αναφορές από τη βάση → ό,τι λείπει από αυτές είναι «ορφανό» (υποψήφιο για καθαρισμό).
  const [dossier, appDocs, deliv, gemi, records, quotes, reqItems, dbb, tpls, media] = await Promise.all([
    prisma.trdrDossierDocument.findMany({ select: { storageKey: true } }),
    prisma.applicationDocument.findMany({ select: { storageKey: true } }),
    prisma.deliverableFile.findMany({ select: { storageKey: true } }),
    prisma.trdrDocument.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true } }),
    prisma.trdrFormRecord.findMany({ select: { storageKey: true } }),
    prisma.programExpense.findMany({ where: { quoteStorageKey: { not: null } }, select: { quoteStorageKey: true } }),
    prisma.fileRequestItem.findMany({ where: { fileKey: { not: null } }, select: { fileKey: true } }),
    prisma.dbBackup.findMany({ select: { storageKey: true } }),
    prisma.taxFormTemplate.findMany({ where: { sampleStorageKey: { not: null } }, select: { sampleStorageKey: true } }),
    prisma.mediaAsset.findMany({ select: { cdnUrl: true } }),
  ])
  const pull = (bunny.pullZoneUrl ?? '').replace(/\/+$/, '')
  const referenced = new Set<string>([
    ...dossier.map(d => d.storageKey), ...appDocs.map(d => d.storageKey), ...deliv.map(d => d.storageKey),
    ...gemi.map(d => d.storageKey!), ...records.map(d => d.storageKey), ...quotes.map(d => d.quoteStorageKey!),
    ...reqItems.map(d => d.fileKey!), ...dbb.map(d => d.storageKey), ...tpls.map(d => d.sampleStorageKey!),
    ...media.map(m => decodeURIComponent((pull && m.cdnUrl.startsWith(pull) ? m.cdnUrl.slice(pull.length) : new URL(m.cdnUrl, 'https://x').pathname).replace(/^\/+/, ''))),
  ])

  const rows: FileRow[] = entries.map(e => {
    const isOrphan = ORPHAN_CATEGORIES.has(e.category) && !referenced.has(e.key) && !e.missingAt
    const backup: FileRow['backup'] = e.missingAt
      ? (e.nasBackedUpAt ? 'MISSING_SAVED' : 'MISSING')
      : e.nasError && !e.nasBackedUpAt ? 'ERROR'
        : e.nasBackedUpAt && e.nasSourceChanged?.getTime() === e.lastChanged.getTime() && e.nasSize === e.size ? 'OK'
          : 'PENDING'
    return {
      key: e.key,
      name: e.key.split('/').pop() ?? e.key,
      folder: e.key.split('/').slice(0, -1).join('/'),
      size: e.size,
      lastChanged: e.lastChanged.toISOString(),
      category: e.category,
      trdrId: e.trdrId,
      trdrName: e.trdrId ? (nameOf.get(e.trdrId) ?? null) : null,
      backup,
      nasBackedUpAt: e.nasBackedUpAt?.toISOString() ?? null,
      nasError: e.nasError,
      orphan: isOrphan,
    }
  })

  return (
    <div>
      <PageHeader breadcrumb={<>Διαχείριση <span aria-hidden>›</span></>} title="Αρχεία & Backup" subtitle="Όλα τα αρχεία της εφαρμογής, χώρος και αντίγραφα ασφαλείας στο Synology NAS" />
      <FilesClient
        rows={rows}
        runs={runs}
        categoryLabels={CATEGORY_LABELS}
        nas={cfg ? { baseUrl: cfg.baseUrl, rootPath: cfg.rootPath, enabled: cfg.enabled } : null}
      />
    </div>
  )
}
