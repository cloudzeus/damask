'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuPlus, LuLoaderCircle, LuPrinter, LuUpload, LuFileCheck2, LuTriangleAlert, LuSearch, LuCircleCheck, LuSparkles, LuArrowRightLeft, LuChevronRight, LuEllipsisVertical,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { cn } from '@/lib/utils'
import { createExpense, confirmExpenseCategory } from '@/lib/programs/actions'
import {
  getBudgetProposal, findOrCreateSupplierByAfm, listCustomerSuppliers, uploadExpenseQuote, evaluateExpenseEligibility,
  type BudgetProposal, type ProposalCategory, type SupplierOption,
} from '@/lib/programs/expense-proposal'
import { openProposal } from '@/lib/programs/proposal-html'

/**
 * «Οδηγός Προϋπολογισμού Υποβολής» — εύκολο UX για μη-τεχνικό χρήστη
 * (ui-ux-pro-max): κάρτα ανά κατηγορία με ΜΠΑΡΑ ΟΡΙΟΥ (πράσινο/κόκκινο), μεγάλο
 * «+ Δαπάνη», προμηθευτής με ΑΦΜ (ΑΑΔΕ), ανέβασμα προσφοράς· χωρίς προσφορά =
 * κίτρινο σήμα + εκκρεμότητα· κουμπί «Εκτύπωση πρότασης» → PDF για τον πελάτη.
 */

const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const EUR2 = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function readFileBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve({ base64: s.includes(',') ? s.split(',')[1] : s, ext: file.name.includes('.') ? file.name.split('.').pop()! : 'bin' }) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function BudgetProposalPanel({ applicationId }: { applicationId: string }) {
  const [data, setData] = React.useState<BudgetProposal | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [addCat, setAddCat] = React.useState<ProposalCategory | 'none' | null>(null)

  const load = React.useCallback(() => {
    getBudgetProposal(applicationId).then(d => setData(d)).catch(() => toast.error('Αποτυχία φόρτωσης.')).finally(() => setLoading(false))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  if (loading) return <div className="glass flex items-center justify-center gap-2 rounded-[22px] p-8 text-[0.78125rem] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
  if (!data) return null

  const expensesByCat = (catId: string | null) => data.expenses.filter(e => e.categoryId === catId)

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="dotted-leader text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Προδιαγραφή προϋπολογισμού υποβολής</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.8125rem]">
            <span>Προϋπολογισμός: <b>{data.totalBudget != null ? `${EUR.format(data.totalBudget)} €` : '—'}</b></span>
            <span>Προδιαγραμμένο σύνολο: <b className="tabular-nums">{EUR2.format(data.totalSpent)} €</b></span>
            {data.missingQuotes > 0 && <span className="badge-pill warn"><LuTriangleAlert className="size-3" aria-hidden /> {data.missingQuotes} χωρίς προσφορά</span>}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => { if (!openProposal(data)) toast.error('Επίτρεψε τα popups.') }}>
          <LuPrinter className="size-3.5" aria-hidden /> Εκτύπωση πρότασης
        </Button>
      </div>

      <p className="mb-3 text-[0.71875rem] text-muted-foreground">Στο στάδιο της μελέτης <strong>προδιαγράφεις</strong> τις δαπάνες μέσα σε κάθε κατηγορία (άνοιξε την κατηγορία για να τις δεις μία-μία). Η <strong>μπάρα</strong> δείχνει πόσο έχεις καλύψει από το όριο. Κάθε δαπάνη χρειάζεται <strong>ενυπόγραφη προσφορά</strong> — αν λείπει, μπαίνει σε εκκρεμότητα.</p>

      <div className="flex flex-col gap-2.5">
        {data.categories.map(c => (
          <CategoryCard key={c.id} category={c} expenses={expensesByCat(c.id)} onAdd={() => setAddCat(c)} onReload={load} />
        ))}
        {/* Δαπάνες χωρίς κατηγορία */}
        {expensesByCat(null).length > 0 && (
          <CategoryCard category={null} expenses={expensesByCat(null)} onAdd={() => setAddCat('none')} onReload={load} />
        )}
      </div>

      {addCat && (
        <AddExpenseDialog
          applicationId={applicationId}
          trdrId={data.trdrId}
          category={addCat === 'none' ? null : addCat}
          onClose={() => setAddCat(null)}
          onSaved={() => { setAddCat(null); load() }}
        />
      )}
    </section>
  )
}

