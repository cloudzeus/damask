'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuStamp, LuLoaderCircle, LuCloudUpload, LuCircleCheck, LuTriangleAlert, LuFileText, LuEye, LuArrowRight } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { readApprovalDoc, applyApproval, getApproval, type ApprovalReview, type ApprovalSummary, type AmendmentChange } from '@/lib/pm/approval'

/**
 * Εγκριτική απόφαση έργου: ανέβασμα PDF (ή έτοιμη ανάγνωση από το «Προς καταχώριση») → έλεγχος στοιχείων
 * και εγκεκριμένων δαπανών με κατηγορία → «Καταχώριση». Και μια λωρίδα-σύνοψη στην κεφαλίδα του έργου.
 */

const EUR = new Intl.NumberFormat('el-GR', { style: 'currency', currency: 'EUR' })
const NONE = '__none__'
const dt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('el-GR') : '—')
const CHANGE: Record<AmendmentChange, { label: string; cls: string }> = {
  same: { label: 'Ίδια', cls: 'muted' },
  changed: { label: 'Αλλαγή ποσού', cls: 'warn' },
  new: { label: 'Νέα', cls: 'ok' },
  removed: { label: 'Καταργείται', cls: 'danger' },
}
/** «πριν → μετά» μόνο όταν άλλαξε. */
function beforeAfter(before: string | null, after: string | null): string | null {
  if (!after) return before
  return before && before !== after ? `${before} → ${after}` : after
}

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.includes(',') ? s.split(',')[1] : s) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

