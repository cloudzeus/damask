'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuInbox, LuLoaderCircle, LuFileText, LuReceipt, LuLink2, LuPlus, LuEllipsisVertical, LuSparkles, LuTriangleAlert, LuRefreshCw, LuArrowRightLeft, LuTrash2, LuFolder, LuStamp,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  reviewInboxApproval, listInboxDocs, linkInboxInvoice, createExpenseFromInboxInvoice, rereadInboxDoc, moveInboxDoc, dismissInboxDoc, listTrdrApplicationsForInbox,
  type InboxItem, type InboxExpenseOption,
} from '@/lib/pm/expense-inbox'
import { getBudgetProposal, type ProposalCategory } from '@/lib/programs/expense-proposal'
import { QuoteScanDialog } from '@/components/programs/quote-scan-dialog'
import { ApprovalDialog } from './approval-dialog'
import type { ApprovalReview } from '@/lib/pm/approval'

/**
 * «Προς καταχώριση» — προσφορές & παραστατικά που ήρθαν από τη μαζική εισαγωγή αρχείων του πελάτη,
 * ήδη διαβασμένα. Προσφορά → «Δημιουργία δαπανών» (έλεγχος γραμμών/κατηγοριών)· παραστατικό →
 * «Σύνδεση» με την πιο πιθανή δαπάνη ή «Νέα δαπάνη». Κρυφό όταν δεν υπάρχει τίποτα.
 */

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const NEW = '__new__'