function CategoryCard({
  category: c, expenses, onAdd, onReload,
}: {
  category: ProposalCategory | null
  expenses: BudgetProposal['expenses']
  onAdd: () => void
  onReload: () => void
}) {
  const spent = expenses.reduce((s, e) => s + e.amount, 0)
  const max = c?.maxAmount ?? null
  const pctUsed = max && max > 0 ? Math.min(100, (spent / max) * 100) : null
  const over = c?.status === 'OVER'
  const under = c?.status === 'UNDER'
  const count = expenses.length
  // Ανοιχτή εξ ορισμού όταν έχει δαπάνες· κλειστή όταν είναι άδεια.
  const [open, setOpen] = React.useState(count > 0)
  const [evaluatingAll, setEvaluatingAll] = React.useState(false)
  const missing = expenses.filter(e => !e.hasQuote).length
  const panelId = React.useId()

  // «Τεκμηρίωση AI για όλες» — αξιολογεί σειριακά κάθε δαπάνη της κατηγορίας.
  async function evaluateAll() {
    if (count === 0) { toast.info('Δεν υπάρχουν δαπάνες σε αυτή την κατηγορία.'); return }
    setEvaluatingAll(true)
    setOpen(true)
    let ok = 0
    for (const e of expenses) {
      try { const r = await evaluateExpenseEligibility(e.id); if (r.ok) ok++ } catch { /* συνεχίζουμε */ }
    }
    setEvaluatingAll(false)
    toast.success(`Τεκμηριώθηκαν ${ok}/${count} δαπάνες.`)
    onReload()
  }

  return (
    <div className={cn('overflow-hidden rounded-2xl border', over ? 'border-[color:var(--coral)]' : 'border-border')}>
      {/* Κεφαλίδα κατηγορίας — κλικ = expand/collapse· ⋮ menu στην άκρη */}
      <div className="flex items-stretch">
        <button
          type="button"
          onClick={() => setOpen(o => !o)}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-w-0 flex-1 items-center gap-2 px-3 py-2.5 text-left transition-colors hover:bg-muted/40"
        >
          <LuChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-90')} aria-hidden />
          <div className="flex min-w-0 flex-1 flex-col gap-1">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className="text-[0.8125rem] font-semibold">{c?.name ?? 'Χωρίς κατηγορία'}</span>
              {c?.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτική</span>}
              <span className="badge-pill muted shrink-0 tabular-nums">{count} {count === 1 ? 'δαπάνη' : 'δαπάνες'}</span>
              {missing > 0 && <span className="badge-pill warn shrink-0"><LuTriangleAlert className="size-3" aria-hidden /> {missing} χωρίς προσφορά</span>}
              {c && <span className="text-[0.6875rem] text-muted-foreground">όριο: {c.limitLabel}</span>}
            </div>
            {/* Μπάρα ορίου — ορατή και κλειστή, ως σύνοψη */}
            {pctUsed != null && (
              <div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                  <div className={cn('h-full rounded-full transition-all', over ? 'bg-[color:var(--coral)]' : 'bg-[color:var(--success)]')} style={{ width: `${pctUsed}%` }} />
                </div>
                <div className="mt-0.5 flex items-center justify-between text-[0.65625rem]">
                  <span className={cn(over ? 'font-bold text-[color:var(--coral)]' : under ? 'text-[color:var(--warning)]' : 'text-muted-foreground')}>
                    {over ? 'Υπέρβαση ορίου!' : under ? 'Κάτω από το ελάχιστο' : `μένουν ${EUR2.format(Math.max(0, (max ?? 0) - spent))} €`}
                  </span>
                  <span className="text-muted-foreground">{Math.round(pctUsed)}% του ορίου</span>
                </div>
              </div>
            )}
          </div>
          <span className="shrink-0 text-[0.8125rem] font-bold tabular-nums">{EUR2.format(spent)} €</span>
        </button>
        {/* ⋮ Ενέργειες κατηγορίας */}
        <div className="flex items-center pr-1.5 pl-0.5">
          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <button type="button" aria-label="Ενέργειες κατηγορίας" disabled={evaluatingAll} className="flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50">
                  {evaluatingAll ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuEllipsisVertical className="size-4" aria-hidden />}
                </button>
              }
            />
            <DropdownMenuContent align="end" className="w-max min-w-56">
              <DropdownMenuItem onClick={onAdd}><LuPlus className="size-3.5" aria-hidden /> Προδιαγραφή δαπάνης</DropdownMenuItem>
              <DropdownMenuItem onClick={evaluateAll} disabled={count === 0}><LuSparkles className="size-3.5" aria-hidden /> Τεκμηρίωση AI για όλες</DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setOpen(o => !o)}>
                <LuChevronRight className={cn('size-3.5 transition-transform', open && 'rotate-90')} aria-hidden /> {open ? 'Σύμπτυξη' : 'Άνοιγμα'}
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* Σώμα — δαπάνες μία-μία + προσθήκη */}
      {open && (
        <div id={panelId} className="border-t border-border px-3 py-2.5">
          {count > 0 ? (
            <ul className="flex flex-col gap-1">
              {expenses.map(e => <ExpenseRow key={e.id} expense={e} onReload={onReload} />)}
            </ul>
          ) : (
            <p className="py-1 text-[0.71875rem] text-muted-foreground">Καμία προδιαγραμμένη δαπάνη σε αυτή την κατηγορία ακόμη.</p>
          )}
          <Button type="button" size="sm" variant="outline" className="mt-2" onClick={onAdd}>
            <LuPlus className="size-3.5" aria-hidden /> Προδιαγραφή δαπάνης
          </Button>
        </div>
      )}
    </div>
  )
}

