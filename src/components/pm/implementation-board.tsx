'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuChevronRight, LuCloudUpload, LuLoaderCircle, LuFileText, LuLandmark, LuSignature, LuCircleCheck, LuTriangleAlert,
  LuCircleAlert, LuEllipsisVertical, LuPencil, LuTrash2, LuEye, LuSparkles, LuX,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { FileViewerModal, type ViewerFile } from '@/components/ui/file-viewer-modal'
import { SupplierCertButton } from '@/components/programs/supplier-cert-dialog'
import { PayrollPanel } from './payroll-panel'
import { cn } from '@/lib/utils'
import {
  getImplementationBoard, addExpenseInvoice, attachInvoiceDoc, updateExpenseInvoice, updateInvoicePayment, removeInvoiceDoc, setQuotePolicy, detectQuotePolicy,
  type ImplementationBoard as Board, type BoardCategory, type BoardExpense, type BoardInvoice, type BoardPayment,
} from '@/lib/pm/expense-invoices'

/**
 * Υλοποίηση εγκεκριμένου έργου: δαπάνες ΑΝΑ ΚΑΤΗΓΟΡΙΑ (ανοίγουν/κλείνουν). Μέσα σε κάθε εγκεκριμένη δαπάνη τα
 * παραστατικά της — και για καθένα: το παραστατικό, το εξτρέ πληρωμής, η βεβαίωση προμηθευτή (όταν χρειάζεται) και
 * η διασταύρωση τους. Όλα ανεβαίνουν/διορθώνονται επί τόπου.
 */

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR') : null)
const MAX_UPLOAD = 8 * 1024 * 1024

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.includes(',') ? s.split(',')[1] : s) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}
async function toPayload(f: File) {
  if (f.size > MAX_UPLOAD) throw new Error(`Το «${f.name}» είναι πάνω από 8 MB — συμπιέστε το ή χωρίστε το.`)
  return { name: f.name, base64: await readBase64(f), mimeType: f.type || 'application/octet-stream' }
}

/** Μπάρα προόδου: τιμολογημένο (ανοιχτό) και πληρωμένο (σκούρο) επί του εγκεκριμένου. */
function Bar({ approved, invoiced, paid, label }: { approved: number; invoiced: number; paid: number; label: string }) {
  const pct = (v: number) => (approved > 0 ? Math.min(100, (v / approved) * 100) : 0)
  return (
    <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={label}>
      <div className="relative h-full">
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary/30" style={{ width: `${pct(invoiced)}%` }} />
        <div className="absolute inset-y-0 left-0 rounded-full bg-primary" style={{ width: `${pct(paid)}%` }} />
      </div>
    </div>
  )
}

const VERDICT = {
  OK: { label: 'Ταιριάζουν', cls: 'ok', icon: LuCircleCheck },
  PARTIAL: { label: 'Εκκρεμεί', cls: 'warn', icon: LuCircleAlert },
  MISMATCH: { label: 'Ασυμφωνία', cls: 'danger', icon: LuTriangleAlert },
  NONE: { label: 'Χωρίς πληρωμή', cls: 'muted', icon: LuCircleAlert },
} as const

