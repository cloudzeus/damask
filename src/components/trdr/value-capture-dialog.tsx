'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuScanText, LuLoaderCircle, LuBrain, LuCircleCheck } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { scanCandidateValues, saveValueTemplate, type ValueCandidate } from '@/lib/documents/value-capture'
import { SERIES_KINDS, type SeriesKind } from '@/lib/documents/series'
import { officeKind, readOfficeText } from '@/lib/documents/office-text'

/**
 * «Σάρωση τιμών»: το AI προτείνει τις τιμές του εγγράφου → ο χρήστης επιλέγει ποιες κρατάμε → γίνονται πεδία
 * του τύπου (νέου ή υπάρχοντος). Από εκεί και πέρα κάθε ίδιο έγγραφο διαβάζεται αυτόματα (μνήμη).
 */

const TYPE_LABEL: Record<string, string> = { CURRENCY: 'Ποσό €', NUMBER: 'Αριθμός', PERCENT: 'Ποσοστό', INTEGER: 'Ακέραιος', DATE: 'Ημερομηνία', BOOLEAN: 'Ναι/Όχι', TEXT: 'Κείμενο' }
const NO_SERIES = '__none__'

function readBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader()
    r.onload = () => { const s = String(r.result); resolve(s.includes(',') ? s.split(',')[1] : s) }
    r.onerror = () => reject(r.error)
    r.readAsDataURL(file)
  })
}

type Row = ValueCandidate & { pick: boolean }

