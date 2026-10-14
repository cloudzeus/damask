'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuInbox, LuLoaderCircle, LuFileText, LuReceipt, LuLink2, LuPlus, LuEllipsisVertical, LuSparkles, LuTriangleAlert, LuRefreshCw, LuArrowRightLeft, LuFolder, LuStamp,
  LuEye, LuArchive, LuLandmark, LuBadgeCheck, LuBookOpen, LuCamera, LuUsers, LuUserPlus, LuWallet, LuFileQuestion, LuWandSparkles, LuChevronRight, LuCircleCheck,
} from 'react-icons/lu'
import type { IconType } from 'react-icons'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { FileViewerModal, type ViewerFile } from '@/components/ui/file-viewer-modal'
import {
  reviewInboxApproval, listInboxDocs, linkInboxInvoice, createExpenseFromInboxInvoice, rereadInboxDoc, moveInboxDoc, dismissInboxDoc, dismissInboxDocs, listTrdrApplicationsForInbox, setInboxRole,
  type InboxItem, type InboxExpenseOption,
} from '@/lib/pm/expense-inbox'
import { getBudgetProposal, type ProposalCategory } from '@/lib/programs/expense-proposal'
import { QuoteScanDialog } from '@/components/programs/quote-scan-dialog'
import { ApprovalDialog } from './approval-dialog'
import type { ApprovalReview } from '@/lib/pm/approval'
import { startImplAutofile } from '@/lib/pm/impl-autofile-actions'

/**
 * «Προς καταχώριση» — αρχεία του πελάτη που αφορούν το έργο, ήδη αναγνωρισμένα. Κάθε γραμμή λέει σε απλά λόγια
 * ΤΙ ΕΙΝΑΙ το αρχείο και ΤΙ ΘΑ ΓΙΝΕΙ, έχει προεπισκόπηση και ΜΙΑ κύρια ενέργεια. Τρεις ομάδες:
 *  1. «Χρειάζονται τον έλεγχό σας» — εγκριτική, προσφορά, παραστατικό (εκτός υλοποίησης).
 *  2. «Καταχωρίζονται αυτόματα» — πληρωμές, βεβαιώσεις, μισθοδοσία… (και παραστατικά στην υλοποίηση).
 *  3. «Δεν χρειάζονται καταχώριση» — συμβάσεις, υποδείγματα, Word· κλειστή ομάδα με «Αρχειοθέτηση».
 * Η διόρθωση «Είναι κάτι άλλο» εκπαιδεύει τη μνήμη ρόλων (ισχύει για όλα τα έργα). Κρυφό όταν δεν υπάρχει τίποτα.
 */

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const NEW = '__new__'


type Group = 'review' | 'auto' | 'other'
type RoleInfo = { label: string; explain: string; icon: IconType; tone: 'info' | 'ok' | 'muted' }