export function ApprovalDialog({
  applicationId, open, onOpenChange, onApplied, preset = null,
}: {
  applicationId: string
  open: boolean
  onOpenChange: (o: boolean) => void
  onApplied: () => void
  /** Ήδη διαβασμένο (από το «Προς καταχώριση»). */
  preset?: { review: ApprovalReview; inboxId: string } | null
}) {
  const [phase, setPhase] = React.useState<'pick' | 'reading' | 'review' | 'saving'>(open && preset ? 'review' : 'pick')
  const [review, setReview] = React.useState<ApprovalReview | null>(open && preset ? preset.review : null)
  const [cats, setCats] = React.useState<(string | null)[]>(open && preset ? preset.review.categoryIds : [])
  const [include, setInclude] = React.useState<boolean[]>(open && preset ? preset.review.extract.expenses.map(() => preset.review.existingExpenses === 0 || !!preset.review.amendment) : [])
  const [endsAt, setEndsAt] = React.useState(open && preset ? preset.review.endsAt ?? '' : '')
  const [dragOver, setDragOver] = React.useState(false)
  const inputRef = React.useRef<HTMLInputElement>(null)

  function load(r: ApprovalReview) {
    setReview(r)
    setCats(r.categoryIds)
    setInclude(r.extract.expenses.map(() => r.existingExpenses === 0 || !!r.amendment))
    setEndsAt(r.endsAt ?? '')
    setPhase('review')
  }

  async function read(f: File) {
    setPhase('reading')
    try {
      const res = await readApprovalDoc(applicationId, { name: f.name, base64: await readBase64(f), mimeType: f.type || 'application/pdf' })
      if (!res.ok) { toast.error(res.message); setPhase('pick'); return }
      load(res.review)
    } catch { toast.error('Η ανάγνωση απέτυχε.'); setPhase('pick') }
  }

  async function save() {
    if (!review) return
    setPhase('saving')
    try {
      const res = await applyApproval(applicationId, {
        storageKey: review.storageKey, fileName: review.fileName, extract: review.extract, endsAt: endsAt || null,
        expenses: include.map((on, index) => ({ on, index, categoryId: cats[index] ?? null })).filter(x => x.on).map(({ index, categoryId }) => ({ index, categoryId })),
        inboxId: preset?.inboxId ?? null,
        amendment: !!review.amendment,
      })
      if (!res.ok) { toast.error(res.message); setPhase('review'); return }
      if (review.amendment) {
        toast.success('Η τροποποίηση καταχωρίστηκε.', {
          description: [
            res.updatedExpenses ? `${res.updatedExpenses} δαπάνες άλλαξαν ποσό.` : null,
            res.createdExpenses ? `${res.createdExpenses} νέες.` : null,
            res.removedExpenses ? `${res.removedExpenses} καταργήθηκαν.` : null,
            res.keptBlocked ? `${res.keptBlocked} έμειναν (έχουν ήδη αγορές) — ελέγξτε τις.` : null,
          ].filter(Boolean).join(' ') || 'Τα στοιχεία έγκρισης ενημερώθηκαν.',
        })
      } else toast.success('Η εγκριτική απόφαση καταχωρίστηκε.', {
        description: [res.createdExpenses ? `Δημιουργήθηκαν ${res.createdExpenses} εγκεκριμένες δαπάνες.` : null, 'Το έργο είναι πλέον σε υλοποίηση.'].filter(Boolean).join(' '),
      })
      onApplied()
      onOpenChange(false)
    } catch { toast.error('Η καταχώριση απέτυχε.'); setPhase('review') }
  }

  const x = review?.extract
  const chosen = x ? x.expenses.filter((_, i) => include[i]) : []
  const am = review?.amendment ?? null
  const prev = am?.previous

  return (
    <Dialog open={open} onOpenChange={o => { if (phase !== 'reading' && phase !== 'saving') onOpenChange(o) }}>
      <DialogContent className="glass max-h-[90vh] overflow-y-auto sm:max-w-[960px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LuStamp className="size-4 text-primary" aria-hidden /> {am ? 'Τροποποίηση έγκρισης' : 'Εγκριτική απόφαση'}</DialogTitle>
          <DialogDescription>
            Ανεβάστε τα «Αποτελέσματα Αξιολόγησης» / την εγκριτική από το ΟΠΣΚΕ — διαβάζονται απόφαση, προϋπολογισμός, διάρκεια και εγκεκριμένες δαπάνες. Ελέγξτε και καταχωρίστε.
          </DialogDescription>
        </DialogHeader>

        {phase === 'pick' && (
          <div
            role="button" tabIndex={0}
            onClick={() => inputRef.current?.click()}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') inputRef.current?.click() }}
            onDragOver={e => { e.preventDefault(); setDragOver(true) }}
            onDragLeave={() => setDragOver(false)}
            onDrop={e => { e.preventDefault(); setDragOver(false); const f = e.dataTransfer.files?.[0]; if (f) void read(f) }}
            className={cn('flex cursor-pointer flex-col items-center gap-1.5 rounded-2xl border-2 border-dashed px-4 py-10 text-center transition-colors', dragOver ? 'border-primary bg-primary/5' : 'border-border bg-muted/30 hover:bg-muted/50')}
          >
            <LuCloudUpload className="size-7 text-primary" aria-hidden />
            <p className="text-[length:var(--fs-13)] font-semibold">Σύρετε το εγκριτικό εδώ ή πατήστε για επιλογή</p>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">PDF από το ΟΠΣΚΕ</p>
            <input ref={inputRef} type="file" accept="application/pdf" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) void read(f); e.target.value = '' }} />
          </div>
        )}

        {phase === 'reading' && (
          <div className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-10 text-center">
            <LuLoaderCircle className="size-6 animate-spin text-primary" aria-hidden />
            <p className="text-[length:var(--fs-13)] font-semibold">Ανάγνωση εγκριτικού…</p>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">Απόφαση, προϋπολογισμός, διάρκεια, εγκεκριμένες δαπάνες — λίγα δευτερόλεπτα</p>
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && review && x && (
          <div className="flex flex-col gap-3">
            {am && prev && (
              <p className="flex items-center gap-2 rounded-xl border border-primary/30 bg-primary/5 px-3 py-2 text-[length:var(--fs-12)]">
                <LuStamp className="size-4 shrink-0 text-primary" aria-hidden />
                <span>Νεότερη απόφαση από την καταχωρισμένη ({prev.decisionRef ?? '—'}, {dt(prev.decisionDate)}): καταχωρίζεται ως <b>τροποποίηση</b> — οι δαπάνες του έργου ευθυγραμμίζονται, η αρχική απόφαση μένει στο ιστορικό.</span>
              </p>
            )}
            {review.olderThanCurrent && (
              <p className="flex items-center gap-2 rounded-xl border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/8 px-3 py-2 text-[length:var(--fs-12)]">
                <LuTriangleAlert className="size-4 shrink-0 text-[color:var(--warning)]" aria-hidden />
                Το έγγραφο είναι παλαιότερη απόφαση από αυτή που έχει ήδη καταχωριστεί στο έργο — μην το καταχωρίσετε, θα αντικαταστήσει τα νεότερα στοιχεία.
              </p>
            )}
            {review.afmMismatch && (
              <p className="flex items-center gap-2 rounded-xl border border-[color:var(--warning)]/40 bg-[color:var(--warning)]/8 px-3 py-2 text-[length:var(--fs-12)]">
                <LuTriangleAlert className="size-4 shrink-0 text-[color:var(--warning)]" aria-hidden />
                Το ΑΦΜ του εγγράφου ({x.beneficiaryAfm}{x.beneficiaryName ? ` — ${x.beneficiaryName}` : ''}) δεν είναι του πελάτη του έργου.
              </p>
            )}
            <dl className="grid gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-3 text-[length:var(--fs-12)] sm:grid-cols-3">
              <Fact label="Κωδικός αίτησης" value={x.applicationCode} />
              <Fact label="Εγκριτική απόφαση" value={[x.decisionRef, x.ada ? `ΑΔΑ ${x.ada}` : null].filter(Boolean).join(' · ') || null} />
              <Fact label="Ημ. απόφασης" value={dt(x.decisionDate)} />
              <Fact label="Υποβολή αίτησης" value={dt(x.submittedAt)} />
              <Fact label="Κατάσταση" value={x.resultStatus} />
              <Fact label="Διάρκεια υλοποίησης" value={beforeAfter(prev?.durationMonths ? `${prev.durationMonths} μήνες` : null, x.durationMonths ? `${x.durationMonths} μήνες` : null)} />
              <Fact label="Προϋπολογισμός" value={beforeAfter(prev?.totalBudget != null ? EUR.format(prev.totalBudget) : null, x.totalBudget != null ? EUR.format(x.totalBudget) : null)} />
              <Fact label="Επιχορήγηση (δημόσια δαπάνη)" value={beforeAfter(
                prev?.publicAmount != null ? `${EUR.format(prev.publicAmount)}${prev.aidPct != null ? ` · ${prev.aidPct}%` : ''}` : null,
                x.publicAmount != null ? `${EUR.format(x.publicAmount)}${x.aidPct != null ? ` · ${x.aidPct}%` : ''}` : null,
              )} />
              <div className="flex flex-col gap-0.5">
                <dt className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">Λήξη υλοποίησης</dt>
                <dd><Input type="date" value={endsAt} onChange={e => setEndsAt(e.target.value)} aria-label="Λήξη υλοποίησης" className="h-8 w-auto rounded-full text-[length:var(--fs-12)]" /></dd>
              </div>
            </dl>

            {am ? (
              <AmendmentTable review={review} cats={cats} setCats={setCats} />
            ) : (<>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-[length:var(--fs-13)] font-bold">Εγκεκριμένες δαπάνες ({x.expenses.length})</h3>
              {review.existingExpenses > 0 && (
                <span className="text-[length:var(--fs-11-5)] text-[color:var(--warning)]">Το έργο έχει ήδη {review.existingExpenses} δαπάνες — επιλέξτε μόνο όσες λείπουν.</span>
              )}
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-[length:var(--fs-12)]">
                <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="w-8 px-2 py-2"><span className="sr-only">Δημιουργία</span></th>
                    <th className="px-2 py-2">Δαπάνη</th>
                    <th className="w-28 px-2 py-2 text-right">Χωρίς ΦΠΑ</th>
                    <th className="w-28 px-2 py-2 text-right">Δημόσια</th>
                    <th className="w-60 px-2 py-2">Κατηγορία προγράμματος</th>
                  </tr>
                </thead>
                <tbody>
                  {x.expenses.map((e, i) => (
                    <tr key={i} className={cn('border-t border-border align-middle', !include[i] && 'opacity-60')}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={!!include[i]} onChange={ev => setInclude(p => p.map((v, j) => (j === i ? ev.target.checked : v)))} aria-label={`Δημιουργία δαπάνης: ${e.title}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="font-semibold">{e.title}</div>
                        <div className="text-[length:var(--fs-11)] text-muted-foreground">{[e.subcategoryCode, e.subcategory].filter(Boolean).join(' ')}</div>
                      </td>
                      <td className="px-2 py-1.5 text-right tabular-nums">{EUR.format(e.net)}</td>
                      <td className="px-2 py-1.5 text-right tabular-nums text-muted-foreground">{e.publicAmount != null ? EUR.format(e.publicAmount) : '—'}</td>
                      <td className="px-2 py-1.5">
                        <Select value={cats[i] ?? NONE} onValueChange={v => setCats(p => p.map((c, j) => (j === i ? (v === NONE ? null : v ?? null) : c)))}>
                          <SelectTrigger aria-label="Κατηγορία" className={cn('h-8 w-full rounded-full border-border bg-card px-2.5 text-[length:var(--fs-11-5)]', !cats[i] && 'border-[color:var(--warning)]')}>
                            <SelectValue>{(v: string) => (v === NONE ? 'Χωρίς κατηγορία' : review.categories.find(c => c.id === v)?.name ?? '')}</SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value={NONE}>Χωρίς κατηγορία</SelectItem>
                            {review.categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                          </SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                  {x.expenses.length === 0 && <tr><td colSpan={5} className="px-3 py-6 text-center text-muted-foreground">Δεν βρέθηκε πίνακας δαπανών.</td></tr>}
                </tbody>
              </table>
            </div>
            <p className="text-[length:var(--fs-11-5)] text-muted-foreground">
              Θα καταχωριστούν τα στοιχεία έγκρισης, η εγκεκριμένη υποβολή και το έργο θα περάσει σε υλοποίηση. {chosen.length ? `Νέες δαπάνες: ${chosen.length} (${EUR.format(chosen.reduce((a, e) => a + e.net, 0))}).` : 'Καμία νέα δαπάνη.'}
            </p>
            </>)}
          </div>
        )}

        {(phase === 'review' || phase === 'saving') && (
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={phase === 'saving'}>Άκυρο</Button>
            <Button type="button" onClick={save} disabled={phase === 'saving'}>
              {phase === 'saving' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuCircleCheck className="size-3.5" aria-hidden />}
              {am ? 'Καταχώριση τροποποίησης' : 'Καταχώριση εγκριτικής'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}

/** Διαφορές τροποποίησης: κάθε δαπάνη πριν → μετά, με κατηγορία μόνο για τις νέες. */
function AmendmentTable({ review, cats, setCats }: { review: ApprovalReview; cats: (string | null)[]; setCats: React.Dispatch<React.SetStateAction<(string | null)[]>> }) {
  const rows = review.amendment?.rows ?? []
  const sum = (k: 'before' | 'after') => rows.reduce((a, r) => a + (r.change === 'removed' && r.blocked && k === 'after' ? r.before ?? 0 : r[k] ?? 0), 0)
  return (
    <>
      <h3 className="text-[length:var(--fs-13)] font-bold">Δαπάνες: πριν → μετά την τροποποίηση</h3>
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[length:var(--fs-12)]">
          <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-2 py-2">Δαπάνη</th>
              <th className="w-28 px-2 py-2 text-right">Πριν</th>
              <th className="w-6 px-0 py-2"><span className="sr-only">σε</span></th>
              <th className="w-28 px-2 py-2 text-right">Μετά</th>
              <th className="w-32 px-2 py-2">Αλλαγή</th>
              <th className="w-56 px-2 py-2">Κατηγορία (νέες)</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, k) => {
              const e = r.index != null ? review.extract.expenses[r.index] : null
              return (
                <tr key={k} className={cn('border-t border-border align-middle', r.change === 'removed' && 'text-muted-foreground')}>
                  <td className="px-2 py-1.5">
                    <div className={cn('font-semibold', r.change === 'removed' && !r.blocked && 'line-through')}>{r.title}</div>
                    {e && <div className="text-[length:var(--fs-11)] text-muted-foreground">{[e.subcategoryCode, e.subcategory].filter(Boolean).join(' ')}</div>}
                    {r.blocked && <div className="text-[length:var(--fs-11)] text-[color:var(--warning)]">Δεν καταργείται αυτόματα: {r.blocked}.</div>}
                  </td>
                  <td className="px-2 py-1.5 text-right tabular-nums">{r.before != null ? EUR.format(r.before) : '—'}</td>
                  <td className="px-0 py-1.5 text-center text-muted-foreground"><LuArrowRight className="mx-auto size-3" aria-hidden /></td>
                  <td className="px-2 py-1.5 text-right font-semibold tabular-nums">{r.after != null ? EUR.format(r.after) : '—'}</td>
                  <td className="px-2 py-1.5"><span className={`badge-pill ${CHANGE[r.change].cls}`} style={{ textTransform: 'none' }}>{CHANGE[r.change].label}</span></td>
                  <td className="px-2 py-1.5">
                    {r.change === 'new' && r.index != null ? (
                      <Select value={cats[r.index] ?? NONE} onValueChange={v => setCats(p => p.map((c, j) => (j === r.index ? (v === NONE ? null : v ?? null) : c)))}>
                        <SelectTrigger aria-label="Κατηγορία" className={cn('h-8 w-full rounded-full border-border bg-card px-2.5 text-[length:var(--fs-11-5)]', !cats[r.index] && 'border-[color:var(--warning)]')}>
                          <SelectValue>{(v: string) => (v === NONE ? 'Χωρίς κατηγορία' : review.categories.find(c => c.id === v)?.name ?? '')}</SelectValue>
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={NONE}>Χωρίς κατηγορία</SelectItem>
                          {review.categories.map(c => <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                </tr>
              )
            })}
          </tbody>
          <tfoot>
            <tr className="border-t border-border bg-muted/30 font-bold">
              <td className="px-2 py-2">Σύνολο</td>
              <td className="px-2 py-2 text-right tabular-nums">{EUR.format(sum('before'))}</td>
              <td />
              <td className="px-2 py-2 text-right tabular-nums">{EUR.format(sum('after'))}</td>
              <td colSpan={2} />
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="text-[length:var(--fs-11-5)] text-muted-foreground">
        Οι δαπάνες που καταργούνται δεν διαγράφονται — μένουν στο έργο ως «Καταργήθηκε» για το ιστορικό.
      </p>
    </>
  )
}

function Fact({ label, value }: { label: string; value: string | null }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <dt className="text-[length:var(--fs-11)] font-semibold text-muted-foreground">{label}</dt>
      <dd className={cn('min-w-0 break-words font-semibold', !value && 'font-normal text-muted-foreground')}>{value || '—'}</dd>
    </div>
  )
}

/** Λωρίδα στην κεφαλίδα του έργου: σύνοψη εγκριτικού ή κουμπί καταχώρισης. */
export function ApprovalStrip({ applicationId }: { applicationId: string }) {
  const router = useRouter()
  const [data, setData] = React.useState<ApprovalSummary | null | 'none'>(null)
  const [open, setOpen] = React.useState(false)
  const load = React.useCallback(() => { getApproval(applicationId).then(a => setData(a ?? 'none')).catch(() => setData(null)) }, [applicationId])
  React.useEffect(() => { load() }, [load])
  if (data === null) return null
  const a = data === 'none' ? null : data
  return (
    <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1.5 pt-3 text-[length:var(--fs-12)]" style={{ borderTop: '1px dotted var(--dotted)' }}>
      <span className="flex items-center gap-1.5 text-[length:var(--fs-11-5)] font-semibold text-muted-foreground"><LuStamp className="size-3.5" aria-hidden /> Εγκριτική</span>
      {a ? (
        <>
          <b>{a.decisionRef ?? '—'}</b>
          {a.history.length > 0 && <span className="badge-pill warn" style={{ textTransform: 'none' }} title={a.history.map(h => `${h.decisionRef ?? '—'} (${dt(h.decisionDate)})`).join(' · ')}>τροποποίηση · αρχική {a.history[0].decisionRef ?? dt(a.history[0].decisionDate)}</span>}
          {a.ada && <span className="text-muted-foreground">ΑΔΑ {a.ada}</span>}
          {a.applicationCode && <span className="badge-pill muted" style={{ textTransform: 'none' }}>{a.applicationCode}</span>}
          {a.totalBudget != null && <span className="tabular-nums">Π/Υ {EUR.format(a.totalBudget)}</span>}
          {a.publicAmount != null && <span className="tabular-nums text-muted-foreground">επιχορήγηση {EUR.format(a.publicAmount)}</span>}
          {a.endsAt && <span className="badge-pill info">λήξη υλοποίησης {dt(a.endsAt)}</span>}
          <span className="ml-auto flex items-center gap-1.5">
            {a.docUrl && <a href={a.docUrl} target="_blank" rel="noreferrer" className="inline-flex h-8 items-center gap-1 rounded-full border border-border px-3 font-semibold hover:border-primary hover:text-primary"><LuEye className="size-3.5" aria-hidden /> Έγγραφο</a>}
            <Button type="button" size="sm" variant="outline" onClick={() => setOpen(true)}><LuFileText className="size-3.5" aria-hidden /> Νέα ανάγνωση</Button>
          </span>
        </>
      ) : (
        <>
          <span className="text-muted-foreground">Δεν έχει καταχωριστεί — για έργα σε υλοποίηση ανεβάστε το εγκριτικό από το ΟΠΣΚΕ.</span>
          <Button type="button" size="sm" className="ml-auto" onClick={() => setOpen(true)}><LuCloudUpload className="size-3.5" aria-hidden /> Καταχώριση εγκριτικής</Button>
        </>
      )}
      {open && <ApprovalDialog applicationId={applicationId} open={open} onOpenChange={setOpen} onApplied={() => { load(); router.refresh() }} />}
    </div>
  )
}
