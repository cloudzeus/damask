'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuPlus, LuLoaderCircle, LuPrinter, LuUpload, LuFileCheck2, LuTriangleAlert, LuSearch, LuCircleCheck,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { createExpense } from '@/lib/programs/actions'
import {
  getBudgetProposal, findOrCreateSupplierByAfm, listCustomerSuppliers, uploadExpenseQuote,
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
          <div className="dotted-leader text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Πρόταση προϋπολογισμού υποβολής</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-3 text-[0.8125rem]">
            <span>Προϋπολογισμός: <b>{data.totalBudget != null ? `${EUR.format(data.totalBudget)} €` : '—'}</b></span>
            <span>Σύνολο πρότασης: <b className="tabular-nums">{EUR2.format(data.totalSpent)} €</b></span>
            {data.missingQuotes > 0 && <span className="badge-pill warn"><LuTriangleAlert className="size-3" aria-hidden /> {data.missingQuotes} χωρίς προσφορά</span>}
          </div>
        </div>
        <Button type="button" variant="outline" onClick={() => { if (!openProposal(data)) toast.error('Επίτρεψε τα popups.') }}>
          <LuPrinter className="size-3.5" aria-hidden /> Εκτύπωση πρότασης
        </Button>
      </div>

      <p className="mb-3 text-[0.71875rem] text-muted-foreground">Πρόσθεσε δαπάνες μέσα σε κάθε κατηγορία. Η <strong>μπάρα</strong> δείχνει πόσο έχεις χρησιμοποιήσει από το όριο. Κάθε δαπάνη χρειάζεται <strong>ενυπόγραφη προσφορά</strong> — αν λείπει, μπαίνει σε εκκρεμότητα.</p>

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

  return (
    <div className={cn('rounded-2xl border p-3', over ? 'border-[color:var(--coral)]' : 'border-border')}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[0.8125rem] font-semibold">{c?.name ?? 'Χωρίς κατηγορία'}</span>
          {c?.mandatory && <span className="badge-pill warn shrink-0">Υποχρεωτική</span>}
          {c && <span className="text-[0.6875rem] text-muted-foreground">όριο: {c.limitLabel}</span>}
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[0.8125rem] font-bold tabular-nums">{EUR2.format(spent)} €</span>
          <Button type="button" size="sm" onClick={onAdd}><LuPlus className="size-3.5" aria-hidden /> Δαπάνη</Button>
        </div>
      </div>

      {/* Μπάρα ορίου */}
      {pctUsed != null && (
        <div className="mt-2">
          <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
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

      {/* Δαπάνες */}
      {expenses.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {expenses.map(e => <ExpenseRow key={e.id} expense={e} onReload={onReload} />)}
        </ul>
      )}
    </div>
  )
}

function ExpenseRow({ expense: e, onReload }: { expense: BudgetProposal['expenses'][number]; onReload: () => void }) {
  const fileRef = React.useRef<HTMLInputElement | null>(null)
  const [busy, setBusy] = React.useState(false)

  async function upload(file: File) {
    setBusy(true)
    try {
      const { base64, ext } = await readFileBase64(file)
      await uploadExpenseQuote(e.id, { name: file.name, base64, mimeType: file.type || 'application/octet-stream', ext })
      toast.success('Η προσφορά ανέβηκε.')
      onReload()
    } catch { toast.error('Το ανέβασμα απέτυχε.') } finally { setBusy(false) }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-2 gap-y-1 rounded-lg bg-card/60 px-2.5 py-1.5 text-[0.78125rem]">
      <span className="font-medium">{e.description}</span>
      {e.supplierName && <span className="text-[0.6875rem] text-muted-foreground">· {e.supplierName}{e.supplierAfm ? ` (${e.supplierAfm})` : ''}</span>}
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
          <DialogTitle>Νέα δαπάνη{category ? ` — ${category.name}` : ''}</DialogTitle>
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
