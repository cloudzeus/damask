'use client'

import * as React from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { Plus, LoaderCircle, Landmark, ExternalLink, Trash2, CircleCheck, CircleX } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { S1SearchableSelect } from '@/components/s1/s1-select'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listTrdrProgramCards, listActivePrograms, evaluateTrdrForProgram, associateTrdrProgram,
  setApplicationLifecycle, removeTrdrProgram, type TrdrProgramCard,
} from '@/lib/pm/program-link'
import type { SinglePairEligibility } from '@/lib/prospects/evaluate-pair'
import {
  LIFECYCLE_ORDER, LIFECYCLE_COLORS, lifecycleLabel, stageLabel, verdictLabel, type LifecycleStr,
} from '@/lib/pm/types'
import type { ApplicationLifecycle } from '@prisma/client'

const CRITERIA_LABELS: Record<string, string> = { kad: 'ΚΑΔ', region: 'Περιφέρεια', legalForm: 'Νομ. μορφή' }

export function TrdrProgramsPanel({ trdrId, canManage }: { trdrId: string; canManage: boolean }) {
  const router = useRouter()
  const [cards, setCards] = React.useState<TrdrProgramCard[]>([])
  const [loading, setLoading] = React.useState(true)
  const [addOpen, setAddOpen] = React.useState(false)
  const [selected, setSelected] = React.useState<TrdrProgramCard | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    listTrdrProgramCards(trdrId)
      .then(setCards)
      .catch(() => setCards([]))
      .finally(() => setLoading(false))
  }, [trdrId])

  // Mount fetch: setState μόνο σε async callbacks (όχι synchronous στο effect body).
  React.useEffect(() => {
    let cancelled = false
    listTrdrProgramCards(trdrId)
      .then(d => { if (!cancelled) setCards(d) })
      .catch(() => { if (!cancelled) setCards([]) })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trdrId])

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Ευρωπαϊκά Προγράμματα ({cards.length})
        </div>
        {canManage && (
          <Button type="button" variant="outline" size="sm" onClick={() => setAddOpen(true)}>
            <Plus className="size-3.5" aria-hidden /> Σύνδεση με πρόγραμμα
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : cards.length === 0 ? (
        <p className="py-6 text-center text-[12.5px] text-muted-foreground">
          Ο πελάτης δεν έχει συνδεθεί με κάποιο πρόγραμμα ακόμη.
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
          {cards.map(card => {
            const c = LIFECYCLE_COLORS[card.lifecycle]
            return (
              <button
                key={card.id}
                type="button"
                onClick={() => setSelected(card)}
                className="lift rounded-[14px] border p-3 text-left transition-shadow"
                style={{ borderColor: c.fg, background: c.bg }}
              >
                <div className="mb-1.5 flex items-center gap-2">
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--card)', color: c.fg }}>
                    <Landmark className="size-3.5" aria-hidden />
                  </span>
                  <span className="badge-pill" style={{ color: c.fg, background: 'var(--card)' }}>{lifecycleLabel(card.lifecycle)}</span>
                </div>
                <div className="line-clamp-2 text-[12.5px] font-semibold text-foreground">{card.programTitle}</div>
                <div className="mt-1 text-[11px] text-muted-foreground">
                  {card.snapshot
                    ? (card.snapshot.eligible ? 'Πληροί τα κριτήρια' : 'Δεν πληροί όλα τα κριτήρια')
                    : 'Χωρίς αξιολόγηση'}
                </div>
              </button>
            )
          })}
        </div>
      )}

      {addOpen && (
        <AddProgramDialog
          trdrId={trdrId}
          open={addOpen}
          onOpenChange={setAddOpen}
          onSaved={() => { setAddOpen(false); load(); router.refresh() }}
        />
      )}

      {selected && (
        <EvaluationDialog
          card={selected}
          canManage={canManage}
          open={!!selected}
          onOpenChange={o => { if (!o) setSelected(null) }}
          onChanged={() => { setSelected(null); load(); router.refresh() }}
        />
      )}
    </div>
  )
}

