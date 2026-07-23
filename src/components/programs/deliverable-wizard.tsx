'use client'

import * as React from 'react'
import { toast } from 'sonner'
import {
  LuPlus, LuTrash2, LuChevronRight, LuChevronLeft, LuCircleCheck, LuWandSparkles,
  LuBookOpen, LuFileStack, LuLayers,
} from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  saveDeliverableTemplate, type DeliverableTemplateItem, type DeliverableTaskInput,
} from '@/lib/pm/actions'
import {
  DELIVERABLE_PHASE_ORDER, deliverablePhaseLabel, OPTIONAL_PHASES,
  type DeliverablePhaseStr, type DeliverableScopeStr,
} from '@/lib/pm/deliverable-phases'
import { DELIVERABLE_CATALOG, type CatalogEntry } from '@/lib/pm/deliverable-catalog'

/**
 * Wizard (C2g Task 7, amended) — 3-βήματα δημιουργία/επεξεργασία ενός
 * ProgramDeliverableTemplate («παραδοτέο») + τα tasks του ανά φάση.
 * Mirror του CRUD dialog idiom (task-templates-tab.tsx) αλλά multi-step,
 * με ένα βοηθητικό panel «Πρότυπα» (DELIVERABLE_CATALOG) στο Βήμα 2 που
 * εισάγει με ένα κλικ ένα έτοιμο σύνολο tasks προς προσαρμογή.
 */

type WizardTask = {
  key: string
  id?: string
  phase: DeliverablePhaseStr
  name: string
  mandatory: boolean
  onSiteVerification: boolean
  minFiles: number
}

let keySeq = 0
function nextKey(): string {
  keySeq += 1
  return `wt-${keySeq}-${Date.now().toString(36)}`
}

function blankTask(phase: DeliverablePhaseStr): WizardTask {
  return { key: nextKey(), phase, name: '', mandatory: true, onSiteVerification: false, minFiles: 1 }
}

function phaseOptionLabel(p: DeliverablePhaseStr): string {
  return OPTIONAL_PHASES.has(p) ? `${deliverablePhaseLabel(p)} (προαιρετική)` : deliverablePhaseLabel(p)
}

const STEP_LABELS: Record<1 | 2 | 3, string> = {
  1: 'Στοιχεία παραδοτέου',
  2: 'Tasks ανά φάση',
  3: 'Σύνοψη',
}

