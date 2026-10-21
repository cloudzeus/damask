'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { toast } from 'sonner'
import {
  LuBuilding2, LuEllipsisVertical, LuArrowRight, LuCircleCheck, LuEye, LuTriangleAlert, LuListTodo, LuCalendarClock,
  LuWallet, LuFileCheck, LuLayoutGrid, LuReceipt, LuFolderCheck, LuUsers, LuLoaderCircle, LuChartGantt,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { setApplicationStage, type ApplicationDetail } from '@/lib/pm/actions'
import { STAGE_ORDER, stageLabel, type StageStr } from '@/lib/pm/types'
import { getImplementationOverview } from '@/lib/pm/impl-overview'
import type { ImplOverview, ImplTab, NextAction } from '@/lib/pm/impl-overview-core'
import { AssignApplicationDialog } from './assign-application-dialog'
import { ObligationsTab } from './obligations-tab'
import { ExpensesTab } from './expenses-tab'
import { DeliverablesMatrixTab } from './deliverables-matrix-tab'
import { GanttView } from './gantt-view'
import { PaymentsTab } from './payments-tab'
import { DocumentRequestsTab } from './document-requests-tab'
import { FileRequestsReviewTab } from './file-requests-review-tab'
import { ApplicationContactsTab } from './application-contacts-tab'
import { PortalAccessDialog } from './portal-access-dialog'
import { FolderStatusDialog } from './folder-status-dialog'
import { EmailHistory } from '@/components/email/email-history'
import { ApprovalStrip } from './approval-dialog'

/**
 * Έργο ΕΓΚΡΙΤΙΚΟ (εγκρίθηκε εκτός εφαρμογής ή με καταχωρισμένη εγκριτική) — η εφαρμογή κάνει μόνο διαχείριση έργου.
 * Αντί για 12 καρτέλες/6 στάδια υποβολής: «Επισκόπηση» με ΜΙΑ λίστα «Τι να κάνετε τώρα» + 6 καρτέλες, μία δουλειά η
 * καθεμία, χωρίς επαναλήψεις: Δαπάνες & παραστατικά · Δικαιολογητικά · Φάκελος πιστοποίησης · Αποπληρωμές ·
 * Εργασίες · Επικοινωνία. Αξιολόγηση/ΟΠΣΚΕ/στάδια υποβολής δεν εμφανίζονται (η έγκριση = η εγκριτική στην κεφαλίδα).
 * Η πλήρης προβολή μένει από το ⋮ για ειδικές περιπτώσεις.
 */

const TABS: { key: ImplTab; label: string; icon: React.ComponentType<{ className?: string }>; hint: string }[] = [
  { key: 'overview', label: 'Επισκόπηση', icon: LuLayoutGrid, hint: 'Τι να κάνετε τώρα και πού βρίσκεται το έργο.' },
  { key: 'expenses', label: 'Δαπάνες & παραστατικά', icon: LuReceipt, hint: 'Εγκεκριμένες δαπάνες, τιμολόγια, πληρωμές, βεβαιώσεις, μισθοδοσία.' },
  { key: 'documents', label: 'Δικαιολογητικά', icon: LuFileCheck, hint: 'Τα έγγραφα της επιχείρησης που ζητά το πρόγραμμα.' },
  { key: 'folder', label: 'Φάκελος πιστοποίησης', icon: LuFolderCheck, hint: 'Τα έγγραφα ανά δαπάνη/φάση για τον έλεγχο της Διαχειριστικής Αρχής.' },
  { key: 'payments', label: 'Αποπληρωμές', icon: LuWallet, hint: 'Αιτήματα πληρωμής (δόσεις) της επιχορήγησης.' },
  { key: 'tasks', label: 'Εργασίες', icon: LuListTodo, hint: 'Εργασίες του γραφείου με προθεσμία και ανάθεση.' },
  { key: 'comm', label: 'Επικοινωνία', icon: LuUsers, hint: 'Επαφές, emails και αιτήματα εγγράφων προς τον πελάτη.' },
]

/** Παλιά ?tab= (από ειδοποιήσεις/συνδέσμους) → νέα καρτέλα. */
const LEGACY: Record<string, ImplTab> = {
  assessment: 'overview', filereq: 'documents', expenses: 'expenses', deliverables: 'folder', certification: 'folder', gantt: 'folder',
  opske: 'overview', payments: 'payments', obligations: 'tasks', docrequests: 'comm', contacts: 'comm', comm: 'comm',
}

export function ImplementationHub({ app, canSend, onShowFull }: { app: ApplicationDetail; canSend: boolean; onShowFull: () => void }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = React.useState<ImplTab>(() => {
    const t = searchParams.get('tab') ?? ''
    return (TABS.some(x => x.key === t) ? t : LEGACY[t]) as ImplTab ?? 'overview'
  })
  const [folderView, setFolderView] = React.useState<'matrix' | 'gantt'>(searchParams.get('tab') === 'gantt' ? 'gantt' : 'matrix')

  function go(next: ImplTab) {
    setTab(next)
    const url = new URL(window.location.href)
    url.searchParams.set('tab', next)
    window.history.replaceState(null, '', url)
  }

  async function changeStage(stage: StageStr) {
    const r = await setApplicationStage(app.id, stage).catch(() => null)
    if (!r?.ok) { toast.error(r?.message ?? 'Η αλλαγή σταδίου απέτυχε.'); return }
    toast.success(`Στάδιο: ${stageLabel(stage)}`)
    router.refresh()
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Κεφαλίδα: ποιος/ποιο πρόγραμμα + η ΜΙΑ εικόνα της έγκρισης (εγκριτική) + δευτερεύουσες ενέργειες στο ⋮ */}
      <div className="glass rounded-[22px] p-4">
        <nav aria-label="Διαδρομή" className="mb-2 flex flex-wrap items-center gap-1 text-[length:var(--fs-11-5)] text-muted-foreground">
          <Link href="/programs" className="hover:text-foreground hover:underline">Προγράμματα</Link>
          <span aria-hidden>›</span>
          <Link href={`/programs/${app.programId}`} className="hover:text-foreground hover:underline">{app.programTitle}</Link>
          <span aria-hidden>›</span>
          <b className="text-foreground">Έργο</b>
        </nav>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="flex items-center gap-2 text-[length:var(--fs-19)] font-bold">
              <LuBuilding2 className="size-4.5 shrink-0 text-muted-foreground" aria-hidden />
              <Link href={`/partners/${app.trdrId}`} className="hover:underline">{app.trdrName}</Link>
              <span className="badge-pill ok shrink-0"><LuCircleCheck className="size-3" aria-hidden /> Σε υλοποίηση</span>
            </h2>
            <p className="mt-0.5 text-[length:var(--fs-12-5)] text-muted-foreground">
              {app.programTitle}
              <span className="mx-1.5" aria-hidden>·</span>
              Διαχειριστής <b className="text-foreground">{app.managerName ?? '—'}</b>
              {app.processorName && <><span className="mx-1.5" aria-hidden>·</span>Διεκπεραιωτής <b className="text-foreground">{app.processorName}</b></>}
            </p>
          </div>
          <div className="flex items-center gap-2">
            <PortalAccessDialog applicationId={app.id} />
            {app.canManage && <AssignApplicationDialog app={{ id: app.id, managerId: app.managerId, processorId: app.processorId }} onAssigned={() => router.refresh()} />}
            <DropdownMenu>
              <DropdownMenuTrigger render={
                <button type="button" aria-label="Περισσότερες ενέργειες έργου" className="inline-flex size-10 cursor-pointer items-center justify-center rounded-full border border-border bg-card text-muted-foreground hover:text-foreground">
                  <LuEllipsisVertical className="size-4" aria-hidden />
                </button>
              } />
              <DropdownMenuContent align="end" className="min-w-60">
                <DropdownMenuItem onClick={onShowFull}>Πλήρης προβολή (όλες οι καρτέλες υποβολής)</DropdownMenuItem>
                {app.canManage && (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuLabel className="text-[length:var(--fs-11)]">Στάδιο (τρέχον: {stageLabel(app.stage)})</DropdownMenuLabel>
                    {STAGE_ORDER.filter(s => s !== app.stage && (s === 'INSPECTION' || s === 'MONITORING' || s === 'EXPENSES_DELIVERABLES')).map(s => (
                      <DropdownMenuItem key={s} onClick={() => void changeStage(s)}>Μετάβαση σε «{stageLabel(s)}»</DropdownMenuItem>
                    ))}
                  </>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
        {app.canManage && <ApprovalStrip applicationId={app.id} />}
      </div>

      {/* Καρτέλες: 7, η καθεμία μία δουλειά */}
      <nav aria-label="Ενότητες έργου" className="glass flex gap-1 overflow-x-auto rounded-[18px] p-1.5">
        {TABS.map(t => {
          const Icon = t.icon
          const active = tab === t.key
          return (
            <button key={t.key} type="button" onClick={() => go(t.key)} aria-current={active ? 'page' : undefined} title={t.hint}
              className={cn('inline-flex min-h-10 shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3.5 text-[length:var(--fs-13)] font-semibold whitespace-nowrap transition-colors',
                active ? 'bg-primary text-primary-foreground shadow-sm' : 'text-muted-foreground hover:bg-muted hover:text-foreground')}>
              <Icon className="size-4" aria-hidden /> {t.label}
            </button>
          )
        })}
      </nav>

      {tab === 'overview' && <OverviewPanel applicationId={app.id} onGo={go} />}
      {tab === 'expenses' && <ExpensesTab applicationId={app.id} programId={app.programId} stage={app.stage} trdrId={app.trdrId} approved />}
      {tab === 'documents' && (
        <div className="flex flex-col gap-4">
          <ObligationsTab
            applicationId={app.id} canManage={app.canManage} programId={app.programId} filterKind="FORM"
            title="Δικαιολογητικά της επιχείρησης" emptyMessage="Το πρόγραμμα δεν ζητά δικαιολογητικά." showBoardToggle={false} smartUploadTrdrId={app.trdrId}
          />
          <FileRequestsReviewTab applicationId={app.id} />
        </div>
      )}
      {tab === 'folder' && (
        <div className="flex flex-col gap-3">
          <div role="radiogroup" aria-label="Προβολή φακέλου" className="inline-flex self-start rounded-full border border-border bg-card p-0.5 text-[length:var(--fs-12-5)]">
            {([['matrix', 'Φάκελος', LuFolderCheck], ['gantt', 'Χρονοδιάγραμμα', LuChartGantt]] as const).map(([k, l, I]) => (
              <button key={k} type="button" role="radio" aria-checked={folderView === k} onClick={() => setFolderView(k)}
                className={cn('inline-flex min-h-9 cursor-pointer items-center gap-1.5 rounded-full px-3.5 font-semibold', folderView === k ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}>
                <I className="size-3.5" aria-hidden /> {l}
              </button>
            ))}
          </div>
          {folderView === 'matrix' ? <DeliverablesMatrixTab applicationId={app.id} programId={app.programId} /> : <GanttView applicationId={app.id} programId={app.programId} />}
        </div>
      )}
      {tab === 'payments' && <PaymentsTab applicationId={app.id} />}
      {tab === 'tasks' && (
        <ObligationsTab applicationId={app.id} canManage={app.canManage} programId={app.programId} title="Εργασίες"
          emptyMessage="Δεν υπάρχουν εργασίες. Προσθέστε με «+ Υποχρέωση»." excludeKinds={['FORM', 'DELIVERABLE', 'CRITERION']} />
      )}
      {tab === 'comm' && (
        <div className="flex flex-col gap-4">
          <ApplicationContactsTab applicationId={app.id} canManage={app.canManage} programId={app.programId} trdrId={app.trdrId} />
          <DocumentRequestsTab applicationId={app.id} />
          <EmailHistory trdrId={app.trdrId} programId={app.programId} applicationId={app.id} canSend={canSend} />
        </div>
      )}

      {/* Οδηγός φακέλου (AI) — διαθέσιμος, αλλά όχι ανταγωνιστικό κουμπί στην κεφαλίδα */}
      <div className="flex justify-end"><FolderStatusDialog applicationId={app.id} /></div>
    </div>
  )
}

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })

function OverviewPanel({ applicationId, onGo }: { applicationId: string; onGo: (t: ImplTab) => void }) {
  const [data, setData] = React.useState<ImplOverview | null>(null)
  const [error, setError] = React.useState(false)
  React.useEffect(() => {
    let alive = true
    getImplementationOverview(applicationId).then(d => { if (alive) setData(d) }).catch(() => { if (alive) setError(true) })
    return () => { alive = false }
  }, [applicationId])

  if (error) return <p className="glass rounded-[22px] p-4 text-[length:var(--fs-13)] text-muted-foreground">Η επισκόπηση δεν φόρτωσε — ανανεώστε τη σελίδα.</p>
  if (!data) return <div className="glass flex items-center gap-2 rounded-[22px] p-6 text-[length:var(--fs-13)] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>

  const [first, ...rest] = data.actions
  return (
    <div className="flex flex-col gap-4">
      {/* Πού βρίσκεται το έργο — 3 αριθμοί */}
      <div className="grid gap-3 sm:grid-cols-3">
        <Kpi label="Τεκμηριωμένες δαπάνες" value={`${data.approved.pct}%`} sub={`${EUR.format(data.approved.documented)} από ${EUR.format(data.approved.total)}`} bar={data.approved.pct} onClick={() => onGo('expenses')} />
        <Kpi label="Λήξη υλοποίησης" value={data.daysLeft == null ? '—' : data.daysLeft < 0 ? 'Έληξε' : `σε ${data.daysLeft} ημέρες`}
          sub={data.endsAt ? new Date(data.endsAt).toLocaleDateString('el-GR') : 'Καταχωρίστε την εγκριτική'} warn={data.daysLeft != null && data.daysLeft < 60} icon={LuCalendarClock} />
        <Kpi label="Αποπληρωμές" value={data.installments.total ? `${data.installments.paid}/${data.installments.total} πληρωμένες` : 'Καμία ακόμη'}
          sub={data.installments.inProgress ? `${data.installments.inProgress} σε εξέλιξη` : 'Νέα δόση από την καρτέλα «Αποπληρωμές»'} onClick={() => onGo('payments')} icon={LuWallet} />
      </div>

      {/* Τι να κάνετε τώρα — ΜΙΑ κύρια ενέργεια, τα υπόλοιπα από κάτω */}
      <section className="glass rounded-[22px] p-4" aria-labelledby="next-title">
        <h3 id="next-title" className="text-[length:var(--fs-14)] font-bold">Τι να κάνετε τώρα</h3>
        {!first ? (
          <p className="mt-2 flex items-center gap-2 rounded-xl bg-[color:var(--success)]/10 px-3 py-3 text-[length:var(--fs-13)] text-[color:var(--success)]">
            <LuCircleCheck className="size-4.5 shrink-0" aria-hidden /> Όλα είναι εντάξει — δεν εκκρεμεί τίποτα σε αυτό το έργο.
          </p>
        ) : (
          <>
            <button type="button" onClick={() => onGo(first.tab)}
              className={cn('mt-2.5 flex w-full cursor-pointer items-center gap-3 rounded-xl border p-3.5 text-left transition-colors', toneBox(first))}>
              <ToneIcon a={first} big />
              <span className="min-w-0 flex-1">
                <span className="block text-[length:var(--fs-14)] font-bold">{first.label} <span className="tabular-nums">({first.count})</span></span>
                <span className="block text-[length:var(--fs-12-5)] text-muted-foreground">{first.detail}</span>
              </span>
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-3.5 py-2 text-[length:var(--fs-12-5)] font-semibold text-primary-foreground">
                Άνοιγμα <LuArrowRight className="size-3.5" aria-hidden />
              </span>
            </button>
            {rest.length > 0 && (
              <ul className="mt-2 flex flex-col divide-y divide-border rounded-xl border border-border">
                {rest.map(a => (
                  <li key={a.key}>
                    <button type="button" onClick={() => onGo(a.tab)} className="flex w-full cursor-pointer items-center gap-3 px-3 py-2.5 text-left hover:bg-muted/60">
                      <ToneIcon a={a} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[length:var(--fs-13)] font-semibold">{a.label} <span className="tabular-nums text-muted-foreground">({a.count})</span></span>
                        <span className="block text-[length:var(--fs-12)] text-muted-foreground">{a.detail}</span>
                      </span>
                      <span className="shrink-0 text-[length:var(--fs-11-5)] text-muted-foreground">{TABS.find(t => t.key === a.tab)?.label} ›</span>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </section>
    </div>
  )
}

function toneBox(a: NextAction) {
  return a.tone === 'review' ? 'border-[color:var(--success)]/40 bg-[color:var(--success)]/8 hover:bg-[color:var(--success)]/12'
    : a.tone === 'missing' ? 'border-[color:var(--warning)]/40 bg-[color:var(--warning)]/8 hover:bg-[color:var(--warning)]/12'
      : 'border-border bg-card hover:bg-muted/60'
}

function ToneIcon({ a, big }: { a: NextAction; big?: boolean }) {
  const cls = cn(big ? 'size-5' : 'size-4', 'shrink-0')
  if (a.tone === 'review') return <LuEye className={cn(cls, 'text-[color:var(--success)]')} aria-label="Θέλει τον έλεγχό σας" />
  if (a.tone === 'missing') return <LuTriangleAlert className={cn(cls, 'text-[color:var(--warning)]')} aria-label="Λείπει" />
  return <LuListTodo className={cn(cls, 'text-muted-foreground')} aria-hidden />
}

function Kpi({ label, value, sub, bar, warn, icon: Icon, onClick }: { label: string; value: string; sub: string; bar?: number; warn?: boolean; icon?: React.ComponentType<{ className?: string }>; onClick?: () => void }) {
  const Tag = onClick ? 'button' : 'div'
  return (
    <Tag type={onClick ? 'button' : undefined} onClick={onClick}
      className={cn('glass flex flex-col gap-1 rounded-[18px] p-4 text-left', onClick && 'cursor-pointer transition-colors hover:bg-muted/40')}>
      <span className="flex items-center gap-1.5 text-[length:var(--fs-11-5)] font-semibold text-muted-foreground">{Icon && <Icon className="size-3.5" aria-hidden />}{label}</span>
      <span className={cn('text-[length:var(--fs-19)] font-bold tabular-nums', warn && 'text-[color:var(--warning)]')}>{value}</span>
      {bar != null && <span className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden><span className="block h-full rounded-full bg-primary" style={{ width: `${bar}%` }} /></span>}
      <span className="text-[length:var(--fs-12)] text-muted-foreground">{sub}</span>
    </Tag>
  )
}
