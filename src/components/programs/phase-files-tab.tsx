'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuFilePlus, LuTrash2, LuSave, LuLoaderCircle, LuInfo } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  DELIVERABLE_PHASE_ORDER, deliverablePhaseLabel, type DeliverablePhaseStr,
} from '@/lib/pm/deliverable-phases'
import { listProgramPhaseFiles, setProgramPhaseFiles } from '@/lib/programs/phase-files'

/**
 * «Αρχεία πελάτη» tab — ο διαχειριστής ορίζει, ΑΝΑ ΦΑΣΗ, τα αρχεία που ζητούνται
 * ΑΠΟ ΤΟΝ ΠΕΛΑΤΗ για το πρόγραμμα. Self-fetching client component (idiom του
 * RequiredFormsTab): τοπική επεξεργαζόμενη κατάσταση ως flat array ομαδοποιημένο
 * ανά φάση, «+ Προσθήκη αρχείου» ανά φάση, ένα κουμπί «Αποθήκευση» που
 * αντικαθιστά ΟΛΕΣ τις εγγραφές μέσω setProgramPhaseFiles. Τα ορισμένα αρχεία
 * τροφοδοτούν ως πρότυπο τα αιτήματα δικαιολογητικών (FileRequest) των έργων.
 */

type EditRow = {
  tempId: string
  phase: DeliverablePhaseStr
  label: string
  description: string
  required: boolean
}

function newTempId(): string {
  try {
    return crypto.randomUUID()
  } catch {
    return `tmp-${Math.random().toString(36).slice(2)}-${Date.now()}`
  }
}

export function PhaseFilesTab({ programId }: { programId: string }) {
  const [rows, setRows] = React.useState<EditRow[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [saving, startSave] = React.useTransition()

  // Καθαρή ανάκτηση — δεν αγγίζει state, ώστε να καλείται και μέσα σε effect
  // (τα setState μπαίνουν ΜΕΤΑ το await) και από event handlers.
  const fetchRows = React.useCallback(async (): Promise<EditRow[]> => {
    const data = await listProgramPhaseFiles(programId)
    return data.map(r => ({
      tempId: r.id,
      phase: r.phase as DeliverablePhaseStr,
      label: r.label,
      description: r.description ?? '',
      required: r.required,
    }))
  }, [programId])

  // Αρχική φόρτωση — τα setState μπαίνουν ΜΕΤΑ το await (όχι synchronously στο
  // σώμα του effect), guarded με cancelled flag.
  React.useEffect(() => {
    let cancelled = false
    fetchRows()
      .then(next => { if (!cancelled) setRows(next) })
      .catch(() => { if (!cancelled) setError('Η φόρτωση των αρχείων απέτυχε.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [fetchRows])

  function addRow(phase: DeliverablePhaseStr) {
    setRows(prev => [...prev, { tempId: newTempId(), phase, label: '', description: '', required: true }])
  }

  function patchRow(tempId: string, patch: Partial<EditRow>) {
    setRows(prev => prev.map(r => (r.tempId === tempId ? { ...r, ...patch } : r)))
  }

  function removeRow(tempId: string) {
    setRows(prev => prev.filter(r => r.tempId !== tempId))
  }

  function handleSave() {
    const items = rows
      .filter(r => r.label.trim())
      .map(r => ({
        phase: r.phase,
        label: r.label.trim(),
        description: r.description.trim() ? r.description.trim() : null,
        required: r.required,
      }))

    startSave(async () => {
      try {
        const res = await setProgramPhaseFiles(programId, items)
        toast.success(`Αποθηκεύτηκαν ${res.count} αρχεία πελάτη.`)
        setRows(await fetchRows())
      } catch {
        toast.error('Η αποθήκευση απέτυχε.')
      }
    })
  }

  const total = rows.filter(r => r.label.trim()).length

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Αρχεία πελάτη ({total})
        </div>
        <Button type="button" onClick={handleSave} disabled={saving || loading}>
          {saving ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuSave className="size-3.5" aria-hidden />}
          {saving ? 'Αποθήκευση…' : 'Αποθήκευση'}
        </Button>
      </div>

      <div className="mb-3 flex items-start gap-2 text-[0.78125rem] text-muted-foreground">
        <LuInfo className="mt-0.5 size-3.5 shrink-0" aria-hidden />
        <span>
          Όρισε ανά φάση τα αρχεία που ζητούνται από τον πελάτη. Αυτά τροφοδοτούν ως πρότυπο τα
          αιτήματα δικαιολογητικών (FileRequest) των έργων.
        </span>
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[0.78125rem] text-coral">{error}</p>
      ) : (
        <div className="flex flex-col gap-3">
          {DELIVERABLE_PHASE_ORDER.map(phase => {
            const phaseRows = rows.filter(r => r.phase === phase)
            return (
              <div key={phase} className="rounded-[18px] border border-border bg-card p-3.5">
                <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5">
                    <b className="text-[0.84375rem]">{deliverablePhaseLabel(phase)}</b>
                    <span className="badge-pill muted">
                      {phaseRows.length} {phaseRows.length === 1 ? 'αρχείο' : 'αρχεία'}
                    </span>
                  </div>
                  <Button type="button" variant="outline" size="sm" onClick={() => addRow(phase)} disabled={saving}>
                    <LuFilePlus className="size-3.5" aria-hidden /> Προσθήκη αρχείου
                  </Button>
                </div>

                {phaseRows.length === 0 ? (
                  <p className="py-2 text-[0.75rem] text-muted-foreground">
                    Δεν έχουν οριστεί αρχεία για αυτή τη φάση.
                  </p>
                ) : (
                  <div className="flex flex-col gap-2">
                    {phaseRows.map(row => (
                      <div
                        key={row.tempId}
                        className="flex flex-col gap-2 rounded-[14px] border border-dashed border-border p-2.5 sm:flex-row sm:items-center"
                      >
                        <div className="min-w-0 flex-1">
                          <Input
                            value={row.label}
                            onChange={e => patchRow(row.tempId, { label: e.target.value })}
                            placeholder="Όνομα αρχείου (π.χ. Ε3 τελευταίας χρήσης)"
                            aria-label={`Όνομα αρχείου — ${deliverablePhaseLabel(phase)}`}
                            disabled={saving}
                          />
                        </div>
                        <div className="min-w-0 flex-1">
                          <Input
                            value={row.description}
                            onChange={e => patchRow(row.tempId, { description: e.target.value })}
                            placeholder="Περιγραφή (προαιρετικό)"
                            aria-label={`Περιγραφή — ${deliverablePhaseLabel(phase)}`}
                            disabled={saving}
                          />
                        </div>
                        <div className="flex shrink-0 items-center gap-2.5">
                          <label className="flex cursor-pointer items-center gap-1.5 text-[0.75rem] font-semibold">
                            <Switch
                              checked={row.required}
                              onCheckedChange={checked => patchRow(row.tempId, { required: checked })}
                              disabled={saving}
                              aria-label={`Υποχρεωτικό — ${row.label || deliverablePhaseLabel(phase)}`}
                            />
                            Υποχρεωτικό
                          </label>
                          <button
                            type="button"
                            onClick={() => removeRow(row.tempId)}
                            disabled={saving}
                            className="inline-flex size-9 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:opacity-50"
                            aria-label={`Διαγραφή — ${row.label || deliverablePhaseLabel(phase)}`}
                            title="Διαγραφή"
                          >
                            <LuTrash2 className="size-4" aria-hidden />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      )}
    </section>
  )
}