/** Τι είναι το αρχείο & τι θα γίνει — σε γλώσσα χρήστη. */
const ROLE_INFO: Record<string, RoleInfo> = {
  APPROVAL: { label: 'Εγκριτική απόφαση', explain: 'Η απόφαση ένταξης του έργου. Ελέγξτε τις εγκεκριμένες δαπάνες και καταχωρίστε τες στο έργο.', icon: LuStamp, tone: 'info' },
  QUOTE: { label: 'Προσφορά προμηθευτή', explain: 'Από τις γραμμές της προσφοράς δημιουργούνται οι δαπάνες του προϋπολογισμού — βλέπετε και διορθώνετε πριν αποθηκευτούν.', icon: LuFileText, tone: 'info' },
  INVOICE: { label: 'Παραστατικό αγοράς', explain: 'Τιμολόγιο/απόδειξη προμηθευτή. Συνδέεται με τη δαπάνη στην οποία αντιστοιχεί.', icon: LuReceipt, tone: 'ok' },
  PAYMENT: { label: 'Πληρωμή / εξτρέ', explain: 'Αποδεικτικό πληρωμής. Θα μπει στο παραστατικό που εξοφλεί (ταίριασμα με ποσό, ημερομηνία, προμηθευτή).', icon: LuLandmark, tone: 'ok' },
  SUPPLIER_CERT: { label: 'Βεβαίωση προμηθευτή', explain: 'Θα μπει στο παραστατικό που αφορά (ταίριασμα με αριθμό παραστατικού).', icon: LuBadgeCheck, tone: 'ok' },
  ACCOUNTING: { label: 'Λογιστική εγγραφή', explain: 'Καρτέλα/ημερολόγιο λογιστή. Θα επισυναφθεί στο σχετικό παραστατικό.', icon: LuBookOpen, tone: 'ok' },
  PHOTO: { label: 'Φωτογραφία εξοπλισμού', explain: 'Τεκμήριο ύπαρξης του εξοπλισμού. Θα επισυναφθεί στο σχετικό παραστατικό.', icon: LuCamera, tone: 'ok' },
  PAYSLIPS: { label: 'Μισθοδοτική κατάσταση', explain: 'Θα διαβαστεί ανά εργαζόμενο και μήνα στο μισθολογικό κόστος.', icon: LuUsers, tone: 'ok' },
  HIRING: { label: 'Αναγγελία πρόσληψης', explain: 'Θα καταχωριστεί ο νέος εργαζόμενος στο μισθολογικό κόστος.', icon: LuUserPlus, tone: 'ok' },
  PAYROLL_PAYMENT: { label: 'Πληρωμή μισθοδοσίας', explain: 'Θα μπει στους μήνες μισθοδοσίας που εξοφλεί.', icon: LuWallet, tone: 'ok' },
  PAYROLL_OTHER: { label: 'Λοιπά προσωπικού', explain: 'ΑΠΔ / e-ΕΦΚΑ — θα φυλαχτεί στο μισθολογικό κόστος ως συνοδευτικό.', icon: LuUsers, tone: 'ok' },
  OTHER: { label: 'Δεν χρειάζεται καταχώριση', explain: 'Σύμβαση, υπόδειγμα ή βοηθητικό αρχείο — δεν αντιστοιχεί σε δαπάνη. Αρχειοθετήστε το ή πείτε μας τι είναι.', icon: LuFileQuestion, tone: 'muted' },
}
const AUTO_ROLES = new Set(['PAYMENT', 'SUPPLIER_CERT', 'ACCOUNTING', 'PHOTO', 'PAYSLIPS', 'HIRING', 'PAYROLL_PAYMENT', 'PAYROLL_OTHER'])

/** Πραγματικός ρόλος γραμμής: εγκριτικό/προσφορά από την ανάγνωση, αλλιώς ρόλος από γνώση/μνήμη/χρήστη. */
function roleOf(it: InboxItem): string {
  if (it.kind === 'APPROVAL') return it.role === 'APPROVAL' || !it.role ? 'APPROVAL' : it.role
  if (it.kind === 'QUOTE') return it.role === 'OTHER' ? 'OTHER' : 'QUOTE'
  return it.role && it.role in ROLE_INFO ? it.role : 'INVOICE'
}
function groupOf(role: string, implementation: boolean, applied = false): Group {
  if (role === 'OTHER' || (role === 'APPROVAL' && applied)) return 'other'
  if (AUTO_ROLES.has(role) || (implementation && role === 'INVOICE')) return 'auto'
  return 'review'
}

const extOf = (name: string) => (/\.([a-z0-9]{1,5})$/i.exec(name)?.[1] ?? '').toLowerCase()
const isImage = (name: string) => ['jpg', 'jpeg', 'png', 'webp', 'gif'].includes(extOf(name))
const fileUrl = (id: string) => `/expense-inbox/${id}?disp=inline`

/** Φιλική εξήγηση για αρχεία που δεν διαβάζονται (Word/Excel) αντί για τεχνικό μήνυμα. */
function readNote(it: InboxItem): string | null {
  if (!it.readError) return null
  const ext = extOf(it.fileName)
  if (['doc', 'docx'].includes(ext)) return 'Αρχείο Word — δεν διαβάζεται αυτόματα. Ανοίξτε την προεπισκόπηση για να δείτε τι είναι.'
  if (['xls', 'xlsx', 'csv'].includes(ext)) return 'Αρχείο Excel — δεν διαβάζεται αυτόματα. Ανοίξτε την προεπισκόπηση για να δείτε τι είναι.'
  return `Δεν διαβάστηκε (${it.readError}) — δοκιμάστε «Νέα ανάγνωση» από το μενού ⋮.`
}