export function ExpenseInboxPanel({ applicationId, trdrId, onChanged }: { applicationId: string; trdrId: string; onChanged: () => void }) {
  const [data, setData] = React.useState<{ items: InboxItem[]; expenses: InboxExpenseOption[] } | null>(null)
  const [categories, setCategories] = React.useState<ProposalCategory[] | null>(null)
  const [quote, setQuote] = React.useState<InboxItem | null>(null)
  const [approval, setApproval] = React.useState<{ review: ApprovalReview; inboxId: string } | null>(null)
  const load = React.useCallback(() => {
    listInboxDocs(applicationId).then(setData).catch(() => setData({ items: [], expenses: [] }))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  if (!data || data.items.length === 0) return null

  async function openQuote(it: InboxItem) {
    if (!it.quote) { toast.error('Η προσφορά δεν διαβάστηκε — δοκίμασε «Νέα ανάγνωση».'); return }
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

  return (
    <section className="glass rounded-[22px] p-4" aria-labelledby="inbox-title">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <LuInbox className="size-4 text-primary" aria-hidden />
        <h3 id="inbox-title" className="text-[length:var(--fs-13)] font-bold">Προς καταχώριση</h3>
        <span className="badge-pill info">{data.items.length}</span>
      </div>
      <p className="mb-3 text-[length:var(--fs-11-5)] text-muted-foreground">
        Εγκριτικά, προσφορές και παραστατικά από τη μαζική εισαγωγή αρχείων του πελάτη — ήδη διαβασμένα. Έλεγξε και καταχώρισε με ένα κλικ.
      </p>
      <ul className="flex flex-col gap-2">
        {data.items.map(it => (
          <InboxRow key={it.id} item={it} expenses={data.expenses} trdrId={trdrId} applicationId={applicationId} onOpenQuote={() => void (it.kind === 'APPROVAL' ? openApproval(it) : openQuote(it))} onDone={done} onReload={load} />
        ))}
      </ul>
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
    </section>
  )
}

function InboxRow({
  item: it, expenses, trdrId, applicationId, onOpenQuote, onDone, onReload,
}: {
  item: InboxItem
  expenses: InboxExpenseOption[]
  trdrId: string
  applicationId: string
  onOpenQuote: () => void
  onDone: () => void
  onReload: () => void
}) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [target, setTarget] = React.useState<string>(it.suggestedExpenseId ?? NEW)
  const [moveOpen, setMoveOpen] = React.useState(false)
  const isQuote = it.kind === 'QUOTE'
  const isApproval = it.kind === 'APPROVAL'
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

  return (
    <li className="rounded-2xl border border-border bg-card p-3">
      <div className="flex items-start gap-2.5">
        <span className={cn('mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-lg', isQuote || isApproval ? 'bg-primary/10 text-primary' : 'bg-[color:var(--success)]/10 text-[color:var(--success)]')}>
          {isApproval ? <LuStamp className="size-4.5" aria-hidden /> : isQuote ? <LuFileText className="size-4.5" aria-hidden /> : <LuReceipt className="size-4.5" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className={cn('badge-pill', isQuote || isApproval ? 'info' : 'ok')}>{isApproval ? 'Εγκριτική' : isQuote ? 'Προσφορά' : 'Παραστατικό'}</span>
            <a href={`/expense-inbox/${it.id}`} target="_blank" rel="noreferrer" className="min-w-0 truncate text-[length:var(--fs-13)] font-semibold hover:text-primary hover:underline">{it.fileName}</a>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[length:var(--fs-11-5)] text-muted-foreground">
            {ap && <b className="text-foreground">{ap.decisionRef ?? ap.applicationCode ?? 'Εγκριτική απόφαση'}</b>}
            {ap?.totalBudget != null && <span className="tabular-nums">Π/Υ {EUR.format(ap.totalBudget)}</span>}
            {ap && <span>{ap.expenses.length} εγκεκριμένες δαπάνες</span>}
            {!isApproval && supplier && <b className="text-foreground">{supplier}</b>}
            {afm && <span>ΑΦΜ {afm}</span>}
            {!isApproval && amount != null && amount > 0 && <span className="tabular-nums">{EUR.format(amount)}{isQuote ? ' χωρίς ΦΠΑ' : ''}</span>}
            {isQuote && q && <span>{q.lines.length} {q.lines.length === 1 ? 'είδος' : 'είδη'}</span>}
            {!isQuote && inv?.documentNumber && <span>αρ. {inv.documentNumber}</span>}
            {dir && <span className="inline-flex items-center gap-1"><LuFolder className="size-3" aria-hidden />{dir}</span>}
          </div>
          {it.readError && (
            <p className="mt-1 flex items-center gap-1 text-[length:var(--fs-11-5)] text-[color:var(--warning)]"><LuTriangleAlert className="size-3.5" aria-hidden /> Δεν διαβάστηκε: {it.readError}</p>
          )}
          {it.ownInvoice && (
            <p className="mt-1 flex items-center gap-1 text-[length:var(--fs-11-5)] text-[color:var(--warning)]"><LuTriangleAlert className="size-3.5" aria-hidden /> Το εξέδωσε ο ίδιος ο πελάτης (πώληση) — μάλλον δεν είναι δαπάνη.</p>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button type="button" aria-label={`Ενέργειες για ${it.fileName}`} className="inline-flex size-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground">
                <LuEllipsisVertical className="size-4" aria-hidden />
              </button>
            }
          />
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={() => void run('reread', () => rereadInboxDoc(it.id), 'Διαβάστηκε ξανά.', false)}>
              <LuRefreshCw className="size-3.5" aria-hidden /> Νέα ανάγνωση
            </DropdownMenuItem>
            {!isApproval && (
              <DropdownMenuItem onClick={() => void run('reread', () => rereadInboxDoc(it.id, isQuote ? 'INVOICE' : 'QUOTE'), isQuote ? 'Ορίστηκε ως παραστατικό.' : 'Ορίστηκε ως προσφορά.', false)}>
                {isQuote ? <LuReceipt className="size-3.5" aria-hidden /> : <LuFileText className="size-3.5" aria-hidden />} Είναι {isQuote ? 'παραστατικό' : 'προσφορά'}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={() => setMoveOpen(true)}>
              <LuArrowRightLeft className="size-3.5" aria-hidden /> Μεταφορά σε άλλο έργο
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void run('dismiss', () => dismissInboxDoc(it.id), 'Αφαιρέθηκε από τη λίστα.')}>
              <LuTrash2 className="size-3.5" aria-hidden /> Δεν είναι δαπάνη — αφαίρεση
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-2 pl-11.5">
        {busy === 'reread' && <span className="inline-flex items-center gap-1.5 text-[length:var(--fs-11-5)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Ανάγνωση…</span>}
        {isApproval ? (
          <Button type="button" size="sm" onClick={onOpenQuote} disabled={!ap || !!busy}>
            <LuStamp className="size-3.5" aria-hidden /> Καταχώριση εγκριτικής
          </Button>
        ) : isQuote ? (
          <Button type="button" size="sm" onClick={onOpenQuote} disabled={!q || !!busy}>
            <LuPlus className="size-3.5" aria-hidden /> Δημιουργία δαπανών
          </Button>
        ) : (
          <>
            <Select value={target} onValueChange={v => setTarget(v ?? NEW)} disabled={!!busy}>
              <SelectTrigger aria-label="Δαπάνη για σύνδεση" className="h-8 min-w-0 max-w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12)] sm:w-[22rem]">
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