export function ImplementationBoard({ applicationId, onChanged }: { applicationId: string; onChanged?: () => void }) {
  const [board, setBoard] = React.useState<Board | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [open, setOpen] = React.useState<Set<string>>(new Set())
  const [viewer, setViewer] = React.useState<ViewerFile | null>(null)

  const load = React.useCallback(() => {
    getImplementationBoard(applicationId)
      .then(b => {
        setBoard(b)
        setError(null)
        // Πρώτη φορά: ανοίγει η πρώτη κατηγορία με θέματα (αλλιώς η πρώτη).
        setOpen(prev => (prev.size ? prev : new Set([(b.categories.find(c => c.issues > 0) ?? b.categories[0])?.id ?? 'none'])))
      })
      .catch(() => setError('Η φόρτωση των δαπανών απέτυχε.'))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  const refresh = React.useCallback(() => { load(); onChanged?.() }, [load, onChanged])
  const toggle = (id: string) => setOpen(p => { const n = new Set(p); if (n.has(id)) n.delete(id); else n.add(id); return n })

  if (error) return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] border border-border bg-card px-4 py-3 text-[length:var(--fs-13)]">
      <span className="text-[color:var(--danger)]">{error}</span>
      <Button size="sm" variant="outline" onClick={() => load()}>Ξανά</Button>
    </div>
  )
  if (!board) return <div className="h-40 animate-pulse rounded-[18px] border border-border bg-muted/40" aria-label="Φόρτωση δαπανών" />

  const t = board.totals
  return (
    <section className="flex flex-col gap-3" aria-labelledby="impl-board-title">
      {/* Σύνοψη έργου */}
      <div className="rounded-[18px] border border-border bg-card p-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 id="impl-board-title" className="text-[length:var(--fs-15)] font-bold">Δαπάνες ανά κατηγορία</h2>
            <p className="mt-0.5 text-[length:var(--fs-12)] text-muted-foreground">Ανοίξτε μια κατηγορία για να δείτε τα παραστατικά κάθε δαπάνης, το εξτρέ πληρωμής και τη βεβαίωση προμηθευτή.</p>
          </div>
          <dl className="grid grid-cols-3 gap-x-6 gap-y-1 text-right text-[length:var(--fs-12)] tabular-nums">
            <div><dt className="text-muted-foreground">Εγκεκριμένα</dt><dd className="text-[length:var(--fs-14)] font-bold">{EUR.format(t.approved)}</dd></div>
            <div><dt className="text-muted-foreground">Παραστατικά</dt><dd className="text-[length:var(--fs-14)] font-bold">{EUR.format(t.invoiced)}</dd></div>
            <div><dt className="text-muted-foreground">Πληρωμένα</dt><dd className="text-[length:var(--fs-14)] font-bold text-primary">{EUR.format(t.paid)}</dd></div>
          </dl>
        </div>
        <div className="mt-3"><Bar approved={t.approved} invoiced={t.invoiced} paid={t.paid} label={`Τιμολογημένα ${EUR.format(t.invoiced)}, πληρωμένα ${EUR.format(t.paid)} από ${EUR.format(t.approved)}`} /></div>
        <div className="mt-3 flex flex-wrap items-center gap-2 text-[length:var(--fs-12)]">
          <span className="badge-pill muted" style={{ textTransform: 'none' }}>{t.invoices} παραστατικά</span>
          {t.issues > 0
            ? <span className="badge-pill warn" style={{ textTransform: 'none' }}><LuCircleAlert className="size-3" aria-hidden /> {t.issues} θέλουν προσοχή</span>
            : t.invoices > 0 && <span className="badge-pill ok" style={{ textTransform: 'none' }}><LuCircleCheck className="size-3" aria-hidden /> Όλα ταιριάζουν</span>}
          <QuotePolicy applicationId={applicationId} board={board} onChanged={() => load()} />
        </div>
      </div>

      {board.categories.length === 0 && (
        <div className="rounded-[18px] border border-dashed border-border bg-muted/30 px-4 py-8 text-center text-[length:var(--fs-13)] text-muted-foreground">
          Δεν υπάρχουν εγκεκριμένες δαπάνες. Καταχωρίστε το εγκριτικό από την κεφαλίδα του έργου.
        </div>
      )}

      {board.categories.map(c => (
        <CategorySection key={c.id ?? 'none'} cat={c} isOpen={open.has(c.id ?? 'none')} onToggle={() => toggle(c.id ?? 'none')} onChanged={refresh} onView={setViewer} />
      ))}

      <FileViewerModal open={!!viewer} onOpenChange={o => { if (!o) setViewer(null) }} file={viewer} />
    </section>
  )
}