export function ExpenseInboxPanel({ applicationId, trdrId, onChanged, implementation = false }: { applicationId: string; trdrId: string; onChanged: () => void; implementation?: boolean }) {
  const [data, setData] = React.useState<{ items: InboxItem[]; expenses: InboxExpenseOption[] } | null>(null)
  const [categories, setCategories] = React.useState<ProposalCategory[] | null>(null)
  const [quote, setQuote] = React.useState<InboxItem | null>(null)
  const [approval, setApproval] = React.useState<{ review: ApprovalReview; inboxId: string } | null>(null)
  const [preview, setPreview] = React.useState<ViewerFile | null>(null)
  const [bulk, setBulk] = React.useState<'auto' | 'archive' | null>(null)
  const load = React.useCallback(() => {
    listInboxDocs(applicationId).then(setData).catch(() => setData({ items: [], expenses: [] }))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  if (!data || data.items.length === 0) return null

  async function openQuote(it: InboxItem) {
    if (!it.quote) { toast.error('Η προσφορά δεν διαβάστηκε — δοκιμάστε «Νέα ανάγνωση» από το μενού ⋮.'); return }
    if (!categories) {
      const p = await getBudgetProposal(applicationId).catch(() => null)
      setCategories(p?.categories ?? [])
    }
    setQuote(it)
  }
  const done = () => { load(); onChanged() }
  async function openApproval(it: InboxItem) {
    const r = await reviewInboxApproval(it.id).catch(() => null)
    if (!r || !r.ok) { toast.error(r && !r.ok ? r.message : 'Απέτυχε.'); return }
    setApproval({ review: r.review, inboxId: it.id })
  }

  const rows = data.items.map(it => ({ it, role: roleOf(it) })).map(r => ({ ...r, group: groupOf(r.role, implementation, r.it.approvalApplied) }))
  const by = (g: Group) => rows.filter(r => r.group === g)
  const review = by('review'), auto = by('auto'), other = by('other')

  async function fileAllNow() {
    setBulk('auto')
    try {
      const r = await startImplAutofile(applicationId)
      if (!r.ok) toast.error(r.message)
      else toast.success('Η καταχώριση ξεκίνησε στο παρασκήνιο.', { description: 'Τα αρχεία μπαίνουν στα παραστατικά/μισθοδοσία· η λίστα ενημερώνεται σε λίγο.' })
      setTimeout(done, 8000)
    } catch { toast.error('Απέτυχε.') }
    setBulk(null)
  }
  async function archiveAll() {
    setBulk('archive')
    try {
      const r = await dismissInboxDocs(applicationId, other.map(o => o.it.id))
      toast.success(`Αρχειοθετήθηκαν ${r.count} αρχεία.`, { description: 'Δεν διαγράφηκαν — απλώς φεύγουν από τη λίστα.' })
      done()
    } catch { toast.error('Απέτυχε.') }
    setBulk(null)
  }

  const rowProps = (it: InboxItem, role: string) => ({
    item: it, role, expenses: data.expenses, trdrId, applicationId, implementation,
    onPreview: () => setPreview({ name: it.fileName, url: fileUrl(it.id) }),
    onPrimary: () => void (role === 'APPROVAL' ? openApproval(it) : openQuote(it)),
    onDone: done, onReload: load,
  })

  return (
    <section className="glass rounded-[22px] p-4" aria-labelledby="inbox-title">
      <div className="flex flex-wrap items-center gap-2">
        <LuInbox className="size-4 text-primary" aria-hidden />
        <h3 id="inbox-title" className="text-[length:var(--fs-13)] font-bold">Προς καταχώριση</h3>
        <span className="badge-pill info">{data.items.length}</span>
      </div>
      <p className="mt-1 text-[length:var(--fs-11-5)] text-muted-foreground">
        Αρχεία του πελάτη που αφορούν αυτό το έργο. Η εφαρμογή αναγνώρισε τι είναι το καθένα — δείτε το (<LuEye className="inline size-3" aria-label="προεπισκόπηση" />) και επιβεβαιώστε.
        Αν κάτι αναγνωρίστηκε λάθος, διαλέξτε «Είναι κάτι άλλο» — η εφαρμογή θα το θυμάται.
      </p>

      {review.length === 0 && auto.length === 0 && (
        <p className="mt-3 flex items-center gap-2 rounded-xl bg-[color:var(--success)]/10 px-3 py-2 text-[length:var(--fs-12)] text-[color:var(--success)]">
          <LuCircleCheck className="size-4 shrink-0" aria-hidden /> Δεν εκκρεμεί καμία καταχώριση. Τα αρχεία παρακάτω δεν χρειάζονται ενέργεια — αρχειοθετήστε τα όταν θέλετε.
        </p>
      )}

      {review.length > 0 && (
        <InboxGroup title="Χρειάζονται τον έλεγχό σας" hint="Ανοίξτε, ελέγξτε και καταχωρίστε — τίποτα δεν αλλάζει χωρίς εσάς." count={review.length}>
          {review.map(({ it, role }) => <InboxRow key={it.id} {...rowProps(it, role)} />)}
        </InboxGroup>
      )}

      {auto.length > 0 && (
        <InboxGroup
          title="Καταχωρίζονται αυτόματα"
          hint="Η εφαρμογή τα βάζει μόνη της στη σωστή θέση (παραστατικό, πληρωμή, μισθοδοσία). Δεν χρειάζεται να κάνετε κάτι — ή πατήστε «Καταχώριση τώρα»."
          count={auto.length}
          action={(
            <Button type="button" size="sm" onClick={() => void fileAllNow()} disabled={!!bulk}>
              {bulk === 'auto' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuWandSparkles className="size-3.5" aria-hidden />} Καταχώριση τώρα
            </Button>
          )}
        >
          {auto.map(({ it, role }) => <InboxRow key={it.id} {...rowProps(it, role)} />)}
        </InboxGroup>
      )}

      {other.length > 0 && (
        <details className="group mt-3 rounded-2xl border border-dashed border-border bg-muted/30">
          <summary className="flex min-h-11 cursor-pointer list-none flex-wrap items-center gap-2 px-3 py-2 [&::-webkit-details-marker]:hidden">
            <LuChevronRight className="size-4 text-muted-foreground transition-transform duration-200 group-open:rotate-90" aria-hidden />
            <span className="text-[length:var(--fs-12-5)] font-semibold">Δεν χρειάζονται καταχώριση</span>
            <span className="badge-pill muted">{other.length}</span>
            <span className="basis-full pl-6 text-[length:var(--fs-11-5)] text-muted-foreground sm:basis-auto sm:pl-0">συμβάσεις, υποδείγματα, βοηθητικά αρχεία</span>
          </summary>
          <div className="flex flex-col gap-2 border-t border-dashed border-border p-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2 px-1">
              <p className="text-[length:var(--fs-11-5)] text-muted-foreground">Δεν αντιστοιχούν σε δαπάνη. Η αρχειοθέτηση τα βγάζει από τη λίστα — δεν τα διαγράφει.</p>
              <Button type="button" size="sm" variant="outline" onClick={() => void archiveAll()} disabled={!!bulk}>
                {bulk === 'archive' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuArchive className="size-3.5" aria-hidden />} Αρχειοθέτηση όλων
              </Button>
            </div>
            <ul className="flex flex-col gap-2">
              {other.map(({ it, role }) => <InboxRow key={it.id} {...rowProps(it, role)} />)}
            </ul>
          </div>
        </details>
      )}

      {quote?.quote && (
        <QuoteScanDialog
          applicationId={applicationId}
          categories={categories ?? []}
          open={!!quote}
          onOpenChange={o => { if (!o) setQuote(null) }}
          onSaved={done}
          preset={{ inboxId: quote.id, scan: quote.quote, fileName: quote.fileName }}
        />
      )}
      {approval && (
        <ApprovalDialog applicationId={applicationId} open={!!approval} onOpenChange={o => { if (!o) setApproval(null) }} onApplied={() => { done(); window.location.reload() }} preset={approval} />
      )}
      <FileViewerModal open={!!preview} onOpenChange={o => { if (!o) setPreview(null) }} file={preview} />
    </section>
  )
}

function InboxGroup({ title, hint, count, action, children }: { title: string; hint: string; count: number; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="mt-3">
      <div className="mb-2 flex flex-wrap items-end gap-x-3 gap-y-1.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-[length:var(--fs-12-5)] font-semibold">{title}</span>
            <span className="badge-pill muted">{count}</span>
          </div>
          <p className="text-[length:var(--fs-11-5)] text-muted-foreground">{hint}</p>
        </div>
        {action}
      </div>
      <ul className="flex flex-col gap-2">{children}</ul>
    </div>
  )
}

/** Προεπισκόπηση: μικρογραφία για εικόνες, τύπος αρχείου για τα υπόλοιπα — κλικ = προβολή χωρίς λήψη. */
function PreviewTile({ it, onPreview }: { it: InboxItem; onPreview: () => void }) {
  const ext = extOf(it.fileName).toUpperCase() || 'ΑΡΧΕΙΟ'
  return (
    <button
      type="button"
      onClick={onPreview}
      aria-label={`Προεπισκόπηση: ${it.fileName}`}
      title="Προεπισκόπηση"
      className="group/pv relative flex h-16 w-13 shrink-0 cursor-pointer items-center justify-center overflow-hidden rounded-lg border border-border bg-muted/50 transition-colors hover:border-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary"
    >
      {isImage(it.fileName) ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={fileUrl(it.id)} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
      ) : (
        <span className="flex flex-col items-center gap-0.5 text-muted-foreground">
          <LuFileText className="size-5" aria-hidden />
          <span className="text-[length:var(--fs-10)] font-bold tracking-wide">{ext}</span>
        </span>
      )}
      <span className="absolute inset-0 flex items-center justify-center bg-primary/70 text-primary-foreground opacity-0 transition-opacity duration-150 group-hover/pv:opacity-100 group-focus-visible/pv:opacity-100">
        <LuEye className="size-4" aria-hidden />
      </span>
    </button>
  )
}

function InboxRow({
  item: it, role, expenses, trdrId, applicationId, implementation, onPreview, onPrimary, onDone, onReload,
}: {
  item: InboxItem
  role: string
  expenses: InboxExpenseOption[]
  trdrId: string
  applicationId: string
  implementation: boolean
  onPreview: () => void
  onPrimary: () => void
  onDone: () => void
  onReload: () => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [target, setTarget] = React.useState<string>(it.suggestedExpenseId ?? NEW)
  const [moveOpen, setMoveOpen] = React.useState(false)
  const info = ROLE_INFO[role] ?? ROLE_INFO.OTHER
  const Icon = info.icon
  const group = groupOf(role, implementation, it.approvalApplied)
  const isQuote = it.kind === 'QUOTE'
  const freeExpenses = expenses.filter(e => !e.hasInvoice || e.id === it.suggestedExpenseId)

  async function run(key: string, fn: () => Promise<{ ok: boolean; message?: string } | void>, okMsg: string, done = true) {
    setBusy(key)
    try {
      const r = await fn()
      if (r && !r.ok) { toast.error(r.message ?? 'Απέτυχε.'); return }
      toast.success(okMsg)
      if (done) onDone(); else onReload()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Απέτυχε.')
    } finally { setBusy(null) }
  }

  const q = it.quote
  const inv = it.invoice
  const ap = it.approval
  const supplier = isQuote ? (q?.supplier.existing?.name ?? q?.supplier.name) : inv?.issuer.name
  const afm = isQuote ? q?.supplier.afm : inv?.issuer.afm
  const amount = isQuote ? (q?.totals.net ?? q?.lines.reduce((a, l) => a + l.total, 0)) : (inv?.totals.gross ?? inv?.totals.net)
  const dir = it.relPath?.includes('/') ? it.relPath.slice(0, it.relPath.lastIndexOf('/')) : null
  const note = readNote(it)
  const by = it.roleSource === 'user' ? 'δική σας επιλογή' : it.roleSource === 'memory' ? 'από όμοια αρχεία' : null

  return (
    <li className={cn('rounded-2xl border bg-card p-3', group === 'other' ? 'border-border/70' : 'border-border')}>
      <div className="flex items-start gap-3">
        <PreviewTile it={it} onPreview={onPreview} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('badge-pill inline-flex items-center gap-1', info.tone)}><Icon className="size-3" aria-hidden />{info.label}</span>
            {by && <span className="text-[length:var(--fs-11)] text-muted-foreground">({by})</span>}
          </div>
          <button type="button" onClick={onPreview} className="mt-1 block max-w-full cursor-pointer truncate text-left text-[length:var(--fs-13)] font-semibold hover:text-primary hover:underline" title={it.fileName}>
            {it.fileName}
          </button>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--fs-11-5)] text-muted-foreground">
            {role === 'APPROVAL' && ap && <b className="text-foreground">{ap.decisionRef ?? ap.applicationCode ?? 'Εγκριτική απόφαση'}</b>}
            {role === 'APPROVAL' && ap?.totalBudget != null && <span className="tabular-nums">Π/Υ {EUR.format(ap.totalBudget)}</span>}
            {role === 'APPROVAL' && ap && <span>{ap.expenses.length} εγκεκριμένες δαπάνες</span>}
            {role !== 'APPROVAL' && supplier && <b className="text-foreground">{supplier}</b>}
            {role !== 'APPROVAL' && afm && <span>ΑΦΜ {afm}</span>}
            {role !== 'APPROVAL' && amount != null && amount > 0 && <span className="tabular-nums">{EUR.format(amount)}{isQuote ? ' χωρίς ΦΠΑ' : ''}</span>}
            {isQuote && q && <span>{q.lines.length} {q.lines.length === 1 ? 'είδος' : 'είδη'}</span>}
            {!isQuote && inv?.documentNumber && <span>αρ. {inv.documentNumber}</span>}
            {dir && <span className="inline-flex min-w-0 items-center gap-1"><LuFolder className="size-3 shrink-0" aria-hidden /><span className="truncate">{dir}</span></span>}
          </div>
          <p className="mt-1.5 text-[length:var(--fs-12)] leading-snug text-foreground/80">
            {it.approvalApplied ? 'Η απόφαση αυτή έχει ήδη καταχωριστεί στο έργο — δεν χρειάζεται κάτι άλλο. Αρχειοθετήστε την.' : info.explain}
          </p>
          {note && (
            <p className="mt-1 flex items-start gap-1 text-[length:var(--fs-11-5)] text-[color:var(--warning)]"><LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> {note}</p>
          )}
          {it.ownInvoice && (
            <p className="mt-1 flex items-start gap-1 text-[length:var(--fs-11-5)] text-[color:var(--warning)]"><LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> Το εξέδωσε ο ίδιος ο πελάτης (πώληση) — μάλλον δεν είναι δαπάνη.</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button type="button" aria-label={`Περισσότερες ενέργειες για ${it.fileName}`} className="inline-flex size-9 shrink-0 cursor-pointer items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <LuEllipsisVertical className="size-4" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={onPreview}><LuEye className="size-3.5" aria-hidden /> Προεπισκόπηση</DropdownMenuItem>
            <DropdownMenuItem onClick={() => void run('reread', () => rereadInboxDoc(it.id), 'Διαβάστηκε ξανά.', false)}>
              <LuRefreshCw className="size-3.5" aria-hidden /> Νέα ανάγνωση
            </DropdownMenuItem>
            {it.kind !== 'APPROVAL' && (
              <DropdownMenuItem onClick={() => void run('reread', () => rereadInboxDoc(it.id, isQuote ? 'INVOICE' : 'QUOTE'), isQuote ? 'Ορίστηκε ως παραστατικό.' : 'Ορίστηκε ως προσφορά.', false)}>
                {isQuote ? <LuReceipt className="size-3.5" aria-hidden /> : <LuFileText className="size-3.5" aria-hidden />} Να διαβαστεί ως {isQuote ? 'παραστατικό' : 'προσφορά'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setMoveOpen(true)}>
              <LuArrowRightLeft className="size-3.5" aria-hidden /> Αφορά άλλο έργο…
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={() => void run('dismiss', () => dismissInboxDoc(it.id), 'Αρχειοθετήθηκε — δεν διαγράφηκε.')}>
              <LuArchive className="size-3.5" aria-hidden /> Αρχειοθέτηση (δεν χρειάζεται)
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 sm:pl-16">
        {busy === 'reread' && <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Ανάγνωση…</span>}
        {role === 'APPROVAL' && !it.approvalApplied && (
          ap ? (
            <Button type="button" size="sm" onClick={onPrimary} disabled={!!busy}><LuStamp className="size-3.5" aria-hidden /> Έλεγχος & καταχώριση</Button>
          ) : (
            <Button type="button" size="sm" variant="outline" onClick={() => void run('reread', () => rereadInboxDoc(it.id), 'Διαβάστηκε.', false)} disabled={!!busy}><LuRefreshCw className="size-3.5" aria-hidden /> Ανάγνωση εγκριτικής</Button>
          )
        )}
        {role === 'QUOTE' && (
          <Button type="button" size="sm" onClick={onPrimary} disabled={!q || !!busy}><LuPlus className="size-3.5" aria-hidden /> Δημιουργία δαπανών</Button>
        )}
        {role === 'INVOICE' && group === 'review' && (
          <>
            <Select value={target} onValueChange={v => setTarget(v ?? NEW)} disabled={!!busy}>
              <SelectTrigger aria-label="Δαπάνη στην οποία αντιστοιχεί" className="h-9 min-w-0 max-w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12)] sm:w-[22rem]">
                <SelectValue>
                  {(v: string) => v === NEW ? 'Νέα δαπάνη από το παραστατικό' : (() => { const e = expenses.find(x => x.id === v); return e ? `${e.description} — ${EUR.format(e.amount)}` : '' })()}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NEW}>Νέα δαπάνη από το παραστατικό</SelectItem>
                {freeExpenses.map(e => (
                  <SelectItem key={e.id} value={e.id}>
                    {e.description} — {EUR.format(e.amount)}{e.supplierName ? ` · ${e.supplierName}` : ''}{e.id === it.suggestedExpenseId ? ' ★' : ''}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              type="button"
              size="sm"
              disabled={!!busy || (target === NEW && !inv)}
              onClick={() => target === NEW
                ? void run('link', () => createExpenseFromInboxInvoice(it.id), 'Δημιουργήθηκε δαπάνη και συνδέθηκε το παραστατικό.')
                : void run('link', () => linkInboxInvoice(it.id, target), 'Το παραστατικό συνδέθηκε με τη δαπάνη.')}
            >
              {busy === 'link' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : target === NEW ? <LuPlus className="size-3.5" aria-hidden /> : <LuLink2 className="size-3.5" aria-hidden />}
              {target === NEW ? 'Νέα δαπάνη' : 'Σύνδεση'}
            </Button>
            {it.suggestedExpenseId && target === it.suggestedExpenseId && it.suggestReason && (
              <span className="inline-flex items-center gap-1 text-[length:var(--fs-11-5)] text-muted-foreground"><LuSparkles className="size-3 text-primary" aria-hidden /> Πρόταση: {it.suggestReason}</span>
            )}
          </>
        )}
        {group === 'auto' && (
          <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-[color:var(--success)]"><LuCircleCheck className="size-3.5" aria-hidden /> Θα καταχωριστεί αυτόματα</span>
        )}
        {group === 'other' && (
          <Button type="button" size="sm" variant="outline" disabled={!!busy} onClick={() => void run('dismiss', () => dismissInboxDoc(it.id), 'Αρχειοθετήθηκε — δεν διαγράφηκε.')}>
            {busy === 'dismiss' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuArchive className="size-3.5" aria-hidden />} Αρχειοθέτηση
          </Button>
        )}
        <RoleCorrect item={it} role={role} onDone={onDone} />
      </div>

      <MoveDialog open={moveOpen} onOpenChange={setMoveOpen} trdrId={trdrId} currentId={applicationId}
        onMove={appId => run('move', () => moveInboxDoc(it.id, appId), 'Μεταφέρθηκε στο άλλο έργο.')} />
    </li>
  )
}

function MoveDialog({ open, onOpenChange, trdrId, currentId, onMove }: { open: boolean; onOpenChange: (o: boolean) => void; trdrId: string; currentId: string; onMove: (appId: string) => Promise<void> }) {
  const [apps, setApps] = React.useState<{ id: string; title: string }[] | null>(null)
  const [pick, setPick] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [prev, setPrev] = React.useState(open)
  if (open !== prev) {
    setPrev(open)
    if (open && !apps) listTrdrApplicationsForInbox(trdrId).then(a => setApps(a.filter(x => x.id !== currentId))).catch(() => setApps([]))
  }
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Μεταφορά σε άλλο έργο</DialogTitle>
          <DialogDescription>Επίλεξε το έργο του πελάτη στο οποίο αφορά το αρχείο.</DialogDescription>
        </DialogHeader>
        {!apps ? (
          <p className="flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Φόρτωση…</p>
        ) : apps.length === 0 ? (
          <p className="text-[length:var(--fs-12)] text-muted-foreground">Ο πελάτης δεν έχει άλλο έργο.</p>
        ) : (
          <Select value={pick || undefined} onValueChange={v => setPick(v ?? '')}>
            <SelectTrigger aria-label="Έργο" className="h-9 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
              <SelectValue placeholder="Επίλεξε έργο…">{(v: string) => apps.find(a => a.id === v)?.title ?? ''}</SelectValue>
            </SelectTrigger>
            <SelectContent>{apps.map(a => <SelectItem key={a.id} value={a.id}>{a.title}</SelectItem>)}</SelectContent>
          </Select>
        )}
        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Άκυρο</Button>
          <Button type="button" disabled={!pick || saving} onClick={async () => { setSaving(true); await onMove(pick); setSaving(false); onOpenChange(false) }}>
            {saving && <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden />} Μεταφορά
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}


/** Επιλογές «Είναι κάτι άλλο» — ό,τι μπορεί να είναι ένα αρχείο του έργου. */
const CORRECT_OPTIONS = ['INVOICE', 'PAYMENT', 'SUPPLIER_CERT', 'ACCOUNTING', 'PHOTO', 'PAYSLIPS', 'HIRING', 'PAYROLL_PAYMENT', 'PAYROLL_OTHER', 'OTHER']

/**
 * «Είναι κάτι άλλο…» — διόρθωση του ρόλου. Η επιλογή καταχωρίζεται (αυτόματα για αρχεία υλοποίησης) ΚΑΙ η εφαρμογή τη
 * θυμάται για αρχεία με ίδιο σχήμα ονόματος/φακέλου σε όλα τα έργα.
 */
function RoleCorrect({ item, role, onDone }: { item: InboxItem; role: string; onDone: () => void }) {
  const [busy, setBusy] = React.useState(false)
  if (item.kind === 'QUOTE') return null
  const options = item.kind === 'APPROVAL' ? ['APPROVAL', ...CORRECT_OPTIONS] : CORRECT_OPTIONS
  async function pick(v: string) {
    if (v === role) return
    setBusy(true)
    try {
      const r = await setInboxRole(item.id, v)
      if (!r.ok) toast.error(r.message)
      else {
        toast.success(v === 'OTHER' ? 'Μπήκε στα «Δεν χρειάζονται καταχώριση».' : v === 'APPROVAL' ? 'Ορίστηκε ως εγκριτική απόφαση.' : `Ορίστηκε ως «${ROLE_INFO[v]?.label}».`, { description: 'Η εφαρμογή θα το θυμάται για όμοια αρχεία.' })
        onDone()
      }
    } catch { toast.error('Απέτυχε.') }
    setBusy(false)
  }
  return (
    <Select value="" onValueChange={v => { if (v) void pick(v) }} disabled={busy}>
      <SelectTrigger aria-label="Διόρθωση: τι είναι αυτό το αρχείο" className="h-9 w-auto rounded-full border-transparent bg-transparent px-3 text-[length:var(--fs-12)] text-muted-foreground hover:bg-muted hover:text-foreground">
        {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
        <SelectValue>{() => 'Είναι κάτι άλλο…'}</SelectValue>
      </SelectTrigger>
      <SelectContent>
        {options.map(o => <SelectItem key={o} value={o} disabled={o === role}>{ROLE_INFO[o]?.label}</SelectItem>)}
      </SelectContent>
    </Select>
  )
}
