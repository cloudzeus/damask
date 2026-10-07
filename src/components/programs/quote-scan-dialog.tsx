'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuScanText, LuLoaderCircle, LuCloudUpload, LuBuilding2, LuSparkles, LuTriangleAlert, LuCircleCheck, LuFileText,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import {
  scanQuoteForApplication, createExpensesFromQuote,
  type ProposalCategory, type QuoteScan, type QuoteLine,
} from '@/lib/programs/expense-proposal'

/**
 * C4 — Κύκλωμα προσφορών: σάρωση προσφοράς → προμηθευτής (ΑΦΜ → ΑΑΔΕ) → ΟΛΕΣ οι γραμμές
 * με πρόταση κατηγορίας δαπάνης → δαπάνες στο έργο (μία ανά γραμμή ή ανά κατηγορία) με
 * την προσφορά συνημμένη. Ο χρήστης ελέγχει/διορθώνει πριν τη δημιουργία.
 */

const NONE = '__none__'
const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })

type Row = QuoteLine & { key: string; include: boolean }

function readFileBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => {
      const res = String(r.result)
      resolve({ base64: res.includes(',') ? res.split(',')[1] : res, ext: file.name.includes('.') ? file.name.split('.').pop()! : 'pdf' })
    }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function QuoteScanDialog({
  applicationId, categories, open, onOpenChange, onSaved,
}: {
  applicationId: string
  categories: ProposalCategory[]
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: () => void
}) {
  const [file, setFile] = React.useState<File | null>(null)
  const [phase, setPhase] = React.useState<'pick' | 'reading' | 'review' | 'saving'>('pick')
  const [scan, setScan] = React.useState<QuoteScan | null>(null)
  const [rows, setRows] = React.useState<Row[]>([])
  const [groupBy, setGroupBy] = React.useState<'line' | 'category'>('line')
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  const [prevOpen, setPrevOpen] = React.useState(open)
  if (open !== prevOpen) {
    setPrevOpen(open)
    if (open) { setFile(null); setPhase('pick'); setScan(null); setRows([]); setGroupBy('line') }
  }

  async function read(f: File) {
    if (!/pdf|image\//.test(f.type)) { toast.error('Ανέβασε PDF ή εικόνα της προσφοράς.'); return }
    setFile(f)
    setPhase('reading')
    try {
      const { base64 } = await readFileBase64(f)
      const res = await scanQuoteForApplication(applicationId, { base64, mimeType: f.type })
      if (!res.ok) { toast.error(res.message); setPhase('pick'); return }
      setScan(res.scan)
      setRows(res.scan.lines.map((l, i) => ({ ...l, key: `l${i}`, include: true })))
      setPhase('review')
      if (res.scan.lines.length === 0) toast.warning('Δεν βρέθηκαν γραμμές προϊόντων — πρόσθεσέ τες χειροκίνητα ή δοκίμασε καθαρότερο αρχείο.')
    } catch {
      toast.error('Η ανάγνωση της προσφοράς απέτυχε.')
      setPhase('pick')
    }
  }

  const patch = (key: string, p: Partial<Row>) => setRows(prev => prev.map(r => (r.key === key ? { ...r, ...p } : r)))
  const chosen = rows.filter(r => r.include && r.total > 0 && r.description.trim())
  const totalNet = chosen.reduce((a, r) => a + r.total, 0)

  // Σύνοψη ανά κατηγορία έναντι υπολοίπου ορίου της κατηγορίας.
  const sumByCat = new Map<string, number>()
  for (const r of chosen) sumByCat.set(r.categoryId ?? NONE, (sumByCat.get(r.categoryId ?? NONE) ?? 0) + r.total)
  const perCat = [...sumByCat.entries()].map(([id, sum]) => {
    const c = categories.find(x => x.id === id)
    return { id, name: c?.name ?? 'Χωρίς κατηγορία', sum, remaining: c?.remaining ?? null }
  })

  async function save() {
    if (!scan || !file) return
    if (chosen.length === 0) { toast.error('Επίλεξε τουλάχιστον μία γραμμή.'); return }
    setPhase('saving')
    try {
      const { base64, ext } = await readFileBase64(file)
      const res = await createExpensesFromQuote(applicationId, {
        supplierAfm: scan.supplier.afm,
        supplierTrdrId: scan.supplier.existing?.id ?? null,
        docNumber: scan.docNumber,
        date: scan.date,
        groupBy,
        lines: chosen.map(r => ({ description: r.description, quantity: r.quantity, unitPrice: r.unitPrice, vatPct: r.vatPct, total: r.total, categoryId: r.categoryId, categoryReason: r.categoryReason })),
        quote: { name: file.name.replace(/\.[^.]+$/, ''), base64, mimeType: file.type, ext },
      })
      if (!res.ok) { toast.error(res.message); setPhase('review'); return }
      toast.success(`Δημιουργήθηκαν ${res.created} δαπάνες από την προσφορά.`, {
        description: res.supplier
          ? `${res.supplierCreated ? 'Νέος προμηθευτής από ΑΑΔΕ' : 'Προμηθευτής'}: ${res.supplier.name}${res.supplier.afm ? ` (ΑΦΜ ${res.supplier.afm})` : ''} — συνδέθηκε με τον πελάτη. Η προσφορά επισυνάφθηκε σε όλες.`
          : 'Χωρίς προμηθευτή (δεν βρέθηκε ΑΦΜ) — όρισέ τον στις δαπάνες.',
      })
      onSaved()
      onOpenChange(false)
    } catch {
      toast.error('Η δημιουργία δαπανών απέτυχε.')
      setPhase('review')
    }
  }

  const catItems = [{ id: NONE, name: 'Χωρίς κατηγορία' }, ...categories.map(c => ({ id: c.id, name: c.name }))]

  return (
    <Dialog open={open} onOpenChange={o => { if (phase !== 'saving' && phase !== 'reading') onOpenChange(o) }}>
      <DialogContent className="glass sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LuScanText className="size-4 text-primary" aria-hidden /> Σάρωση προσφοράς</DialogTitle>
          <DialogDescription>
            Ανέβασε την προσφορά του προμηθευτή — αναγνωρίζονται ο προμηθευτής (ΑΦΜ) και όλα τα είδη με πρόταση κατηγορίας. Έλεγξε και δημιούργησε τις δαπάνες με ένα κλικ.
          </DialogDescription>
        </DialogHeader>

        {phase === 'pick' && (
          <div
            role="button"
            tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void read(f) }}
            className={cn('flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors', dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50')}
          >
            <LuCloudUpload className="size-7 text-primary" aria-hidden />
            <p className="text-[length:var(--fs-13)] font-semibold">Σύρε την προσφορά εδώ ή πάτησε για επιλογή</p>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">PDF ή φωτογραφία (και σαρωμένη)</p>
            <input ref={inputRef} type="file" accept="application/pdf,image/*" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = '' }} />
          </div>
        )}

        {phase === 'reading' && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-10 text-center">
            <LuLoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
            <p className="text-[length:var(--fs-13)] font-semibold">Ανάγνωση προσφοράς «{file?.name}»…</p>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">Προμηθευτής, είδη, ποσά και κατηγορίες δαπάνης</p>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && scan && (
          <div className="flex flex-col gap-3">
            {/* Προμηθευτής + στοιχεία προσφοράς */}
            <div className="flex flex-wrap items-center gap-x-4 gap-y-2 rounded-xl border border-border bg-card px-3 py-2.5">
              <LuBuilding2 className="size-4 shrink-0 text-primary" aria-hidden />
              <div className="min-w-0 flex-1">
                <div className="truncate text-[length:var(--fs-13)] font-bold">{scan.supplier.existing?.name ?? scan.supplier.name ?? 'Προμηθευτής χωρίς επωνυμία'}</div>
                <div className="text-[length:var(--fs-11-5)] text-muted-foreground">
                  {scan.supplier.afm ? `ΑΦΜ ${scan.supplier.afm}` : 'Δεν βρέθηκε ΑΦΜ'}
                  {' · '}
                  {scan.supplier.existing
                    ? <span className="font-semibold text-[color:var(--success)]">υπάρχει στους προμηθευτές</span>
                    : scan.supplier.afm
                      ? <span className="font-semibold text-primary">θα δημιουργηθεί από ΑΑΔΕ</span>
                      : <span className="font-semibold text-[color:var(--warning)]">θα οριστεί αργότερα</span>}
                </div>
              </div>
              <div className="text-[length:var(--fs-11-5)] text-muted-foreground">
                {scan.docNumber && <>Αρ. <b className="text-foreground">{scan.docNumber}</b> · </>}
                {scan.date && <>{new Date(scan.date).toLocaleDateString('el-GR')} · </>}
                <span className="inline-flex items-center gap-1"><LuFileText className="size-3.5" aria-hidden />{file?.name}</span>
              </div>
            </div>

            {/* Γραμμές */}
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-[length:var(--fs-12)]">
                <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="w-8 px-2 py-2"><span className="sr-only">Επιλογή</span></th>
                    <th className="px-2 py-2">Είδος / υπηρεσία</th>
                    <th className="w-16 px-2 py-2 text-right">Ποσ.</th>
                    <th className="w-24 px-2 py-2 text-right">Τιμή μον.</th>
                    <th className="w-28 px-2 py-2 text-right">Καθαρό</th>
                    <th className="w-56 px-2 py-2">Κατηγορία δαπάνης</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map(r => (
                    <tr key={r.key} className={cn('border-t border-border align-middle', !r.include && 'opacity-50')}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={r.include} onChange={e => patch(r.key, { include: e.target.checked })} aria-label={`Συμπερίληψη: ${r.description}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <input
                          value={r.description}
                          onChange={e => patch(r.key, { description: e.target.value })}
                          className="w-full min-w-[14rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 font-semibold outline-none hover:border-border focus:border-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.quantity ?? '—'}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{r.unitPrice != null ? EUR.format(r.unitPrice) : '—'}</td>
                      <td className="px-2 py-1.5 text-right">
                        <input
                          type="number"
                          step="0.01"
                          value={r.total}
                          onChange={e => patch(r.key, { total: Number(e.target.value) || 0 })}
                          className="w-28 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-right font-semibold tabular-nums outline-none hover:border-border focus:border-ring"
                        />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <Select value={r.categoryId ?? NONE} onValueChange={v => patch(r.key, { categoryId: v === NONE ? null : (v ?? null), categoryReason: null })}>
                            <SelectTrigger className="h-8 w-full rounded-full border-border bg-card px-2.5 text-[length:var(--fs-11-5)]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {catItems.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                            </SelectContent>
                          </Select>
                          {r.categoryReason && <span title={`AI: ${r.categoryReason}`}><LuSparkles className="size-3.5 shrink-0 text-primary" aria-label="Πρόταση AI" /></span>}
                        </div>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && (
                    <tr><td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">Δεν αναγνωρίστηκαν γραμμές.</td></tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* Σύνοψη & ομαδοποίηση */}
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1 text-[length:var(--fs-11-5)]">
                {perCat.map(c => {
                  const over = c.remaining != null && c.sum > c.remaining
                  return (
                    <span key={c.id} className={cn('flex items-center gap-1.5', over ? 'text-[color:var(--warning)]' : 'text-muted-foreground')}>
                      {over ? <LuTriangleAlert className="size-3.5" aria-hidden /> : <LuCircleCheck className="size-3.5 text-[color:var(--success)]" aria-hidden />}
                      <b className="text-foreground">{c.name}</b>: {EUR.format(c.sum)}
                      {c.remaining != null && <> · υπόλοιπο ορίου {EUR.format(c.remaining)}{over ? ' — υπέρβαση' : ''}</>}
                    </span>
                  )
                })}
              </div>
              <div className="flex flex-col items-end gap-1.5">
                <div className="inline-flex rounded-full border border-border bg-card p-0.5 text-[length:var(--fs-11-5)] font-semibold" role="radiogroup" aria-label="Τρόπος δημιουργίας δαπανών">
                  {([['line', 'Μία δαπάνη ανά είδος'], ['category', 'Μία ανά κατηγορία']] as const).map(([v, label]) => (
                    <button
                      key={v}
                      type="button"
                      role="radio"
                      aria-checked={groupBy === v}
                      onClick={() => setGroupBy(v)}
                      className={cn('rounded-full px-3 py-1', groupBy === v ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:text-foreground')}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <span className="text-[length:var(--fs-12)]">
                  Σύνολο επιλεγμένων: <b className="tabular-nums">{EUR.format(totalNet)}</b> <span className="text-muted-foreground">(χωρίς ΦΠΑ)</span>
                </span>
              </div>
            </div>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => { setPhase('pick'); setScan(null); setRows([]) }} disabled={phase === 'saving'}>Άλλη προσφορά</Button>
            <Button type="button" onClick={save} disabled={phase === 'saving' || chosen.length === 0}>
              {phase === 'saving' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuCircleCheck className="size-3.5" aria-hidden />}
              Δημιουργία {groupBy === 'line' ? chosen.length : perCat.length} δαπανών
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