function CategorySection({ cat, isOpen, onToggle, onChanged, onView }: { cat: BoardCategory; isOpen: boolean; onToggle: () => void; onChanged: () => void; onView: (f: ViewerFile) => void }) {
  const count = cat.expenses.reduce((a, e) => a + e.invoices.length, 0)
  const panelId = `cat-${cat.id ?? 'none'}`
  return (
    <div className="overflow-hidden rounded-[18px] border border-border bg-card">
      <button
        type="button" onClick={onToggle} aria-expanded={isOpen} aria-controls={panelId}
        className="flex min-h-14 w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-primary"
      >
        <LuChevronRight className={cn('size-4 shrink-0 text-muted-foreground transition-transform duration-200', isOpen && 'rotate-90')} aria-hidden />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-[length:var(--fs-13-5)] font-bold">{cat.name}</span>
            <span className="text-[length:var(--fs-11-5)] text-muted-foreground">{cat.expenses.length === 1 ? '1 δαπάνη' : `${cat.expenses.length} δαπάνες`} · {count === 1 ? '1 παραστατικό' : `${count} παραστατικά`}</span>
            {cat.issues > 0 && <span className="badge-pill warn" style={{ textTransform: 'none' }}><LuCircleAlert className="size-3" aria-hidden /> {cat.issues}</span>}
            {count === 0 && <span className="badge-pill muted" style={{ textTransform: 'none' }}>Χωρίς παραστατικά</span>}
          </div>
          <div className="mt-1.5 max-w-md"><Bar approved={cat.approved} invoiced={cat.invoiced} paid={cat.paid} label={`${cat.name}: πληρωμένα ${EUR.format(cat.paid)} από ${EUR.format(cat.approved)}`} /></div>
        </div>
        <div className="hidden shrink-0 text-right text-[length:var(--fs-12)] tabular-nums sm:block">
          <div className="font-bold">{EUR.format(cat.paid)} <span className="font-normal text-muted-foreground">/ {EUR.format(cat.approved)}</span></div>
          <div className="text-[length:var(--fs-11)] text-muted-foreground">πληρωμένα / εγκεκριμένα</div>
        </div>
      </button>
      {isOpen && (
        <div id={panelId} className="flex flex-col gap-3 border-t border-border bg-muted/20 p-3 sm:p-4">
          {cat.expenses.map(e => <ExpenseBlock key={e.id} exp={e} onChanged={onChanged} onView={onView} />)}
        </div>
      )}
    </div>
  )
}

function ExpenseBlock({ exp, onChanged, onView }: { exp: BoardExpense; onChanged: () => void; onView: (f: ViewerFile) => void }) {
  if (exp.kind === 'payroll') return <PayrollBlock exp={exp} onChanged={onChanged} onView={onView} />
  return <InvoicesBlock exp={exp} onChanged={onChanged} onView={onView} />
}

/** Δαπάνη προσωπικού: μισθολογικό κόστος (μισθοδοτικές, πληρωμές, νέοι εργαζόμενοι) αντί για παραστατικά. */
function PayrollBlock({ exp, onChanged, onView }: { exp: BoardExpense; onChanged: () => void; onView: (f: ViewerFile) => void }) {
  const p = exp.payroll
  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="px-3 py-2.5">
        <div className="text-[length:var(--fs-13)] font-semibold">{exp.description} <span className="badge-pill info ml-1" style={{ textTransform: 'none' }}>Μισθολογικό κόστος</span></div>
        <div className="text-[length:var(--fs-11-5)] text-muted-foreground tabular-nums">
          Εγκεκριμένο {EUR.format(exp.approved)}
          {p ? ` · ${p.hires} ${p.hires === 1 ? 'νέος εργαζόμενος' : 'νέοι εργαζόμενοι'} · ${p.months} μήνες · επιλέξιμο ${EUR.format(p.eligible)}` : ''}
          {p && p.unpaidMonths > 0 ? ` · ${p.unpaidMonths} μήνες χωρίς πλήρη πληρωμή` : ''}
        </div>
      </div>
      <PayrollPanel expenseId={exp.id} onChanged={onChanged} onView={onView} />
    </div>
  )
}

