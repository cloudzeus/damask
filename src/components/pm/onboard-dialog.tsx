'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { FolderInput, Search, X, LoaderCircle, Plus, CheckCircle2, AlertTriangle, ArrowRight, ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Combobox } from '@/components/ui/combobox'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { parseGreekNumber } from '@/lib/tax/greek-format'
import {
  getOnboardForms, searchOnboardCustomers, findOrCreateCustomerByAfm, onboardApprovedApplications, listOnboardPrograms,
  type OnboardForm, type OnboardCustomer, type OnboardResult,
} from '@/lib/pm/onboard'

type Row = OnboardCustomer & { opskeRef: string; budget: string; subsidy: string }
const STEPS = ['Πελάτες', 'Δικαιολογητικά', 'Εισαγωγή'] as const
const STAGE_TEXT: Record<string, string> = { DOCUMENTS: 'Δικαιολογητικά', INSPECTION: 'Υλοποίηση — δαπάνες' }

/**
 * «Έργο σε εξέλιξη»: εισαγωγή πελατών με ΗΔΗ εγκεκριμένη πρόταση — συνεχίζουν από τα δικαιολογητικά που
 * χρειάζονται ακόμη και μετά τις δαπάνες μέχρι την ολοκλήρωση. Από τη σελίδα προγράμματος (programId) ή από τα Έργα.
 */
