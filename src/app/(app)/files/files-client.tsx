'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import {
  HardDrive, Files, PieChart, Eye, Download, RotateCcw, LoaderCircle, CloudUpload, CheckCircle2, AlertTriangle,
  Clock3, Ghost, Settings2, Sparkles, RefreshCw,
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'
import { FileViewerModal, type ViewerFile } from '@/components/ui/file-viewer-modal'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/relative-time'
import { startNasBackupNow, restoreFileFromNas, listBackupRuns, type BackupRunRow } from './actions'
import { refreshSearchIndexAction } from '@/lib/search/actions'
import { DocumentSearch } from '@/components/search/document-search'

export type FileRow = {
  key: string
  name: string
  folder: string
  size: number
  lastChanged: string
  category: string
  trdrId: string | null
  trdrName: string | null
  /** OK = υπάρχει ενημερωμένο αντίγραφο στο NAS · PENDING = νέο/αλλαγμένο · ERROR · MISSING(_SAVED) = σβήστηκε από την αποθήκη */
  backup: 'OK' | 'PENDING' | 'ERROR' | 'MISSING' | 'MISSING_SAVED'
  nasBackedUpAt: string | null
  nasError: string | null
  orphan: boolean
}

const ALL = '__all__'

export function formatBytes(b: number): string {
  if (b < 1024) return `${b} B`
  if (b < 1024 ** 2) return `${(b / 1024).toFixed(1)} KB`
  if (b < 1024 ** 3) return `${(b / 1024 ** 2).toFixed(1)} MB`
  return `${(b / 1024 ** 3).toFixed(2)} GB`
}

const BACKUP_BADGE: Record<FileRow['backup'], { label: string; cls: string; icon: React.ComponentType<{ className?: string }> }> = {
  OK: { label: 'Στο NAS', cls: 'ok', icon: CheckCircle2 },
  PENDING: { label: 'Εκκρεμεί', cls: 'warn', icon: Clock3 },
  ERROR: { label: 'Σφάλμα', cls: 'danger', icon: AlertTriangle },
  MISSING_SAVED: { label: 'Σβήστηκε · υπάρχει στο NAS', cls: 'info', icon: RotateCcw },
  MISSING: { label: 'Σβήστηκε', cls: 'muted', icon: Ghost },
}