const VERDICT_META: Record<string, { label: string; cls: string }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', cls: 'ok' }, INELIGIBLE: { label: 'ΜΗ επιλέξιμη', cls: 'warn' }, UNCERTAIN: { label: 'Αβέβαιο', cls: 'muted' },
}

function ExpenseRow({ expense: e, onReload }: { expense: BudgetProposal['expenses'][number]; onReload: () => void }) {
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = React.useState(false)
  const [evaluating, setEvaluating] = React.useState(false)
  const [showNote, setShowNote] = React.useState(false)
  const [suggestion, setSuggestion] = React.useState<{ id: string; name: string } | null>(null)
  const [moving, setMoving] = React.useState(false)

  async function upload(file: File) {
    setBusy(true)
    try {
      const { base64, ext } = await readFileBase64(file)
      await uploadExpenseQuote(e.id, { name: file.name, base64, mimeType: file.type || 'application/octet-stream', ext })
      toast.success('Η προσφορά ανέβηκε.')
      onReload()
    } catch { toast.error('Το ανέβασμα απέτυχε.') } finally { setBusy(false) }
  }

  async function evaluate() {
    setEvaluating(true)
    try {
      const res = await evaluateExpenseEligibility(e.id)
      if (!res.ok) { toast.error(res.message ?? 'Η αξιολόγηση απέτυχε.'); return }
      setSuggestion(res.result.suggestedCategoryId && res.result.suggestedCategoryName
        ? { id: res.result.suggestedCategoryId, name: res.result.suggestedCategoryName }
        : null)
      toast.success('Η τεκμηρίωση δημιουργήθηκε.')
      setShowNote(true)
      onReload()
    } catch { toast.error('Η αξιολόγηση απέτυχε.') } finally { setEvaluating(false) }
  }

  async function moveToSuggested() {
    if (!suggestion) return
    setMoving(true)
    try {
      await confirmExpenseCategory(e.id, suggestion.id)
      toast.success(`Μετακινήθηκε στην «${suggestion.name}».`)
      setSuggestion(null)
      onReload()
    } catch { toast.error('Η μετακίνηση απέτυχε.') } finally { setMoving(false) }
  }

  const vm = e.eligibilityVerdict ? VERDICT_META[e.eligibilityVerdict] : null

  return (
    <li className="rounded-lg bg-card/60 px-2.5 py-1.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[0.78125rem]">
        <span className="font-medium">{e.description}</span>
        {e.supplierName && <span className="text-[0.6875rem] text-muted-foreground">· {e.supplierName}{e.supplierAfm ? ` (${e.supplierAfm})` : ''}</span>}
        {vm && <button type="button" onClick={() => setShowNote(s => !s)} className={`badge-pill shrink-0 ${vm.cls}`} title="Τεκμηρίωση AI — έλεγξέ τη">{vm.label} ▾</button>}
        <button type="button" onClick={evaluate} disabled={evaluating} className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2 py-0.5 text-[0.65625rem] font-semibold hover:border-primary hover:text-primary" title="Αξιολόγηση επιλεξιμότητας με AI (τεκμηρίωση βάσει αποδελτίωσης)">
          {evaluating ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuSparkles className="size-3" aria-hidden />} {e.eligibilityVerdict ? 'Ξανά' : 'Τεκμηρίωση AI'}
        </button>
        <span className="ml-auto font-bold tabular-nums">{EUR2.format(e.amount)} €</span>
        {e.hasQuote ? (
          <a href={`/expense-quotes/${e.id}`} className="badge-pill ok shrink-0"><LuFileCheck2 className="size-3" aria-hidden /> προσφορά</a>
        ) : (
          <>
            <input ref={fileRef} type="file" className="hidden" onChange={ev => { const f = ev.target.files?.[0]; if (f) void upload(f); ev.target.value = '' }} />
            <button type="button" onClick={() => fileRef.current?.click()} disabled={busy} className="badge-pill warn shrink-0" title="Ανέβασε ενυπόγραφη προσφορά — αλλιώς μένει σε εκκρεμότητα">
              {busy ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuUpload className="size-3" aria-hidden />} λείπει προσφορά
            </button>
          </>
        )}
      </div>
      {showNote && e.eligibilityNote && (
        <p className="mt-1 rounded-md bg-muted/60 px-2 py-1 text-[0.6875rem] text-muted-foreground"><strong>Τεκμηρίωση AI (έλεγξέ τη):</strong> {e.eligibilityNote}</p>
      )}
      {suggestion && (
        <div className="mt-1 flex flex-wrap items-center gap-2 rounded-md border border-primary/30 bg-primary/5 px-2 py-1 text-[0.6875rem]">
          <span className="text-muted-foreground">Το AI προτείνει κατηγορία: <strong className="text-foreground">{suggestion.name}</strong></span>
          <button type="button" onClick={moveToSuggested} disabled={moving} className="ml-auto inline-flex shrink-0 items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60" title="Μετακίνησε τη δαπάνη στην προτεινόμενη κατηγορία">
            {moving ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuArrowRightLeft className="size-3" aria-hidden />} Μετακίνησε εκεί
          </button>
          <button type="button" onClick={() => setSuggestion(null)} className="shrink-0 text-muted-foreground hover:text-foreground" title="Απόρριψη πρότασης">✕</button>
        </div>
      )}
    </li>
  )
}