function CriteriaBadges({ snapshot }: { snapshot: SinglePairEligibility | null }) {
  if (!snapshot) return <p className="text-[12.5px] text-muted-foreground">Δεν υπάρχει αποθηκευμένη αξιολόγηση.</p>
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap gap-1">
        {snapshot.matched.map(k => (
          <span key={k} className="badge-pill ok"><CircleCheck className="size-3" aria-hidden /> {CRITERIA_LABELS[k] ?? k}</span>
        ))}
        {snapshot.failed.map(k => (
          <span key={k} className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
            <CircleX className="size-3" aria-hidden /> {CRITERIA_LABELS[k] ?? k}
          </span>
        ))}
      </div>
      {snapshot.matchedKads.length > 0 && (
        <div>
          <div className="mb-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">ΚΑΔ που ταιριάζουν</div>
          <div className="flex flex-wrap gap-1">
            {snapshot.matchedKads.map(code => <span key={code} className="badge-pill ok tabular-nums">{code}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}

function EvaluationDialog({
  card, canManage, open, onOpenChange, onChanged,
}: {
  card: TrdrProgramCard
  canManage: boolean
  open: boolean
  onOpenChange: (open: boolean) => void
  onChanged: () => void
}) {
  const [busy, setBusy] = React.useState(false)

  async function changeLifecycle(next: LifecycleStr) {
    setBusy(true)
    try {
      await setApplicationLifecycle(card.id, next as ApplicationLifecycle)
      toast.success(`Κατάσταση: ${lifecycleLabel(next)}.`)
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αλλαγή κατάστασης απέτυχε.')
      setBusy(false)
    }
  }

  async function handleRemove() {
    if (!window.confirm(`Αφαίρεση σύνδεσης με «${card.programTitle}»;`)) return
    setBusy(true)
    try {
      await removeTrdrProgram(card.id)
      toast.success('Η σύνδεση αφαιρέθηκε.')
      onChanged()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αφαίρεση απέτυχε.')
      setBusy(false)
    }
  }

  const c = LIFECYCLE_COLORS[card.lifecycle]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>{card.programTitle}</DialogTitle>
          <DialogDescription>
            Αξιολόγηση ένταξης — <span className="badge-pill" style={{ color: c.fg, background: c.bg }}>{lifecycleLabel(card.lifecycle)}</span>
            {' · '}Στάδιο PM: {stageLabel(card.stage)} · {verdictLabel(card.verdict)}
          </DialogDescription>
        </DialogHeader>

        <CriteriaBadges snapshot={card.snapshot} />

        {canManage && (
          <div className="mt-2 flex flex-col gap-1.5">
            <label htmlFor="lifecycle-select" className="text-[11px] font-semibold text-muted-foreground">Κατάσταση συμμετοχής</label>
            <Select value={card.lifecycle} onValueChange={v => changeLifecycle(v as LifecycleStr)} disabled={busy}>
              <SelectTrigger id="lifecycle-select" className="h-10 w-full rounded-full border-border bg-card px-4">
                <SelectValue>{(v: string) => lifecycleLabel(v as LifecycleStr)}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {LIFECYCLE_ORDER.map(l => <SelectItem key={l} value={l}>{lifecycleLabel(l)}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
        )}

        <DialogFooter className="flex-wrap gap-2">
          {canManage && (
            <Button type="button" variant="ghost" onClick={handleRemove} disabled={busy} style={{ color: 'var(--destructive)' }}>
              <Trash2 className="size-3.5" aria-hidden /> Αφαίρεση
            </Button>
          )}
          <div className="flex-1" />
          <Link href={`/programs/${card.programId}/applications/${card.id}`} className="btn-pill btn-glass h-9 px-4 text-[12.5px]">
            <ExternalLink className="size-3.5" aria-hidden /> Άνοιγμα έργου
          </Link>
          <DialogClose render={<Button variant="outline">Κλείσιμο</Button>} />
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function AddProgramDialog({
  trdrId, open, onOpenChange, onSaved,
}: {
  trdrId: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved: () => void
}) {
  const [options, setOptions] = React.useState<{ value: string; label: string }[]>([])
  const [programId, setProgramId] = React.useState<string | null>(null)
  const [evalState, setEvalState] = React.useState<{ status: 'idle' | 'loading' | 'done'; result?: SinglePairEligibility }>({ status: 'idle' })
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    let cancelled = false
    listActivePrograms().then(o => { if (!cancelled) setOptions(o) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    void (async () => {
      if (!programId) { setEvalState({ status: 'idle' }); return }
      setEvalState({ status: 'loading' })
      try {
        const result = await evaluateTrdrForProgram(trdrId, programId)
        if (!cancelled) setEvalState({ status: 'done', result })
      } catch {
        if (!cancelled) setEvalState({ status: 'idle' })
      }
    })()
    return () => { cancelled = true }
  }, [programId, trdrId])

  async function handleSave() {
    if (!programId) return
    setSaving(true)
    try {
      await associateTrdrProgram(trdrId, programId)
      toast.success('Η σύνδεση αποθηκεύτηκε (Δυνητικός).')
      onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η σύνδεση απέτυχε.')
      setSaving(false)
    }
  }

  return (
    <Dialog open={open} onOpenChange={next => { if (!saving) onOpenChange(next) }}>
      <DialogContent className="glass max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Σύνδεση με ενεργό πρόγραμμα</DialogTitle>
          <DialogDescription>Επίλεξε πρόγραμμα για να δεις αν ο πελάτης μπορεί να ενταχθεί, μετά αποθήκευσε.</DialogDescription>
        </DialogHeader>

        <S1SearchableSelect
          id="add-program-select"
          label="Ενεργό πρόγραμμα"
          options={options}
          value={programId}
          onChange={setProgramId}
          placeholder="Αναζήτηση προγράμματος…"
        />

        {evalState.status === 'loading' && (
          <div className="flex items-center justify-center gap-2 py-4 text-[12.5px] text-muted-foreground">
            <LoaderCircle className="size-4 animate-spin" aria-hidden /> Έλεγχος ένταξης…
          </div>
        )}
        {evalState.status === 'done' && evalState.result && (
          <div className="flex flex-col gap-2">
            <div className={evalState.result.eligible ? 'notice success' : 'notice'}>
              {evalState.result.eligible ? <CircleCheck aria-hidden /> : <CircleX aria-hidden />}
              <span>{evalState.result.eligible ? 'Ο πελάτης πληροί τα κριτήρια.' : 'Ο πελάτης δεν πληροί όλα τα κριτήρια — μπορείς πάντως να τον συνδέσεις ως δυνητικό.'}</span>
            </div>
            <CriteriaBadges snapshot={evalState.result} />
          </div>
        )}

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={!programId || saving}>
            {saving ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Plus className="size-3.5" aria-hidden />}
            Αποθήκευση σύνδεσης
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