export function FilesClient({
  rows, runs: initialRuns, categoryLabels, nas,
}: {
  rows: FileRow[]
  runs: BackupRunRow[]
  categoryLabels: Record<string, string>
  nas: { baseUrl: string; rootPath: string; enabled: boolean } | null
}) {
  const router = useRouter()
  const [tab, setTab] = React.useState<'search' | 'files' | 'backup' | 'space'>('search')
  const [reindexing, startReindex] = React.useTransition()
  const [category, setCategory] = React.useState(ALL)
  const [backup, setBackup] = React.useState(ALL)
  const [customer, setCustomer] = React.useState<string | null>(null)
  const [viewer, setViewer] = React.useState<ViewerFile | null>(null)
  const [runs, setRuns] = React.useState(initialRuns)
  const [starting, startTransition] = React.useTransition()
  const [restoring, setRestoring] = React.useState<string | null>(null)

  const running = runs.some(r => r.status === 'RUNNING')
  // Όσο τρέχει backup → ανανέωση προόδου κάθε 4″.
  React.useEffect(() => {
    if (!running) return
    const t = setInterval(() => {
      listBackupRuns().then(r => {
        setRuns(r)
        if (!r.some(x => x.status === 'RUNNING')) router.refresh()
      }).catch(() => {})
    }, 4000)
    return () => clearInterval(t)
  }, [running, router])

  const live = rows.filter(r => !r.backup.startsWith('MISSING'))
  const totalSize = live.reduce((a, r) => a + r.size, 0)
  const onNas = live.filter(r => r.backup === 'OK').length
  const pendingCount = live.filter(r => r.backup === 'PENDING' || r.backup === 'ERROR').length
  const lastOk = runs.find(r => r.status === 'OK' || r.status === 'PARTIAL')

  const customerOptions: ComboboxOption[] = React.useMemo(() => {
    const m = new Map<string, { name: string; n: number }>()
    for (const r of rows) if (r.trdrId) m.set(r.trdrId, { name: r.trdrName ?? r.trdrId, n: (m.get(r.trdrId)?.n ?? 0) + 1 })
    return [...m.entries()].map(([value, v]) => ({ value, label: v.name, hint: `${v.n} αρχεία` })).sort((a, b) => a.label.localeCompare(b.label, 'el'))
  }, [rows])

  const filtered = rows.filter(r =>
    (category === ALL || r.category === category) &&
    (customer == null || r.trdrId === customer) &&
    (backup === ALL || (backup === 'ORPHAN' ? r.orphan : backup === 'MISSING' ? r.backup.startsWith('MISSING') : r.backup === backup)),
  )

  async function restore(key: string) {
    setRestoring(key)
    const r = await restoreFileFromNas(key)
    setRestoring(null)
    if (r.ok) { toast.success(r.message); router.refresh() } else toast.error(r.message)
  }

  const dl = (key: string, inline = false) => `/api/files/download?key=${encodeURIComponent(key)}${inline ? '&disp=inline' : ''}`

  const columns: DataTableColumn<FileRow>[] = [
    {
      id: 'name', header: 'Αρχείο', width: 300, enableHide: false, sortValue: r => r.name, searchValue: r => `${r.name} ${r.folder}`,
      cell: r => (
        <div className="min-w-0">
          <div className="truncate font-semibold" title={r.name}>{r.name}</div>
          <div className="truncate text-[length:var(--fs-11)] text-muted-foreground" title={r.folder}>{r.folder}</div>
        </div>
      ),
    },
    {
      id: 'customer', header: 'Πελάτης', width: 200, sortValue: r => r.trdrName ?? '',
      cell: r => r.trdrId
        ? <Link href={`/partners/${r.trdrId}`} className="truncate font-medium text-primary hover:underline" title={r.trdrName ?? ''}>{r.trdrName ?? '—'}</Link>
        : <span className="text-muted-foreground">—</span>,
    },
    { id: 'category', header: 'Κατηγορία', width: 150, sortValue: r => categoryLabels[r.category] ?? r.category, cell: r => <span className="badge-pill muted" style={{ textTransform: 'none' }}>{categoryLabels[r.category] ?? r.category}</span> },
    { id: 'size', header: 'Μέγεθος', width: 90, align: 'right', sortValue: r => r.size, cell: r => <span className="tabular-nums">{formatBytes(r.size)}</span> },
    { id: 'changed', header: 'Τελ. αλλαγή', width: 120, sortValue: r => r.lastChanged, cell: r => <span title={new Date(r.lastChanged).toLocaleString('el-GR')}>{relativeTime(r.lastChanged)}</span> },
    {
      id: 'backup', header: 'Backup', width: 170, sortValue: r => r.backup,
      cell: r => {
        const b = BACKUP_BADGE[r.backup]
        return (
          <span className="flex flex-wrap items-center gap-1">
            <span className={cn('badge-pill', b.cls)} style={{ textTransform: 'none' }} title={r.nasError ?? (r.nasBackedUpAt ? `NAS: ${new Date(r.nasBackedUpAt).toLocaleString('el-GR')}` : undefined)}>
              <b.icon className="size-3" /> {b.label}
            </span>
            {r.orphan && <span className="badge-pill warn" style={{ textTransform: 'none' }} title="Δεν αντιστοιχεί σε καμία εγγραφή — υποψήφιο για καθαρισμό">ορφανό</span>}
          </span>
        )
      },
    },
    {
      id: 'actions', header: '⋯', headerLabel: 'Ενέργειες', width: 120, align: 'right', enableHide: false, enableResize: false,
      cell: r => (
        <span className="inline-flex items-center gap-0.5">
          {!r.backup.startsWith('MISSING') && (
            <>
              <button type="button" className="rowmenu-btn" title="Προβολή" aria-label={`Προβολή ${r.name}`} onClick={() => setViewer({ name: r.name, url: dl(r.key, true) })}><Eye className="size-3.5" /></button>
              <a className="rowmenu-btn" href={dl(r.key)} title="Λήψη" aria-label={`Λήψη ${r.name}`}><Download className="size-3.5" /></a>
            </>
          )}
          {r.backup === 'MISSING_SAVED' && (
            <button type="button" className="rowmenu-btn" title="Επαναφορά από NAS" aria-label={`Επαναφορά ${r.name}`} disabled={restoring === r.key} onClick={() => restore(r.key)}>
              {restoring === r.key ? <LoaderCircle className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />}
            </button>
          )}
        </span>
      ),
    },
  ]

  const runningRun = runs.find(r => r.status === 'RUNNING')

  return (
    <div className="flex flex-col gap-3">
      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Αρχεία" value={live.length.toLocaleString('el-GR')} hint={formatBytes(totalSize)} />
        <Kpi label="Στο NAS" value={`${live.length ? Math.round((onNas / live.length) * 100) : 0}%`} hint={`${onNas.toLocaleString('el-GR')} αρχεία`} tone={onNas === live.length && live.length ? 'ok' : undefined} />
        <Kpi label="Εκκρεμούν" value={pendingCount.toLocaleString('el-GR')} hint="νέα ή αλλαγμένα" tone={pendingCount ? 'warn' : 'ok'} />
        <Kpi label="Τελευταίο backup" value={lastOk ? relativeTime(lastOk.finishedAt ?? lastOk.startedAt) : '—'} hint={nas ? (nas.enabled ? 'νυχτερινό 02:00' : 'νυχτερινό ανενεργό') : 'NAS μη ρυθμισμένο'} tone={nas ? undefined : 'warn'} />
      </div>

      {/* Tabs */}
      <div className="glass flex flex-wrap items-center gap-1 rounded-full p-1">
        {([['search', 'Αναζήτηση', Sparkles], ['files', 'Αρχεία', Files], ['backup', 'Backup στο NAS', HardDrive], ['space', 'Χώρος & καθαρισμός', PieChart]] as const).map(([k, label, Icon]) => (
          <button key={k} type="button" onClick={() => setTab(k)} className={cn('inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[length:var(--fs-12-5)] font-semibold', tab === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
            <Icon className="size-3.5" /> {label}
          </button>
        ))}
      </div>

      {tab === 'search' && (
        <>
          <DocumentSearch categoryLabels={categoryLabels} autoFocus />
          <div className="flex justify-end">
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={reindexing}
              onClick={() => startReindex(async () => {
                const r = await refreshSearchIndexAction()
                if (r.ok) { toast.success(r.message); router.refresh() } else toast.error(r.message)
              })}
            >
              {reindexing ? <LoaderCircle className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Ανανέωση ευρετηρίου
            </Button>
          </div>
        </>
      )}

      {tab === 'files' && (
        <DataTable
          tableId="files-index"
          columns={columns}
          rows={filtered}
          rowKey={r => r.key}
          initialSort={{ columnId: 'changed', dir: 'desc' }}
          searchPlaceholder="Αναζήτηση αρχείου…"
          emptyMessage={rows.length ? 'Κανένα αρχείο με αυτά τα φίλτρα.' : 'Το ευρετήριο είναι κενό — πάτησε «Backup τώρα» στην καρτέλα Backup για σάρωση.'}
          toolbarExtras={
            <div className="flex flex-wrap items-center gap-2">
              <Select value={category} onValueChange={v => setCategory(v ?? ALL)}>
                <SelectTrigger className="h-8 min-w-40 rounded-full text-[length:var(--fs-12)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Όλες οι κατηγορίες</SelectItem>
                  {Object.entries(categoryLabels).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}
                </SelectContent>
              </Select>
              <Select value={backup} onValueChange={v => setBackup(v ?? ALL)}>
                <SelectTrigger className="h-8 min-w-36 rounded-full text-[length:var(--fs-12)]"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value={ALL}>Όλα (backup)</SelectItem>
                  <SelectItem value="OK">Στο NAS</SelectItem>
                  <SelectItem value="PENDING">Εκκρεμούν</SelectItem>
                  <SelectItem value="ERROR">Με σφάλμα</SelectItem>
                  <SelectItem value="MISSING">Σβήστηκαν από την αποθήκη</SelectItem>
                  <SelectItem value="ORPHAN">Ορφανά</SelectItem>
                </SelectContent>
              </Select>
              <Combobox options={customerOptions} value={customer} onChange={setCustomer} placeholder="Όλοι οι πελάτες" className="w-56" ariaLabel="Φίλτρο πελάτη" />
            </div>
          }
          footer={<span className="text-[length:var(--fs-11-5)] text-muted-foreground">{filtered.length.toLocaleString('el-GR')} αρχεία · {formatBytes(filtered.reduce((a, r) => a + r.size, 0))}</span>}
        />
      )}

      {tab === 'backup' && (
        <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="text-[length:var(--fs-12-5)]">
              {nas
                ? <>Προορισμός: <b>{nas.baseUrl}</b> → <b>{nas.rootPath}</b> · νυχτερινό incremental 02:00 {nas.enabled ? '(ενεργό)' : '(ανενεργό)'}</>
                : <span className="text-[color:var(--warning)]">Δεν έχει ρυθμιστεί NAS — Ρυθμίσεις → Διασυνδέσεις → «Synology NAS».</span>}
            </div>
            <div className="flex items-center gap-2">
              <Button type="button" variant="outline" nativeButton={false} render={<Link href="/settings?tab=integrations" />}>
                <Settings2 className="size-3.5" /> Ρυθμίσεις NAS
              </Button>
              <Button
                type="button"
                disabled={!nas || running || starting}
                onClick={() => startTransition(async () => {
                  const r = await startNasBackupNow()
                  if (r.ok) { toast.success(r.message); setRuns(await listBackupRuns()) } else toast.warning(r.message)
                })}
              >
                {running || starting ? <LoaderCircle className="size-3.5 animate-spin" /> : <CloudUpload className="size-3.5" />}
                {running ? 'Backup σε εξέλιξη…' : 'Backup τώρα'}
              </Button>
            </div>
          </div>
          {runningRun && (
            <div className="rounded-xl border border-border bg-muted/40 px-3 py-2 text-[length:var(--fs-12)]">
              <LoaderCircle className="mr-1.5 inline size-3.5 animate-spin text-primary" />
              Σάρωση αποθήκης: <b className="tabular-nums">{runningRun.scanned.toLocaleString('el-GR')}</b> αρχεία… (μετά ανεβαίνουν στο NAS μόνο τα νέα/αλλαγμένα)
            </div>
          )}
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-[length:var(--fs-12)]">
              <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                <tr><th className="px-3 py-2">Έναρξη</th><th className="px-3 py-2">Τύπος</th><th className="px-3 py-2">Κατάσταση</th><th className="px-3 py-2 text-right">Σαρώθηκαν</th><th className="px-3 py-2 text-right">Ανέβηκαν</th><th className="px-3 py-2 text-right">Όγκος</th><th className="px-3 py-2 text-right">Σφάλματα</th><th className="px-3 py-2">Σημείωση</th></tr>
              </thead>
              <tbody>
                {runs.map(r => (
                  <tr key={r.id} className="border-t border-border">
                    <td className="px-3 py-1.5" title={new Date(r.startedAt).toLocaleString('el-GR')}>{relativeTime(r.startedAt)}</td>
                    <td className="px-3 py-1.5">{r.trigger === 'cron' ? 'Νυχτερινό' : 'Χειροκίνητο'}</td>
                    <td className="px-3 py-1.5"><span className={cn('badge-pill', r.status === 'OK' ? 'ok' : r.status === 'RUNNING' ? 'info' : r.status === 'PARTIAL' || r.status === 'SKIPPED' ? 'warn' : 'danger')}>{r.status === 'OK' ? 'Επιτυχία' : r.status === 'RUNNING' ? 'Σε εξέλιξη' : r.status === 'PARTIAL' ? 'Μερικό' : r.status === 'SKIPPED' ? 'Δεν έγινε' : 'Σφάλμα'}</span></td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.scanned.toLocaleString('el-GR')}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.uploaded.toLocaleString('el-GR')}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{formatBytes(r.uploadedBytes)}</td>
                    <td className="px-3 py-1.5 text-right tabular-nums">{r.failed || '—'}</td>
                    <td className="px-3 py-1.5 text-muted-foreground">{r.message ?? (r.pending ? `${r.pending} σε αναμονή` : '')}</td>
                  </tr>
                ))}
                {runs.length === 0 && <tr><td colSpan={8} className="px-3 py-6 text-center text-muted-foreground">Δεν έχει γίνει ακόμα backup.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {tab === 'space' && <SpaceTab rows={rows} categoryLabels={categoryLabels} onShowOrphans={() => { setBackup('ORPHAN'); setCategory(ALL); setCustomer(null); setTab('files') }} />}

      <FileViewerModal open={!!viewer} onOpenChange={o => { if (!o) setViewer(null) }} file={viewer} />
    </div>
  )
}

function Kpi({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: 'ok' | 'warn' }) {
  return (
    <div className="glass rounded-[18px] px-4 py-3">
      <div className="text-[length:var(--fs-11)] font-bold tracking-wide text-muted-foreground uppercase">{label}</div>
      <div className={cn('text-[length:var(--fs-22)] font-bold tabular-nums', tone === 'ok' && 'text-[color:var(--success)]', tone === 'warn' && 'text-[color:var(--warning)]')}>{value}</div>
      {hint && <div className="text-[length:var(--fs-11-5)] text-muted-foreground">{hint}</div>}
    </div>
  )
}

function SpaceTab({ rows, categoryLabels, onShowOrphans }: { rows: FileRow[]; categoryLabels: Record<string, string>; onShowOrphans: () => void }) {
  const live = rows.filter(r => !r.backup.startsWith('MISSING'))
  const total = live.reduce((a, r) => a + r.size, 0) || 1
  const byCat = Object.entries(live.reduce<Record<string, { n: number; size: number }>>((m, r) => {
    m[r.category] = { n: (m[r.category]?.n ?? 0) + 1, size: (m[r.category]?.size ?? 0) + r.size }
    return m
  }, {})).sort((a, b) => b[1].size - a[1].size)
  const byCustomer = Object.values(live.filter(r => r.trdrId).reduce<Record<string, { id: string; name: string; n: number; size: number }>>((m, r) => {
    const k = r.trdrId!
    m[k] = { id: k, name: r.trdrName ?? k, n: (m[k]?.n ?? 0) + 1, size: (m[k]?.size ?? 0) + r.size }
    return m
  }, {})).sort((a, b) => b.size - a.size).slice(0, 20)
  const orphans = live.filter(r => r.orphan)
  const orphanSize = orphans.reduce((a, r) => a + r.size, 0)

  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <section className="glass rounded-[22px] p-4">
        <h3 className="mb-2 text-[length:var(--fs-13)] font-bold">Χώρος ανά κατηγορία</h3>
        <ul className="flex flex-col gap-2">
          {byCat.map(([k, v]) => (
            <li key={k} className="text-[length:var(--fs-12)]">
              <div className="flex justify-between gap-2"><span className="font-semibold">{categoryLabels[k] ?? k}</span><span className="tabular-nums text-muted-foreground">{v.n} · {formatBytes(v.size)}</span></div>
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-primary" style={{ width: `${Math.max(1, (v.size / total) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      </section>
      <section className="glass rounded-[22px] p-4">
        <h3 className="mb-2 text-[length:var(--fs-13)] font-bold">Μεγαλύτεροι πελάτες σε χώρο</h3>
        <ul className="flex flex-col gap-1.5 text-[length:var(--fs-12)]">
          {byCustomer.map(c => (
            <li key={c.id} className="flex items-center justify-between gap-2">
              <Link href={`/partners/${c.id}`} className="min-w-0 truncate font-semibold text-primary hover:underline">{c.name}</Link>
              <span className="shrink-0 tabular-nums text-muted-foreground">{c.n} αρχεία · {formatBytes(c.size)}</span>
            </li>
          ))}
          {byCustomer.length === 0 && <li className="text-muted-foreground">Κανένα αρχείο πελάτη.</li>}
        </ul>
      </section>
      <section className="glass rounded-[22px] p-4 lg:col-span-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="text-[length:var(--fs-13)] font-bold">Ορφανά αρχεία</h3>
            <p className="text-[length:var(--fs-12)] text-muted-foreground">
              Αρχεία συστήματος που δεν αντιστοιχούν σε καμία εγγραφή (π.χ. από διαγραμμένα δικαιολογητικά/δαπάνες): <b className="text-foreground">{orphans.length}</b> αρχεία, <b className="text-foreground">{formatBytes(orphanSize)}</b>. Ελέγξτε τα πριν από κάθε καθαρισμό — υπάρχουν και στο NAS.
            </p>
          </div>
          <Button type="button" variant="outline" onClick={onShowOrphans} disabled={!orphans.length}><Ghost className="size-3.5" /> Προβολή ορφανών</Button>
        </div>
      </section>
    </div>
  )
}