function AddExpenseDialog({
  applicationId, trdrId, category, onClose, onSaved,
}: {
  applicationId: string
  trdrId: string
  category: ProposalCategory | null
  onClose: () => void
  onSaved: () => void
}) {
  const [description, setDescription] = React.useState('')
  const [amount, setAmount] = React.useState('')
  const [afm, setAfm] = React.useState('')
  const [supplier, setSupplier] = React.useState<SupplierOption | null>(null)
  const [customerSuppliers, setCustomerSuppliers] = React.useState<SupplierOption[]>([])
  const [quote, setQuote] = React.useState<File | null>(null)
  const [lookingUp, setLookingUp] = React.useState(false)
  const [saving, setSaving] = React.useState(false)
  const quoteRef = React.useRef<HTMLInputElement | null>(null)

  React.useEffect(() => {
    let cancelled = false
    listCustomerSuppliers(trdrId).then(s => { if (!cancelled) setCustomerSuppliers(s) }).catch(() => {})
    return () => { cancelled = true }
  }, [trdrId])

  async function lookupAfm() {
    const clean = afm.replace(/\D/g, '')
    if (clean.length !== 9) { toast.error('Δώσε ΑΦΜ 9 ψηφίων.'); return }
    setLookingUp(true)
    try {
      const res = await findOrCreateSupplierByAfm(clean)
      if (!res.ok || !res.supplier) { toast.error(res.message ?? 'Δεν βρέθηκε.'); return }
      setSupplier(res.supplier)
      toast.success(res.created ? `Νέος προμηθευτής: ${res.supplier.name}` : `Βρέθηκε: ${res.supplier.name}`)
    } catch { toast.error('Η αναζήτηση απέτυχε.') } finally { setLookingUp(false) }
  }

  async function save() {
    const amt = Number(amount.replace(/\./g, '').replace(',', '.'))
    if (!description.trim()) { toast.error('Γράψε τι είναι η δαπάνη.'); return }
    if (!Number.isFinite(amt) || amt <= 0) { toast.error('Δώσε έγκυρο ποσό.'); return }
    setSaving(true)
    try {
      const { id } = await createExpense(applicationId, { description: description.trim(), amount: amt, categoryId: category?.id ?? null, supplierTrdrId: supplier?.id ?? null })
      if (quote) {
        const { base64, ext } = await readFileBase64(quote)
        await uploadExpenseQuote(id, { name: quote.name, base64, mimeType: quote.type || 'application/octet-stream', ext })
      }
      toast.success('Η δαπάνη προστέθηκε.')
      onSaved()
    } catch { toast.error('Η προσθήκη απέτυχε.'); setSaving(false) }
  }

  return (
    <Dialog open onOpenChange={o => { if (!o) onClose() }}>
      <DialogContent className="glass sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>Προδιαγραφή δαπάνης{category ? ` — ${category.name}` : ''}</DialogTitle>
          <DialogDescription>Συμπλήρωσε τα βασικά. Ο προμηθευτής βρίσκεται μόνο με το ΑΦΜ.</DialogDescription>
        </DialogHeader>

        <div className="field !mb-0">
          <label htmlFor="ae-desc">Τι είναι η δαπάνη;</label>
          <Input id="ae-desc" value={description} onChange={e => setDescription(e.target.value)} placeholder="π.χ. Λογισμικό ERP" autoFocus disabled={saving} />
        </div>
        <div className="field !mb-0">
          <label htmlFor="ae-amt">Ποσό (€)</label>
          <Input id="ae-amt" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="π.χ. 12.500,00" disabled={saving} />
        </div>

        <div className="field !mb-0">
          <label>Προμηθευτής (με ΑΦΜ)</label>
          {supplier ? (
            <div className="flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 text-[0.8125rem]">
              <LuCircleCheck className="size-4 text-[color:var(--success)]" aria-hidden />
              <span className="font-semibold">{supplier.name}</span>{supplier.afm && <span className="text-muted-foreground">({supplier.afm})</span>}
              <button type="button" onClick={() => setSupplier(null)} className="ml-auto text-[0.6875rem] text-muted-foreground hover:text-foreground">αλλαγή</button>
            </div>
          ) : (
            <>
              <div className="flex gap-1.5">
                <Input inputMode="numeric" value={afm} onChange={e => setAfm(e.target.value)} placeholder="ΑΦΜ προμηθευτή" disabled={saving || lookingUp} />
                <Button type="button" variant="outline" onClick={lookupAfm} disabled={saving || lookingUp}>
                  {lookingUp ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuSearch className="size-3.5" aria-hidden />} Βρες
                </Button>
              </div>
              {customerSuppliers.length > 0 && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {customerSuppliers.map(s => (
                    <button key={s.id} type="button" onClick={() => setSupplier(s)} className="badge-pill muted shrink-0 cursor-pointer hover:bg-muted">{s.name}</button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        <div className="field !mb-0">
          <label>Ενυπόγραφη προσφορά (προαιρετικό)</label>
          <input ref={quoteRef} type="file" className="hidden" onChange={e => setQuote(e.target.files?.[0] ?? null)} />
          <button type="button" onClick={() => quoteRef.current?.click()} disabled={saving} className="flex w-full items-center gap-2 rounded-xl border border-dashed border-border px-3 py-2.5 text-left text-[0.78125rem] hover:bg-muted">
            <LuUpload className="size-3.5 shrink-0" aria-hidden />
            <span className="truncate">{quote ? quote.name : 'Ανέβασε την προσφορά… (αν λείπει, μπαίνει σε εκκρεμότητα)'}</span>
          </button>
        </div>

        <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={save} disabled={saving || !description.trim() || !amount.trim()}>
            {saving ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Προσθήκη…</> : <><LuPlus className="size-3.5" aria-hidden /> Προσθήκη</>}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