export function ValueCaptureDialog({
  file, type, open, onOpenChange, onSaved,
}: {
  file: File
  /** Τύπος που έχει ήδη επιλεγεί για το αρχείο (τα πεδία προστίθενται σε αυτόν) — αλλιώς δημιουργείται νέος. */
  type: { id: string; name: string } | null
  open: boolean
  onOpenChange: (o: boolean) => void
  onSaved: (t: { id: string; name: string; expires: boolean; seriesKind: string | null }, period: string | null) => void
}) {
  const [phase, setPhase] = React.useState<'scanning' | 'pick' | 'saving' | 'error'>('scanning')
  const [rows, setRows] = React.useState<Row[]>([])
  const [typeName, setTypeName] = React.useState('')
  const [series, setSeries] = React.useState<string>(NO_SERIES)
  const [period, setPeriod] = React.useState<string | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const started = React.useRef(false)

  React.useEffect(() => {
    if (!open || started.current) return
    started.current = true
    void (async () => {
      try {
        const office = officeKind(file)
        const res = await scanCandidateValues(office
          ? { text: await readOfficeText(file, 120_000), mimeType: 'text/plain', fileName: file.name, typeId: type?.id ?? null }
          : { base64: await readBase64(file), mimeType: file.type || 'application/pdf', fileName: file.name, typeId: type?.id ?? null })
        if (!res.ok) { setError(res.message); setPhase('error'); return }
        setRows(res.scan.candidates.map(c => ({ ...c, pick: c.existing })))
        setTypeName(res.scan.suggestedTypeName ?? '')
        setSeries(res.scan.seriesKind ?? NO_SERIES)
        setPeriod(res.scan.period)
        setPhase('pick')
      } catch { setError('Η σάρωση απέτυχε.'); setPhase('error') }
    })()
  }, [open, file, type])

  const patch = (i: number, p: Partial<Row>) => setRows(prev => prev.map((r, j) => (j === i ? { ...r, ...p } : r)))
  const picked = rows.filter(r => r.pick)

  async function save() {
    setPhase('saving')
    try {
      const res = await saveValueTemplate({
        typeId: type?.id ?? null, newTypeName: type ? null : typeName,
        seriesKind: series === NO_SERIES ? null : (series as SeriesKind),
        fields: picked.map(r => ({ label: r.label, valueType: r.valueType, hint: r.hint })),
      })
      if (!res.ok) { toast.error(res.message); setPhase('pick'); return }
      toast.success(`Αποθηκεύτηκε στη μνήμη: ${res.type.name}`, { description: `${res.added} νέα πεδία. Κάθε ίδιο έγγραφο θα διαβάζεται πλέον αυτόματα και οι τιμές θα αποθηκεύονται στην εταιρία.` })
      onSaved(res.type, period)
      onOpenChange(false)
    } catch { toast.error('Η αποθήκευση απέτυχε.'); setPhase('pick') }
  }

  return (
    <Dialog open={open} onOpenChange={o => { if (phase !== 'saving') onOpenChange(o) }}>
      <DialogContent className="glass max-h-[90vh] overflow-y-auto sm:max-w-[820px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><LuScanText className="size-4 text-primary" aria-hidden /> Σάρωση τιμών — {file.name}</DialogTitle>
          <DialogDescription>
            Επιλέξτε ποιες τιμές του εγγράφου θέλουμε να κρατάμε. Θα διαβάζονται αυτόματα σε κάθε ίδιο έγγραφο, σε όλους τους πελάτες, και θα είναι διαθέσιμες σε κάθε πρόγραμμα.
          </DialogDescription>
        </DialogHeader>

        {phase === 'scanning' && (
          <p className="flex items-center justify-center gap-2 rounded-2xl border border-border bg-muted/30 px-4 py-10 text-[length:var(--fs-12-5)] text-muted-foreground">
            <LuLoaderCircle className="size-4 animate-spin text-primary" aria-hidden /> Εντοπισμός τιμών στο έγγραφο…
          </p>
        )}
        {phase === 'error' && <p className="rounded-xl border border-border px-3 py-6 text-center text-[length:var(--fs-12-5)] text-destructive">{error}</p>}

        {(phase === 'pick' || phase === 'saving') && (
          <div className="flex flex-col gap-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="field !mb-0">
                <label>Τύπος εγγράφου</label>
                {type
                  ? <div className="flex h-9 items-center rounded-full border border-border bg-muted/40 px-3 text-[length:var(--fs-12-5)] font-semibold">{type.name}</div>
                  : <Input value={typeName} onChange={e => setTypeName(e.target.value)} placeholder="π.χ. Φ2 - Περιοδική δήλωση ΦΠΑ" className={cn('h-9 rounded-full', !typeName.trim() && 'border-[color:var(--warning)]')} />}
              </div>
              <div className="field !mb-0">
                <label>Επαναλαμβάνεται ανά περίοδο;</label>
                <Select value={series} onValueChange={v => setSeries(v ?? NO_SERIES)}>
                  <SelectTrigger aria-label="Σειρά" className="h-9 w-full rounded-full border-border bg-card px-3 text-[length:var(--fs-12-5)]">
                    <SelectValue>{(v: string) => (v === NO_SERIES ? 'Όχι — ένα έγγραφο' : SERIES_KINDS.find(k => k.value === v)?.label ?? v)}</SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value={NO_SERIES}>Όχι — ένα έγγραφο</SelectItem>
                    {SERIES_KINDS.filter(k => k.value !== 'LIST').map(k => <SelectItem key={k.value} value={k.value}>{k.label}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="flex items-center justify-between gap-2 text-[length:var(--fs-11-5)] text-muted-foreground">
              <span>{rows.length} τιμές βρέθηκαν · επιλεγμένες {picked.length}</span>
              <span className="flex gap-2">
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setRows(p => p.map(r => ({ ...r, pick: true })))}>Όλες</button>
                <button type="button" className="font-semibold text-primary hover:underline" onClick={() => setRows(p => p.map(r => ({ ...r, pick: r.existing })))}>Καμία</button>
              </span>
            </div>
            <div className="overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-[length:var(--fs-12)]">
                <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                  <tr>
                    <th className="w-8 px-2 py-2"><span className="sr-only">Κράτα</span></th>
                    <th className="px-2 py-2">Τιμή (ετικέτα)</th>
                    <th className="px-2 py-2">Στο έγγραφο</th>
                    <th className="w-36 px-2 py-2">Είδος</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={i} className={cn('border-t border-border align-middle', !r.pick && 'opacity-60')}>
                      <td className="px-2 py-1.5 text-center">
                        <input type="checkbox" checked={r.pick} disabled={r.existing} onChange={e => patch(i, { pick: e.target.checked })} aria-label={`Κράτα: ${r.label}`} />
                      </td>
                      <td className="px-2 py-1.5">
                        <div className="flex items-center gap-1.5">
                          <input value={r.label} disabled={r.existing} onChange={e => patch(i, { label: e.target.value })}
                            className="w-full min-w-[12rem] rounded-md border border-transparent bg-transparent px-1.5 py-1 font-semibold outline-none hover:border-border focus:border-ring disabled:opacity-100" />
                          {r.existing && <span className="badge-pill ok shrink-0" title="Υπάρχει ήδη στη μνήμη του τύπου"><LuBrain className="size-3" aria-hidden /> στη μνήμη</span>}
                        </div>
                      </td>
                      <td className="max-w-[16rem] truncate px-2 py-1.5 tabular-nums text-muted-foreground" title={r.value}>{r.value || '—'}</td>
                      <td className="px-2 py-1.5">
                        <Select value={r.valueType} onValueChange={v => patch(i, { valueType: (v ?? 'TEXT') as Row['valueType'] })} disabled={r.existing}>
                          <SelectTrigger aria-label="Είδος τιμής" className="h-8 w-full rounded-full border-border bg-card px-2.5 text-[length:var(--fs-11-5)]"><SelectValue>{(v: string) => TYPE_LABEL[v] ?? v}</SelectValue></SelectTrigger>
                          <SelectContent>{Object.entries(TYPE_LABEL).map(([k, l]) => <SelectItem key={k} value={k}>{l}</SelectItem>)}</SelectContent>
                        </Select>
                      </td>
                    </tr>
                  ))}
                  {rows.length === 0 && <tr><td colSpan={4} className="px-3 py-6 text-center text-muted-foreground">Δεν βρέθηκαν τιμές.</td></tr>}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={phase === 'saving'}>Άκυρο</Button>
          {(phase === 'pick' || phase === 'saving') && (
            <Button type="button" onClick={save} disabled={phase === 'saving' || picked.filter(r => !r.existing).length === 0 && !!type || picked.length === 0 || (!type && !typeName.trim())}>
              {phase === 'saving' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuCircleCheck className="size-3.5" aria-hidden />}
              Αποθήκευση στη μνήμη ({picked.length})
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