export function DeliverableWizard({
  programId, existing = null, trigger, onSaved,
}: {
  programId: string
  existing?: DeliverableTemplateItem | null
  trigger?: React.ReactNode
  onSaved: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [step, setStep] = React.useState<1 | 2 | 3>(1)

  const [name, setName] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [appliesTo, setAppliesTo] = React.useState<DeliverableScopeStr>('EXPENSE')
  const [tasks, setTasks] = React.useState<WizardTask[]>([])
  const [helpOpen, setHelpOpen] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  const isEdit = existing !== null

  function resetFromExisting() {
    setStep(1)
    setName(existing?.name ?? '')
    setDescription(existing?.description ?? '')
    setAppliesTo(existing?.appliesTo ?? 'EXPENSE')
    setTasks(
      existing
        ? existing.tasks.map(t => ({
            key: nextKey(), id: t.id, phase: t.phase, name: t.name,
            mandatory: t.mandatory, onSiteVerification: t.onSiteVerification, minFiles: t.minFiles,
          }))
        : [],
    )
    setHelpOpen(true)
  }

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (next) resetFromExisting()
    setOpen(next)
  }

  function updateTask(key: string, patch: Partial<WizardTask>) {
    setTasks(prev => prev.map(t => (t.key === key ? { ...t, ...patch } : t)))
  }

  function removeTask(key: string) {
    setTasks(prev => prev.filter(t => t.key !== key))
  }

  function addTask() {
    const lastPhase = tasks.length > 0 ? tasks[tasks.length - 1].phase : DELIVERABLE_PHASE_ORDER[0]
    setTasks(prev => [...prev, blankTask(lastPhase)])
  }

  function importCatalogEntry(entry: CatalogEntry) {
    const prefill = tasks.length === 0
    setTasks(prev => [
      ...prev,
      ...entry.tasks.map(t => ({
        key: nextKey(), phase: t.phase, name: t.name,
        mandatory: t.mandatory, onSiteVerification: t.onSiteVerification, minFiles: t.minFiles,
      })),
    ])
    if (prefill) {
      setName(prev => (prev.trim() ? prev : entry.name))
      setDescription(prev => (prev.trim() ? prev : entry.description))
      setAppliesTo(entry.appliesTo)
    }
    toast.success(`Εισήχθησαν ${entry.tasks.length} tasks από «${entry.name}».`)
  }

  const sortedTasks = React.useMemo(() => {
    const order = new Map(DELIVERABLE_PHASE_ORDER.map((p, i) => [p, i]))
    return [...tasks].sort((a, b) => (order.get(a.phase) ?? 0) - (order.get(b.phase) ?? 0))
  }, [tasks])

  const tasksByPhase = React.useMemo(() => {
    const map = new Map<DeliverablePhaseStr, WizardTask[]>()
    for (const t of sortedTasks) {
      const list = map.get(t.phase) ?? []
      list.push(t)
      map.set(t.phase, list)
    }
    return map
  }, [sortedTasks])

  function validateStep1(): string | null {
    if (!name.trim()) return 'Το όνομα του παραδοτέου είναι υποχρεωτικό.'
    return null
  }

  function validateStep2(): string | null {
    if (tasks.length === 0) return 'Πρόσθεσε τουλάχιστον ένα task.'
    for (const t of tasks) {
      if (!t.name.trim()) return 'Κάθε task χρειάζεται όνομα.'
      if (!Number.isFinite(t.minFiles) || t.minFiles < 1) return 'Τα απαιτούμενα αρχεία πρέπει να είναι τουλάχιστον 1.'
    }
    return null
  }

  function handleNext() {
    if (step === 1) {
      const err = validateStep1()
      if (err) { toast.error(err); return }
      setStep(2)
    } else if (step === 2) {
      const err = validateStep2()
      if (err) { toast.error(err); return }
      setStep(3)
    }
  }

  function handleBack() {
    if (step === 2) setStep(1)
    else if (step === 3) setStep(2)
  }

  async function handleSave() {
    const err1 = validateStep1()
    const err2 = validateStep2()
    if (err1 || err2) {
      toast.error(err1 ?? err2 ?? 'Έλεγξε τα στοιχεία.')
      return
    }
    setSaving(true)
    try {
      const preparedTasks: DeliverableTaskInput[] = sortedTasks.map((t, i) => ({
        id: t.id,
        phase: t.phase,
        name: t.name.trim(),
        mandatory: t.mandatory,
        onSiteVerification: t.onSiteVerification,
        minFiles: Math.max(1, Math.trunc(t.minFiles) || 1),
        order: i,
      }))
      await saveDeliverableTemplate({
        id: existing?.id,
        programId,
        name: name.trim(),
        description: description.trim() ? description.trim() : null,
        appliesTo,
        active: existing?.active ?? true,
        tasks: preparedTasks,
      })
      toast.success(isEdit ? 'Το παραδοτέο ενημερώθηκε.' : 'Το παραδοτέο δημιουργήθηκε.')
      setOpen(false)
      onSaved()
    } catch {
      toast.error(isEdit ? 'Η ενημέρωση απέτυχε.' : 'Η δημιουργία απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <span className="contents" onClick={() => handleOpenChange(true)}>
        {trigger ?? (
          <Button type="button">
            <LuWandSparkles className="size-3.5" aria-hidden /> Νέο παραδοτέο (wizard)
          </Button>
        )}
      </span>

      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[880px]">
          <DialogHeader>
            <DialogTitle>{isEdit ? `Επεξεργασία παραδοτέου — ${existing?.name}` : 'Νέο παραδοτέο'}</DialogTitle>
            <DialogDescription>
              Όρισε το παραδοτέο, τα tasks του ανά φάση, και αποθήκευσε — ο οδηγός σε βοηθά με έτοιμα πρότυπα.
            </DialogDescription>
          </DialogHeader>

          <Stepper step={step} />

          {step === 1 && (
            <div className="flex flex-col gap-3.5">
              <div className="field !mb-0">
                <label htmlFor="dw-name">Όνομα παραδοτέου</label>
                <div className="inwrap">
                  <LuFileStack aria-hidden />
                  <Input
                    id="dw-name"
                    className="!h-auto border-0 bg-transparent p-0 focus-visible:ring-0"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="π.χ. Τιμολόγιο & εξόφληση εξοπλισμού"
                    autoFocus
                    autoComplete="off"
                    disabled={saving}
                  />
                </div>
              </div>

              <div className="field !mb-0">
                <label htmlFor="dw-desc">Περιγραφή</label>
                <textarea
                  id="dw-desc"
                  className="cms-textarea"
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="field !mb-0">
                <label>Αφορά</label>
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2" role="radiogroup" aria-label="Αφορά">
                  <ScopeOption
                    active={appliesTo === 'EXPENSE'}
                    onClick={() => setAppliesTo('EXPENSE')}
                    disabled={saving}
                    title="Δαπάνη"
                    hint="Υλοποιείται ανά δαπάνη του έργου."
                  />
                  <ScopeOption
                    active={appliesTo === 'APPLICATION'}
                    onClick={() => setAppliesTo('APPLICATION')}
                    disabled={saving}
                    title="Το πρόγραμμα/έργο"
                    hint="Μία φορά ανά έργο."
                  />
                </div>
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="flex flex-col gap-3.5 lg:flex-row">
              <div className="min-w-0 flex-1">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div className="text-[12.5px] font-semibold text-muted-foreground">
                    {tasks.length} {tasks.length === 1 ? 'task' : 'tasks'}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <Button type="button" variant="outline" size="sm" onClick={() => setHelpOpen(v => !v)} className="lg:hidden">
                      <LuBookOpen className="size-3.5" aria-hidden /> {helpOpen ? 'Κρύψε' : 'Βοήθεια'}
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={addTask} disabled={saving}>
                      <LuPlus className="size-3.5" aria-hidden /> Προσθήκη task
                    </Button>
                  </div>
                </div>

                {tasks.length === 0 ? (
                  <p className="rounded-[16px] border border-dashed border-border py-8 text-center text-[12.5px] text-muted-foreground">
                    Δεν έχεις προσθέσει tasks ακόμη — πρόσθεσε χειροκίνητα ή εισήγαγε από ένα πρότυπο δεξιά.
                  </p>
                ) : (
                  <div className="table-wrap max-h-[360px] overflow-y-auto">
                    <table className="data-table">
                      <thead>
                        <tr>
                          <th style={{ minWidth: 170 }}>Φάση</th>
                          <th>Task</th>
                          <th className="ctr">Υποχρεωτικό</th>
                          <th className="ctr">Επιτόπια</th>
                          <th className="ctr">Αρχεία</th>
                          <th aria-hidden />
                        </tr>
                      </thead>
                      <tbody>
                        {sortedTasks.map(t => (
                          <tr key={t.key} className="dotted-row-bottom">
                            <td style={{ minWidth: 170 }}>
                              <Select value={t.phase} onValueChange={v => updateTask(t.key, { phase: v as DeliverablePhaseStr })}>
                                <SelectTrigger
                                  aria-label={`Φάση — ${t.name || 'task'}`}
                                  className="h-8 w-full rounded-full border-border bg-card px-2.5 text-[12px]"
                                  disabled={saving}
                                >
                                  <SelectValue>{(v: string) => phaseOptionLabel(v as DeliverablePhaseStr)}</SelectValue>
                                </SelectTrigger>
                                <SelectContent>
                                  {DELIVERABLE_PHASE_ORDER.map(p => (
                                    <SelectItem key={p} value={p}>{phaseOptionLabel(p)}</SelectItem>
                                  ))}
                                </SelectContent>
                              </Select>
                            </td>
                            <td style={{ minWidth: 200 }}>
                              <input
                                value={t.name}
                                onChange={e => updateTask(t.key, { name: e.target.value })}
                                placeholder="π.χ. Τιμολόγιο αγοράς"
                                disabled={saving}
                                className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] font-semibold outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
                              />
                            </td>
                            <td className="ctr">
                              <Switch
                                checked={t.mandatory}
                                onCheckedChange={v => updateTask(t.key, { mandatory: v })}
                                disabled={saving}
                                aria-label={`Υποχρεωτικό — ${t.name || 'task'}`}
                              />
                            </td>
                            <td className="ctr">
                              <Switch
                                checked={t.onSiteVerification}
                                onCheckedChange={v => updateTask(t.key, { onSiteVerification: v })}
                                disabled={saving}
                                aria-label={`Επιτόπια επαλήθευση — ${t.name || 'task'}`}
                              />
                            </td>
                            <td className="ctr">
                              <input
                                type="number"
                                min={1}
                                value={t.minFiles}
                                onChange={e => updateTask(t.key, { minFiles: Math.max(1, Math.trunc(Number(e.target.value)) || 1) })}
                                disabled={saving}
                                className="w-14 min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-center text-[12.5px] outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
                              />
                            </td>
                            <td className="ctr">
                              <button
                                type="button"
                                onClick={() => removeTask(t.key)}
                                disabled={saving}
                                className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                                aria-label={`Αφαίρεση task — ${t.name || ''}`}
                                title="Αφαίρεση"
                              >
                                <LuTrash2 className="size-3.5" aria-hidden />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {helpOpen && (
                <aside className="w-full shrink-0 rounded-[18px] border border-border bg-card/60 p-3 lg:w-[280px]">
                  <div className="mb-2 flex items-center gap-1.5 text-[12px] font-extrabold text-muted-foreground uppercase tracking-[0.08em]">
                    <LuBookOpen className="size-3.5" aria-hidden /> Βοήθεια — Πρότυπα
                  </div>
                  <p className="mb-2.5 text-[11.5px] text-muted-foreground">
                    Έτοιμα σύνολα tasks για συχνές κατηγορίες δαπανών — πρόσθεσε ένα και προσάρμοσέ το.
                  </p>
                  <div className="flex max-h-[320px] flex-col gap-1.5 overflow-y-auto">
                    {DELIVERABLE_CATALOG.map(entry => (
                      <div key={entry.key} className="rounded-[12px] border border-border bg-card p-2.5">
                        <div className="text-[12px] font-bold">{entry.name}</div>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">{entry.description}</p>
                        <div className="mt-1.5 flex items-center justify-between gap-2">
                          <span className="badge-pill muted">{entry.tasks.length} tasks</span>
                          <Button type="button" variant="outline" size="sm" onClick={() => importCatalogEntry(entry)} disabled={saving}>
                            <LuLayers className="size-3.5" aria-hidden /> Εισαγωγή
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </aside>
              )}
            </div>
          )}

          {step === 3 && (
            <div className="flex flex-col gap-3">
              <div className="rounded-[16px] border border-border bg-card p-3.5">
                <div className="flex flex-wrap items-center gap-2">
                  <b className="text-[14px]">{name || '—'}</b>
                  <span className="badge-pill info">{appliesTo === 'EXPENSE' ? 'Ανά δαπάνη' : 'Ανά έργο'}</span>
                </div>
                {description.trim() && <p className="mt-1 text-[12.5px] text-muted-foreground">{description}</p>}
              </div>

              <div className="flex max-h-[360px] flex-col gap-2.5 overflow-y-auto">
                {DELIVERABLE_PHASE_ORDER.filter(p => (tasksByPhase.get(p)?.length ?? 0) > 0).map(phase => (
                  <div key={phase} className="rounded-[14px] border border-border p-2.5">
                    <div className="mb-1.5 text-[11px] font-extrabold uppercase tracking-[0.08em] text-muted-foreground">
                      {phaseOptionLabel(phase)}
                    </div>
                    <ul className="flex flex-col gap-1.5">
                      {(tasksByPhase.get(phase) ?? []).map(t => (
                        <li key={t.key} className="flex flex-wrap items-center gap-1.5 text-[12.5px]">
                          <span className="min-w-0 flex-1 font-semibold">{t.name}</span>
                          {t.mandatory && <span className="badge-pill warn">Υποχρεωτικό</span>}
                          {t.onSiteVerification && <span className="badge-pill info">Επιτόπια</span>}
                          <span className="badge-pill muted">{t.minFiles} {t.minFiles === 1 ? 'αρχείο' : 'αρχεία'}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            {step > 1 && (
              <Button type="button" variant="outline" onClick={handleBack} disabled={saving}>
                <LuChevronLeft className="size-3.5" aria-hidden /> Πίσω
              </Button>
            )}
            <div className="flex-1" />
            <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
            {step < 3 ? (
              <Button type="button" onClick={handleNext} disabled={saving}>
                Επόμενο <LuChevronRight className="size-3.5" aria-hidden />
              </Button>
            ) : (
              <Button type="button" onClick={handleSave} disabled={saving}>
                {saving ? 'Αποθήκευση…' : (<><LuCircleCheck className="size-3.5" aria-hidden /> Αποθήκευση</>)}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}

function Stepper({ step }: { step: 1 | 2 | 3 }) {
  return (
    <div className="glass flex gap-1 rounded-full p-1.5" role="tablist" aria-label="Βήματα οδηγού">
      {([1, 2, 3] as const).map(s => (
        <div
          key={s}
          role="tab"
          aria-selected={step === s}
          className={cn(
            'flex flex-1 items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[12px] font-semibold whitespace-nowrap transition-colors',
            step === s
              ? 'bg-primary text-primary-foreground shadow-sm'
              : step > s
                ? 'text-foreground'
                : 'text-muted-foreground',
          )}
        >
          {step > s ? <LuCircleCheck className="size-3.5" aria-hidden /> : <span className="avatar-ring size-5 text-[10.5px]">{s}</span>}
          <span className="hidden sm:inline">{STEP_LABELS[s]}</span>
        </div>
      ))}
    </div>
  )
}

function ScopeOption({
  active, onClick, disabled, title, hint,
}: {
  active: boolean
  onClick: () => void
  disabled?: boolean
  title: string
  hint: string
}) {
  return (
    <button
      type="button"
      role="radio"
      aria-checked={active}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'flex flex-col items-start gap-0.5 rounded-[16px] border p-3 text-left transition-colors',
        active
          ? 'border-primary bg-primary/10'
          : 'border-border bg-card hover:bg-muted',
      )}
    >
      <span className="flex items-center gap-1.5 text-[13px] font-bold">
        {active && <LuCircleCheck className="size-3.5 text-primary" aria-hidden />}
        {title}
      </span>
      <span className="text-[11.5px] text-muted-foreground">{hint}</span>
    </button>
  )
}