function InvoicesBlock({ exp, onChanged, onView }: { exp: BoardExpense; onChanged: () => void; onView: (f: ViewerFile) => void }) {
  const [busy, setBusy] = React.useState<string | null>(null)
  const [drag, setDrag] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const remaining = Math.round((exp.approved - exp.invoiced) * 100) / 100

  async function upload(files: FileList | File[]) {
    const list = [...files]
    let ok = 0
    for (const [i, f] of list.entries()) {
      setBusy(list.length > 1 ? `Ανάγνωση ${i + 1}/${list.length}: ${f.name}` : `Ανάγνωση: ${f.name}`)
      try {
        const r = await addExpenseInvoice(exp.id, await toPayload(f))
        if (!r.ok) toast.error(r.message); else ok++
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.') }
    }
    setBusy(null)
    if (ok) { toast.success(ok === 1 ? 'Το παραστατικό καταχωρίστηκε και διαβάστηκε.' : `Καταχωρίστηκαν ${ok} παραστατικά.`); onChanged() }
  }

  return (
    <div className="rounded-xl border border-border bg-card">
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0">
          <div className="text-[length:var(--fs-13)] font-semibold">{exp.description}</div>
          <div className="text-[length:var(--fs-11-5)] text-muted-foreground tabular-nums">
            Εγκεκριμένο {EUR.format(exp.approved)} · παραστατικά {EUR.format(exp.invoiced)}
            {remaining > 0.01 ? ` · απομένουν ${EUR.format(remaining)}` : remaining < -0.01 ? ` · υπέρβαση ${EUR.format(-remaining)}` : ''}
          </div>
        </div>
        <Button size="sm" onClick={() => inputRef.current?.click()} disabled={!!busy}>
          {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuCloudUpload className="size-3.5" aria-hidden />} Προσθήκη παραστατικού
        </Button>
        <input ref={inputRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => { if (e.target.files?.length) void upload(e.target.files); e.target.value = '' }} />
      </div>

      {exp.invoices.length > 0 ? (
        <ul className="divide-y divide-border border-t border-border">
          {exp.invoices.map(inv => <InvoiceRow key={inv.id} expenseId={exp.id} inv={inv} certNeeded={exp.certNeeded} onChanged={onChanged} onView={onView} />)}
        </ul>
      ) : null}

      {/* Ζώνη ρίψης — πάντα διαθέσιμη, μικρή όταν υπάρχουν ήδη παραστατικά. */}
      <div
        onDragOver={e => { e.preventDefault(); setDrag(true) }}
        onDragLeave={() => setDrag(false)}
        onDrop={e => { e.preventDefault(); setDrag(false); if (e.dataTransfer.files?.length) void upload(e.dataTransfer.files) }}
        className={cn('m-3 flex items-center justify-center gap-2 rounded-lg border-2 border-dashed px-3 text-center text-[length:var(--fs-12)] text-muted-foreground transition-colors',
          exp.invoices.length ? 'py-2' : 'py-6', drag ? 'border-primary bg-primary/5 text-primary' : 'border-border')}
      >
        {busy ? <><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> <span aria-live="polite">{busy}</span></> : <><LuCloudUpload className="size-4" aria-hidden /> Σύρετε εδώ παραστατικά (PDF/εικόνες) — διαβάζονται αυτόματα</>}
      </div>
    </div>
  )
}

function InvoiceRow({ expenseId, inv, certNeeded, onChanged, onView }: { expenseId: string; inv: BoardInvoice; certNeeded: boolean; onChanged: () => void; onView: (f: ViewerFile) => void }) {
  const [busy, setBusy] = React.useState<'payment' | 'cert' | 'del' | null>(null)
  const [details, setDetails] = React.useState(inv.matchVerdict === 'MISMATCH' || !!inv.readError)
  const [editing, setEditing] = React.useState(false)
  const payRef = React.useRef<HTMLInputElement>(null)
  const certRef = React.useRef<HTMLInputElement>(null)
  const v = VERDICT[inv.matchVerdict ?? 'NONE']
  const VIcon = v.icon

  async function attach(kind: 'payment' | 'cert', files: File[]) {
    setBusy(kind)
    let last: BoardInvoice | null = null
    for (const f of files) {
      try {
        const r = await attachInvoiceDoc(inv.id, kind, await toPayload(f))
        if (!r.ok) toast.error(r.message); else last = r.invoice
      } catch (err) { toast.error(err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.') }
    }
    if (last) {
      const nv = last.matchVerdict
      toast[nv === 'MISMATCH' ? 'warning' : 'success'](kind === 'payment' ? (files.length > 1 ? `Καταχωρίστηκαν ${files.length} έγγραφα πληρωμής.` : 'Η πληρωμή καταχωρίστηκε.') : 'Η βεβαίωση καταχωρίστηκε.', {
        description: nv === 'OK' ? 'Παραστατικό και πληρωμές ταιριάζουν.' : nv === 'MISMATCH' ? 'Βρέθηκε ασυμφωνία — δείτε τον έλεγχο.' : undefined,
      })
      if (nv !== 'OK') setDetails(true)
      onChanged()
    }
    setBusy(null)
  }
  async function remove(what: 'cert' | 'invoice' | { paymentId: string }) {
    if (what === 'invoice' && !window.confirm(`Διαγραφή του παραστατικού ${inv.number ?? inv.invoiceName} (μαζί με εξτρέ/βεβαίωση);`)) return
    setBusy('del')
    try { await removeInvoiceDoc(inv.id, what); onChanged() } catch { toast.error('Η αφαίρεση απέτυχε.') }
    setBusy(null)
  }
  const file = (kind: 'invoice' | 'cert', name: string | null) => onView({ name: name ?? kind, url: `/expense-invoice/${inv.id}/${kind}` })
  const payFile = (p: BoardPayment, idx: number, name: string) => onView({ name, url: `/expense-invoice/${inv.id}/payment?p=${p.id}&i=${idx}` })
  const unpaid = inv.totalAmount != null ? Math.round((inv.totalAmount - inv.paidAmount) * 100) / 100 : null

  return (
    <li className="px-3 py-2.5">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* Ταυτότητα παραστατικού */}
        <button type="button" onClick={() => file('invoice', inv.invoiceName)} className="flex min-w-0 flex-1 basis-56 cursor-pointer items-start gap-2 rounded-lg text-left hover:text-primary">
          <LuFileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
          <span className="min-w-0">
            <span className="block truncate text-[length:var(--fs-12-5)] font-semibold">{inv.number ? `Αρ. ${inv.number}` : inv.invoiceName}{inv.date ? ` · ${dt(inv.date)}` : ''}</span>
            <span className="block truncate text-[length:var(--fs-11-5)] text-muted-foreground">{inv.supplier ?? 'Προμηθευτής —'}{inv.supplierAfm ? ` · ΑΦΜ ${inv.supplierAfm}` : ''}</span>
          </span>
        </button>
        <div className="w-28 shrink-0 text-right text-[length:var(--fs-12-5)] font-semibold tabular-nums">{inv.totalAmount != null ? EUR.format(inv.totalAmount) : '—'}</div>

        {/* Πληρωμές (αποδεικτικά / εξτρέ — μία ή περισσότερες δόσεις) */}
        {busy === 'payment' ? (
          <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[length:var(--fs-11-5)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Ανάγνωση…</span>
        ) : inv.payments.length ? (
          <span className="inline-flex h-9 items-center rounded-full border border-[color:var(--success)]/50 text-[length:var(--fs-11-5)]">
            <button type="button" onClick={() => setDetails(true)} className="inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full pl-3 pr-2 font-semibold text-[color:var(--success)] hover:bg-[color:var(--success)]/8">
              <LuLandmark className="size-3.5" aria-hidden /> {inv.payments.length === 1 ? 'Πληρωμή' : `${inv.payments.length} πληρωμές`} <span className="font-normal text-foreground tabular-nums">· {EUR.format(inv.paidAmount)}</span>
            </button>
            <button type="button" onClick={() => payRef.current?.click()} aria-label="Προσθήκη πληρωμής" title="Προσθήκη πληρωμής (αποδεικτικό ή εξτρέ)" className="inline-flex h-full cursor-pointer items-center rounded-r-full pl-1 pr-2.5 text-muted-foreground hover:text-primary">
              <LuCloudUpload className="size-3.5" aria-hidden />
            </button>
          </span>
        ) : (
          <button type="button" onClick={() => payRef.current?.click()} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-[color:var(--warning)] px-3 text-[length:var(--fs-11-5)] font-semibold text-[color:var(--warning)] hover:bg-[color:var(--warning)]/8">
            <LuCloudUpload className="size-3.5" aria-hidden /> Πληρωμή / εξτρέ
          </button>
        )}
        <input ref={payRef} type="file" multiple accept="application/pdf,image/*" className="hidden" onChange={e => { if (e.target.files?.length) void attach('payment', [...e.target.files]); e.target.value = '' }} />

        {/* Βεβαίωση — μόνο όταν χρειάζεται (ή υπάρχει ήδη) */}
        {certNeeded || inv.hasCert ? (
          <div className="flex items-center gap-1">
            <DocSlot
              icon={LuSignature} label="Βεβαίωση" has={inv.hasCert} busy={busy === 'cert'} detail={inv.certStatus === 'SIGNED' ? 'υπογράφηκε' : null}
              onView={() => file('cert', inv.certName)} onUpload={() => certRef.current?.click()} onRemove={() => void remove('cert')}
            />
            {!inv.hasCert && <SupplierCertButton expenseId={expenseId} invoiceId={inv.id} status={inv.certStatus} onChanged={onChanged} label="Δημιουργία & αποστολή" />}
            <input ref={certRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void attach('cert', [f]); e.target.value = '' }} />
          </div>
        ) : (
          <span className="text-[length:var(--fs-11)] text-muted-foreground" title="Η βεβαίωση προμηθευτή χρειάζεται μόνο σε αγορές εξοπλισμού/μηχανημάτων/λογισμικού.">Βεβαίωση: δεν απαιτείται</span>
        )}

        {/* Αποτέλεσμα διασταύρωσης */}
        <button type="button" onClick={() => setDetails(d => !d)} aria-expanded={details} className={`badge-pill ${v.cls} cursor-pointer`} style={{ textTransform: 'none' }}>
          <VIcon className="size-3" aria-hidden /> {v.label}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger render={
            <button type="button" aria-label="Ενέργειες παραστατικού" className="inline-flex size-9 items-center justify-center rounded-lg text-muted-foreground hover:bg-muted hover:text-foreground">
              {busy === 'del' ? <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> : <LuEllipsisVertical className="size-4" aria-hidden />}
            </button>
          } />
          <DropdownMenuContent align="end" className="w-max min-w-52">
            <DropdownMenuItem onClick={() => file('invoice', inv.invoiceName)}><LuEye className="size-3.5" aria-hidden /> Προβολή παραστατικού</DropdownMenuItem>
            <DropdownMenuItem onClick={() => { setEditing(true); setDetails(true) }}><LuPencil className="size-3.5" aria-hidden /> Διόρθωση στοιχείων</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem variant="destructive" onClick={() => void remove('invoice')}><LuTrash2 className="size-3.5" aria-hidden /> Διαγραφή παραστατικού</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {details && (
        <div className="mt-2 ml-6 flex flex-col gap-2 rounded-lg border border-border bg-muted/30 p-3 text-[length:var(--fs-12)]">
          {inv.readError && <p className="text-[color:var(--warning)]">Δεν διαβάστηκε αυτόματα: {inv.readError.slice(0, 160)}</p>}
          {inv.payments.length > 0 && (
            <div className="flex flex-col gap-1">
              <div className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">
                Πληρωμές{unpaid != null && unpaid > 0.01 ? ` — υπόλοιπο ${EUR.format(unpaid)}` : ''}
              </div>
              <ul className="flex flex-col divide-y divide-border rounded-md border border-border bg-card">
                {inv.payments.map((p, k) => <PaymentRow key={p.id} n={k + 1} p={p} onView={(idx, name) => payFile(p, idx, name)} onRemove={() => void remove({ paymentId: p.id })} onChanged={onChanged} />)}
              </ul>
            </div>
          )}
          {inv.checks.length > 0 ? (
            <ul className="flex flex-col gap-1">
              {inv.checks.map((c, i) => (
                <li key={i} className="flex items-start gap-1.5">
                  {c.ok ? <LuCircleCheck className="mt-0.5 size-3.5 shrink-0 text-[color:var(--success)]" aria-label="Εντάξει" /> : <LuCircleAlert className="mt-0.5 size-3.5 shrink-0 text-[color:var(--warning)]" aria-label="Προσοχή" />}
                  <span>{c.text}</span>
                </li>
              ))}
            </ul>
          ) : <p className="text-muted-foreground">Ανεβάστε το εξτρέ πληρωμής για να γίνει η διασταύρωση.</p>}
          {editing
            ? <EditForm inv={inv} onDone={changed => { setEditing(false); if (changed) onChanged() }} />
            : <button type="button" onClick={() => setEditing(true)} className="self-start text-[length:var(--fs-11-5)] font-semibold text-primary hover:underline">Διόρθωση στοιχείων</button>}
        </div>
      )}
    </li>
  )
}

function DocSlot({ icon: Icon, label, has, busy, detail, onView, onUpload, onRemove }: {
  icon: React.ComponentType<{ className?: string; 'aria-hidden'?: boolean }>; label: string; has: boolean; busy: boolean; detail: string | null
  onView: () => void; onUpload: () => void; onRemove: () => void
}) {
  if (busy) return <span className="inline-flex h-9 items-center gap-1.5 rounded-full border border-border px-3 text-[length:var(--fs-11-5)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Ανάγνωση…</span>
  if (!has) {
    return (
      <button type="button" onClick={onUpload} className="inline-flex h-9 cursor-pointer items-center gap-1.5 rounded-full border border-dashed border-[color:var(--warning)] px-3 text-[length:var(--fs-11-5)] font-semibold text-[color:var(--warning)] hover:bg-[color:var(--warning)]/8">
        <LuCloudUpload className="size-3.5" aria-hidden /> {label}
      </button>
    )
  }
  return (
    <span className="inline-flex h-9 items-center rounded-full border border-[color:var(--success)]/50 text-[length:var(--fs-11-5)]">
      <button type="button" onClick={onView} className="inline-flex h-full cursor-pointer items-center gap-1.5 rounded-l-full pl-3 pr-2 font-semibold text-[color:var(--success)] hover:bg-[color:var(--success)]/8" title={`Προβολή: ${label}`}>
        <Icon className="size-3.5" aria-hidden /> {label}{detail ? <span className="font-normal text-foreground tabular-nums">· {detail}</span> : null}
      </button>
      <button type="button" onClick={onRemove} aria-label={`Αφαίρεση: ${label}`} className="inline-flex h-full cursor-pointer items-center rounded-r-full pl-1 pr-2.5 text-muted-foreground hover:text-[color:var(--danger)]">
        <LuX className="size-3.5" aria-hidden />
      </button>
    </span>
  )
}

/** Αριθμός σε ελληνική ή αγγλική γραφή (12.152,00 / 12152.00). */
function num(s: string): number | null {
  const x = Number(s.replace(/\s|€/g, '').replace(/\.(?=\d{3}(\D|$))/g, '').replace(',', '.'))
  return s.trim() && Number.isFinite(x) ? x : null
}

function PaymentRow({ n, p, onView, onRemove, onChanged }: { n: number; p: BoardPayment; onView: (idx: number, name: string) => void; onRemove: () => void; onChanged: () => void }) {
  const [edit, setEdit] = React.useState(false)
  const [f, setF] = React.useState({ amount: p.amount?.toString() ?? '', paidAt: p.paidAt ?? '', payee: p.payee ?? '' })
  const [saving, setSaving] = React.useState(false)
  async function save() {
    setSaving(true)
    try { await updateInvoicePayment(p.id, { amount: num(f.amount), paidAt: f.paidAt || null, payee: f.payee }); setEdit(false); onChanged() } catch { toast.error('Η αποθήκευση απέτυχε.') }
    setSaving(false)
  }
  return (
    <li className="flex flex-col gap-2 px-2.5 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="w-5 text-[length:var(--fs-11)] text-muted-foreground tabular-nums">{n}.</span>
        <span className="w-24 font-semibold tabular-nums">{p.amount != null ? EUR.format(p.amount) : <span className="text-[color:var(--warning)]">ποσό;</span>}</span>
        <span className="w-24 tabular-nums text-muted-foreground">{dt(p.paidAt) ?? 'ημ/νία;'}</span>
        <span className="min-w-0 flex-1 truncate text-muted-foreground">{p.payee ?? '—'}</span>
        <span className="flex flex-wrap gap-1">
          {p.docs.map(d => (
            <button key={d.idx} type="button" onClick={() => onView(d.idx, d.name)} className="inline-flex h-7 cursor-pointer items-center gap-1 rounded-full border border-border px-2 text-[length:var(--fs-11)] hover:border-primary hover:text-primary" title={d.name}>
              <LuEye className="size-3" aria-hidden /> {/εξτρ|extrait/i.test(d.name) ? 'Εξτρέ' : 'Αποδεικτικό'}
            </button>
          ))}
        </span>
        <button type="button" onClick={() => setEdit(e => !e)} aria-label="Διόρθωση πληρωμής" className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground"><LuPencil className="size-3.5" aria-hidden /></button>
        <button type="button" onClick={onRemove} aria-label="Αφαίρεση πληρωμής" className="inline-flex size-7 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-[color:var(--danger)]"><LuTrash2 className="size-3.5" aria-hidden /></button>
      </div>
      {p.readError && <p className="text-[length:var(--fs-11)] text-[color:var(--warning)]">Δεν διαβάστηκε αυτόματα — συμπληρώστε τα στοιχεία.</p>}
      {edit && (
        <div className="flex flex-wrap items-end gap-2">
          <label className="flex flex-col gap-1"><span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Ποσό €</span><Input value={f.amount} inputMode="decimal" onChange={e => setF(x => ({ ...x, amount: e.target.value }))} className="h-9 w-32" /></label>
          <label className="flex flex-col gap-1"><span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Ημερομηνία</span><Input type="date" value={f.paidAt} onChange={e => setF(x => ({ ...x, paidAt: e.target.value }))} className="h-9 w-40" /></label>
          <label className="flex min-w-48 flex-1 flex-col gap-1"><span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Δικαιούχος</span><Input value={f.payee} onChange={e => setF(x => ({ ...x, payee: e.target.value }))} className="h-9" /></label>
          <Button size="sm" onClick={() => void save()} disabled={saving}>{saving && <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden />} Αποθήκευση</Button>
        </div>
      )}
    </li>
  )
}

function EditForm({ inv, onDone }: { inv: BoardInvoice; onDone: (changed: boolean) => void }) {
  const [f, setF] = React.useState({
    number: inv.number ?? '', date: inv.date ?? '', supplier: inv.supplier ?? '', supplierAfm: inv.supplierAfm ?? '',
    totalAmount: inv.totalAmount?.toString() ?? '', netAmount: inv.netAmount?.toString() ?? '',
  })
  const [saving, setSaving] = React.useState(false)
  async function save() {
    setSaving(true)
    try {
      await updateExpenseInvoice(inv.id, {
        number: f.number, date: f.date || null, supplier: f.supplier, supplierAfm: f.supplierAfm,
        totalAmount: num(f.totalAmount), netAmount: num(f.netAmount),
      })
      toast.success('Τα στοιχεία αποθηκεύτηκαν — έγινε νέα διασταύρωση.')
      onDone(true)
    } catch { toast.error('Η αποθήκευση απέτυχε.') }
    setSaving(false)
  }
  const field = (k: keyof typeof f, label: string, type = 'text') => (
    <label className="flex flex-col gap-1">
      <span className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">{label}</span>
      <Input type={type} value={f[k]} onChange={e => setF(p => ({ ...p, [k]: e.target.value }))} className="h-9" inputMode={type === 'text' && /Amount/.test(k) ? 'decimal' : undefined} />
    </label>
  )
  return (
    <div className="flex flex-col gap-2 border-t border-border pt-2">
      <div className="grid gap-2 sm:grid-cols-3">
        {field('number', 'Αριθμός παραστατικού')}
        {field('date', 'Ημερομηνία', 'date')}
        {field('totalAmount', 'Σύνολο (με ΦΠΑ) €')}
        {field('supplier', 'Προμηθευτής')}
        {field('supplierAfm', 'ΑΦΜ προμηθευτή')}
        {field('netAmount', 'Καθαρό (χωρίς ΦΠΑ) €')}
      </div>
      <div className="flex gap-2">
        <Button size="sm" onClick={() => void save()} disabled={saving}>{saving && <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden />} Αποθήκευση</Button>
        <Button size="sm" variant="outline" onClick={() => onDone(false)} disabled={saving}>Άκυρο</Button>
      </div>
    </div>
  )
}

/** Κανόνας προσφοράς του προγράμματος — από τον οδηγό (AI) ή χειροκίνητα. */
function QuotePolicy({ applicationId, board, onChanged }: { applicationId: string; board: Board; onChanged: () => void }) {
  const [busy, setBusy] = React.useState(false)
  const label = board.quotePolicyLabel
  async function detect() {
    setBusy(true)
    try {
      const r = await detectQuotePolicy(applicationId)
      if (!r.ok) toast.error(r.message)
      else { toast.success(r.policy ? 'Ο κανόνας προσφορών διαβάστηκε από τον οδηγό.' : 'Ο οδηγός δεν το αναφέρει ρητά — ορίστε το χειροκίνητα.', { description: r.note }); onChanged() }
    } catch { toast.error('Ο έλεγχος απέτυχε.') }
    setBusy(false)
  }
  async function set(p: 'REQUIRED' | 'OPTIONAL') {
    setBusy(true)
    try { await setQuotePolicy(applicationId, p); onChanged() } catch { toast.error('Η αλλαγή απέτυχε.') }
    setBusy(false)
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger render={
        <button type="button" title={board.quotePolicyNote ?? undefined} className={cn('badge-pill cursor-pointer', board.quotePolicy === null ? 'warn' : 'info')} style={{ textTransform: 'none' }}>
          {busy ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : null} {label}
        </button>
      } />
      <DropdownMenuContent align="start" className="w-max min-w-64">
        {board.quotePolicyNote && <p className="max-w-72 px-2 py-1.5 text-[length:var(--fs-11-5)] text-muted-foreground">{board.quotePolicyNote}</p>}
        <DropdownMenuItem onClick={() => void detect()}><LuSparkles className="size-3.5" aria-hidden /> Έλεγχος στον οδηγό του προγράμματος</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void set('OPTIONAL')}>Δεν απαιτούνται προσφορές</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void set('REQUIRED')}>Απαιτούνται προσφορές</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