export function OnboardDialog({ programId: fixedProgramId, label = 'Έργο σε εξέλιξη' }: { programId?: string; label?: string }) {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState(0)
  const [programs, setPrograms] = React.useState<{ id: string; title: string }[]>([])
  const [programId, setProgramId] = React.useState<string | null>(fixedProgramId ?? null)
  const [approvedAt, setApprovedAt] = React.useState('')
  const [rows, setRows] = React.useState<Row[]>([])
  const [query, setQuery] = React.useState('')
  const [hits, setHits] = React.useState<OnboardCustomer[]>([])
  const [searching, setSearching] = React.useState(false)
  const [forms, setForms] = React.useState<OnboardForm[] | null>(null)
  const [needed, setNeeded] = React.useState<Set<string>>(new Set())
  const [busy, setBusy] = React.useState(false)
  const [results, setResults] = React.useState<OnboardResult[] | null>(null)

  function reset() {
    setStep(0); setRows([]); setQuery(''); setHits([]); setForms(null); setResults(null); setApprovedAt('')
    if (!fixedProgramId) setProgramId(null)
  }

  React.useEffect(() => {
    if (!open || fixedProgramId || programs.length) return
    listOnboardPrograms().then(setPrograms).catch(() => toast.error('Δεν φορτώθηκαν τα προγράμματα.'))
  }, [open, fixedProgramId, programs.length])

  React.useEffect(() => {
    if (!programId) return
    let alive = true
    getOnboardForms(programId).then(f => {
      if (!alive) return
      setForms(f)
      setNeeded(new Set(f.filter(x => x.neededNow).map(x => x.id)))
    }).catch(() => { if (alive) setForms([]) })
    return () => { alive = false }
  }, [programId])

  // Αναζήτηση πελατών (debounce 250ms).
  React.useEffect(() => {
    if (!programId || query.trim().length < 2) return
    let alive = true
    const t = setTimeout(() => {
      setSearching(true)
      searchOnboardCustomers(programId, query).then(r => { if (alive) setHits(r) }).catch(() => {}).finally(() => { if (alive) setSearching(false) })
    }, 250)
    return () => { alive = false; clearTimeout(t) }
  }, [query, programId])

  function add(c: OnboardCustomer) {
    setRows(prev => (prev.some(r => r.id === c.id) ? prev : [...prev, { ...c, opskeRef: '', budget: '', subsidy: '' }]))
    setQuery(''); setHits([])
  }
  const patch = (id: string, p: Partial<Row>) => setRows(prev => prev.map(r => (r.id === id ? { ...r, ...p } : r)))

  const afmQuery = query.replace(/\D/g, '')
  async function addByAfm() {
    if (!programId) return
    setSearching(true)
    try {
      const r = await findOrCreateCustomerByAfm(programId, afmQuery)
      if (!r.ok) { toast.error(r.message); return }
      add(r.customer)
      if (r.created) toast.success(`Νέος πελάτης από την ΑΑΔΕ: ${r.customer.name}`)
    } finally { setSearching(false) }
  }

  async function submit() {
    if (!programId || !rows.length) return
    setBusy(true)
    try {
      const res = await onboardApprovedApplications({
        programId,
        items: rows.map(r => ({
          trdrId: r.id, opskeRef: r.opskeRef.trim() || null,
          approvedBudget: parseGreekNumber(r.budget), publicSubsidy: parseGreekNumber(r.subsidy), approvedAt: approvedAt || null,
        })),
        doneFormIds: (forms ?? []).filter(f => !needed.has(f.id)).map(f => f.id),
      })
      setResults(res)
      const ok = res.filter(r => r.applicationId).length
      toast.success(`Εισήχθησαν ${ok} από ${res.length} έργα.`)
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η εισαγωγή απέτυχε.')
    } finally { setBusy(false) }
  }

  const canNext = step === 0 ? !!programId && rows.length > 0 : true
  const neededCount = forms?.filter(f => needed.has(f.id)).length ?? 0

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <FolderInput className="size-4" aria-hidden /> {label}
      </Button>
      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="sm:max-w-3xl">
          <DialogHeader>
            <DialogTitle>Έργο σε εξέλιξη — εγκεκριμένες προτάσεις</DialogTitle>
            <DialogDescription>
              Προσθέστε πελάτες που έχουν ήδη έγκριση. Συνεχίζετε από τα δικαιολογητικά που χρειάζονται ακόμη και μετά τις δαπάνες, μέχρι την ολοκλήρωση.
            </DialogDescription>
          </DialogHeader>

          {!results && (
            <ol className="flex items-center gap-2 text-[length:var(--fs-12)]" aria-label="Βήματα">
              {STEPS.map((s, i) => (
                <li key={s} className="flex items-center gap-2">
                  <span className={cn('grid size-6 place-items-center rounded-full text-[length:var(--fs-11)] font-bold', i <= step ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground')} aria-current={i === step ? 'step' : undefined}>{i + 1}</span>
                  <span className={cn(i === step ? 'font-semibold' : 'text-muted-foreground')}>{s}</span>
                  {i < STEPS.length - 1 && <span className="h-px w-6 bg-border" aria-hidden />}
                </li>
              ))}
            </ol>
          )}

          <div className="max-h-[62vh] overflow-y-auto pr-1">
            {results ? (
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {results.map(r => (
                  <li key={r.trdrId} className="flex flex-wrap items-center gap-3 px-3 py-2.5">
                    {r.applicationId ? <CheckCircle2 className="size-4 text-emerald-600" aria-hidden /> : <AlertTriangle className="size-4 text-rose-600" aria-hidden />}
                    <span className="min-w-0 flex-1 font-semibold">{r.name}</span>
                    {r.applicationId ? (
                      <>
                        <span className="text-[length:var(--fs-12)] text-muted-foreground">
                          Επόμενο: {STAGE_TEXT[r.stage ?? ''] ?? r.stage}{r.pendingForms ? ` · ${r.pendingForms} δικαιολογητικά εκκρεμούν` : ''}
                        </span>
                        <Link href={`/programs/${programId}/applications/${r.applicationId}`} className="inline-flex items-center gap-1 text-[length:var(--fs-12-5)] font-semibold text-primary hover:underline">
                          Άνοιγμα έργου <ArrowRight className="size-3.5" aria-hidden />
                        </Link>
                      </>
                    ) : <span className="w-full text-[length:var(--fs-12)] text-rose-700 dark:text-rose-400">{r.message}</span>}
                  </li>
                ))}
              </ul>
            ) : step === 0 ? (
              <div className="flex flex-col gap-4">
                <div className={cn('grid gap-3', !fixedProgramId && 'sm:grid-cols-[minmax(0,1fr)_180px]')}>
                  {!fixedProgramId ? (
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor="ob-program" className="text-[length:var(--fs-12)] font-semibold">Πρόγραμμα</label>
                      <Combobox id="ob-program" ariaLabel="Πρόγραμμα" options={programs.map(p => ({ value: p.id, label: p.title }))} value={programId} onChange={v => { setProgramId(v); setRows([]) }} placeholder="Αναζήτηση προγράμματος…" className="w-full" />
                    </div>
                  ) : null}
                  <div className="flex max-w-[220px] flex-col gap-1.5">
                    <label htmlFor="ob-date" className="text-[length:var(--fs-12)] font-semibold">Ημ. απόφασης ένταξης</label>
                    <Input id="ob-date" type="date" value={approvedAt} onChange={e => setApprovedAt(e.target.value)} />
                  </div>
                </div>

                <div className="flex flex-col gap-1.5">
                  <label htmlFor="ob-search" className="text-[length:var(--fs-12)] font-semibold">Πελάτες με εγκεκριμένη πρόταση</label>
                  <div className="relative">
                    <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                    <Input id="ob-search" className="pl-9" value={query} disabled={!programId} onChange={e => { setQuery(e.target.value); if (e.target.value.trim().length < 2) setHits([]) }} placeholder={programId ? 'Επωνυμία ή ΑΦΜ…' : 'Διαλέξτε πρώτα πρόγραμμα'} autoComplete="off" />
                    {searching && <LoaderCircle className="absolute top-1/2 right-3 size-4 -translate-y-1/2 animate-spin text-muted-foreground" aria-hidden />}
                  </div>
                  {(hits.length > 0 || afmQuery.length === 9) && (
                    <ul className="flex flex-col divide-y divide-border rounded-xl border border-border bg-card">
                      {hits.map(h => (
                        <li key={h.id}>
                          <button type="button" onClick={() => add(h)} disabled={rows.some(r => r.id === h.id)} className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-muted disabled:opacity-50">
                            <Plus className="size-4 text-primary" aria-hidden />
                            <span className="min-w-0 flex-1 truncate font-medium">{h.name}</span>
                            <span className="font-mono text-[length:var(--fs-12)] text-muted-foreground">{h.afm}</span>
                            {h.existingStage && <span className="rounded-full bg-muted px-2 py-0.5 text-[length:var(--fs-11)]">έχει ήδη έργο</span>}
                          </button>
                        </li>
                      ))}
                      {afmQuery.length === 9 && !hits.some(h => h.afm === afmQuery) && (
                        <li>
                          <button type="button" onClick={addByAfm} className="flex min-h-11 w-full items-center gap-3 px-3 text-left hover:bg-muted">
                            <Plus className="size-4 text-primary" aria-hidden />
                            <span>Προσθήκη με ΑΦΜ <b className="font-mono">{afmQuery}</b> (στοιχεία από την ΑΑΔΕ)</span>
                          </button>
                        </li>
                      )}
                    </ul>
                  )}
                </div>

                {rows.length > 0 && (
                  <div className="flex flex-col gap-2">
                    {rows.map(r => (
                      <div key={r.id} className="rounded-xl border border-border p-3">
                        <div className="mb-2 flex items-center gap-2">
                          <span className="min-w-0 flex-1 truncate font-semibold">{r.name}</span>
                          <span className="font-mono text-[length:var(--fs-12)] text-muted-foreground">{r.afm}</span>
                          <Button type="button" variant="ghost" size="icon" aria-label={`Αφαίρεση ${r.name}`} onClick={() => setRows(prev => prev.filter(x => x.id !== r.id))}><X className="size-4" aria-hidden /></Button>
                        </div>
                        {r.existingStage && <p className="mb-2 text-[length:var(--fs-11-5)] text-amber-700 dark:text-amber-400">Υπάρχει ήδη έργο σε αυτό το πρόγραμμα — θα σημειωθεί ως εγκεκριμένο και θα συνεχίσει από το νέο σημείο.</p>}
                        <div className="grid gap-2 sm:grid-cols-3">
                          <Input aria-label={`Κωδικός ΟΠΣΚΕ — ${r.name}`} placeholder="Κωδικός ΟΠΣΚΕ / πράξης" value={r.opskeRef} onChange={e => patch(r.id, { opskeRef: e.target.value })} />
                          <Input aria-label={`Εγκεκριμένος προϋπολογισμός — ${r.name}`} inputMode="decimal" placeholder="Εγκεκριμένος π/υ (€)" value={r.budget} onChange={e => patch(r.id, { budget: e.target.value })} />
                          <Input aria-label={`Ενίσχυση — ${r.name}`} inputMode="decimal" placeholder="Ενίσχυση (€)" value={r.subsidy} onChange={e => patch(r.id, { subsidy: e.target.value })} />
                        </div>
                      </div>
                    ))}
                    <p className="text-[length:var(--fs-11-5)] text-muted-foreground">Τα ποσά και ο κωδικός είναι προαιρετικά — συμπληρώνονται και αργότερα από το έργο.</p>
                  </div>
                )}
              </div>
            ) : step === 1 ? (
              <div className="flex flex-col gap-3">
                <p className="text-[length:var(--fs-13)]">Ποια δικαιολογητικά <b>χρειάζονται ακόμη</b>; Όσα ξετσεκάρετε υποβλήθηκαν ήδη πριν την έγκριση και δεν θα ζητηθούν.</p>
                {!forms ? (
                  <div className="flex items-center gap-2 text-muted-foreground"><LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
                ) : forms.length === 0 ? (
                  <p className="text-muted-foreground">Το πρόγραμμα δεν έχει καταχωρισμένα δικαιολογητικά — τα έργα θα ξεκινήσουν απευθείας από τις δαπάνες.</p>
                ) : (
                  <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                    {forms.map(f => (
                      <li key={f.id}>
                        <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2">
                          <input type="checkbox" checked={needed.has(f.id)} onChange={e => setNeeded(prev => { const n = new Set(prev); if (e.target.checked) n.add(f.id); else n.delete(f.id); return n })} />
                          <span className="min-w-0 flex-1">{f.name}</span>
                          {!f.mandatory && <span className="text-[length:var(--fs-11)] text-muted-foreground">προαιρετικό</span>}
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
                <p className="text-[length:var(--fs-11-5)] text-muted-foreground">Ό,τι υπάρχει ήδη σε ισχύ στα δικαιολογητικά του πελάτη αναγνωρίζεται αυτόματα.</p>
              </div>
            ) : (
              <div className="flex flex-col gap-3 text-[length:var(--fs-13)]">
                <p><b>{rows.length}</b> {rows.length === 1 ? 'πελάτης' : 'πελάτες'} θα μπουν ως <b>εγκεκριμένα έργα</b>{approvedAt ? <> (απόφαση {new Date(approvedAt).toLocaleDateString('el-GR')})</> : null}.</p>
                <ul className="list-disc pl-5">
                  <li>Τα βήματα πριν την έγκριση (αξιολόγηση, υποβολή) σημειώνονται ως ολοκληρωμένα.</li>
                  <li>{neededCount ? <>Ξεκινούν από τα <b>δικαιολογητικά</b>: {neededCount} ζητούνται ακόμη.</> : <>Ξεκινούν απευθείας από την <b>υλοποίηση</b>: δαπάνες, αγορές και αιτήματα αποπληρωμής.</>}</li>
                  <li>Οι εγκεκριμένες δαπάνες προστίθενται στο έργο από την καρτέλα «Δαπάνες» (και με ανάγνωση προσφοράς).</li>
                </ul>
              </div>
            )}
          </div>

          <DialogFooter>
            {results ? (
              <Button type="button" onClick={() => { setOpen(false); reset() }}>Κλείσιμο</Button>
            ) : (
              <>
                {step > 0 && <Button type="button" variant="outline" onClick={() => setStep(s => s - 1)} disabled={busy}><ArrowLeft className="size-4" aria-hidden /> Πίσω</Button>}
                {step < STEPS.length - 1 ? (
                  <Button type="button" onClick={() => setStep(s => s + 1)} disabled={!canNext}>Επόμενο <ArrowRight className="size-4" aria-hidden /></Button>
                ) : (
                  <Button type="button" onClick={submit} disabled={busy || !rows.length}>
                    {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
                    Εισαγωγή {rows.length} {rows.length === 1 ? 'έργου' : 'έργων'}
                  </Button>
                )}
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
