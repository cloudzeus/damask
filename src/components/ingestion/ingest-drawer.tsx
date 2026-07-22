'use client'

import { useEffect, useRef, useState } from 'react'
import { Dialog as DialogPrimitive } from '@base-ui/react/dialog'
import { LuDatabase, LuGitMerge, LuListChecks, LuRocket, LuCheck } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { requiredFieldKeys, type IngestionTarget } from '@/lib/ingestion/target'
import { EMPTY_INGEST_STATE, type IngestState, type IngestStep } from './types'
import { StepSource } from './step-source'
import { StepIngestMap } from './step-ingest-map'
import { StepIngestValidate } from './step-ingest-validate'
import { StepIngestCommit } from './step-ingest-commit'

const STEPS = [
  { id: 1, label: 'Πηγή', icon: LuDatabase },
  { id: 2, label: 'Αντιστοίχιση', icon: LuGitMerge },
  { id: 3, label: 'Έλεγχος', icon: LuListChecks },
  { id: 4, label: 'Καταχώριση', icon: LuRocket },
] as const

function canProceed(step: IngestStep, state: IngestState, target: IngestionTarget): boolean {
  switch (step) {
    case 1:
      return !!state.batch && state.batch.records.length > 0
    case 2: {
      const mappedKeys = new Set(state.mappings.filter(m => m.fieldKey).map(m => m.fieldKey))
      return requiredFieldKeys(target).every(key => mappedKeys.has(key))
    }
    case 3:
      return !!state.validation && state.validation.validRows > 0
    case 4:
      return true
  }
}

export function IngestDrawer({
  target, open, onOpenChange, onDone,
}: {
  target: IngestionTarget
  open: boolean
  onOpenChange: (v: boolean) => void
  onDone?: () => void
}) {
  const [step, setStep] = useState<IngestStep>(1)
  const [state, setState] = useState<IngestState>(EMPTY_INGEST_STATE)
  const prevOpen = useRef(open)

  // Reset step/state on every open↔closed transition so reopening always starts fresh.
  useEffect(() => {
    if (prevOpen.current !== open) {
      prevOpen.current = open
      setStep(1)
      setState(EMPTY_INGEST_STATE)
    }
  }, [open])

  function patch(update: Partial<IngestState>) {
    setState(prev => ({ ...prev, ...update }))
  }

  function goTo(target_: IngestStep) {
    if (target_ <= step || canProceed(step, state, target)) setStep(target_)
  }

  function next() {
    if (canProceed(step, state, target) && step < 4) setStep((step + 1) as IngestStep)
  }

  function back() {
    if (step > 1) setStep((step - 1) as IngestStep)
  }

  const canNext = canProceed(step, state, target)
  const stepProps = { target, state, patch }

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Backdrop className="fixed inset-0 isolate z-50 bg-black/20 duration-150 supports-backdrop-filter:backdrop-blur-xs data-open:animate-in data-open:fade-in-0 data-closed:animate-out data-closed:fade-out-0" />
        <DialogPrimitive.Popup
          className="glass fixed inset-y-0 right-0 z-50 flex w-full max-w-xl flex-col gap-0 rounded-l-[26px] border-l p-0 shadow-[0_24px_60px_rgb(0_0_0_/_20%)] outline-none duration-200 data-open:animate-in data-open:slide-in-from-right data-open:fade-in-0 data-closed:animate-out data-closed:slide-out-to-right data-closed:fade-out-0"
          style={{ borderColor: 'var(--border)' }}
        >
          <div className="flex flex-col gap-4 px-6 pt-6 pb-4">
            <DialogPrimitive.Title className="font-heading text-base font-semibold" style={{ color: 'var(--foreground)' }}>
              Καταχώριση: {target.label}
            </DialogPrimitive.Title>

            <div className="flex items-center justify-center select-none">
              {STEPS.map((s, idx) => {
                const done = s.id < step
                const active = s.id === step
                const reachable = s.id <= step
                const Icon = s.icon
                return (
                  <div key={s.id} className="flex items-center">
                    {idx > 0 && (
                      <div className="mx-1 h-0.5 w-9 transition-colors duration-500" style={{ background: done ? 'var(--navy)' : 'var(--border)' }} />
                    )}
                    <button
                      type="button"
                      onClick={() => reachable && goTo(s.id)}
                      disabled={!reachable}
                      className="flex flex-col items-center gap-1.5"
                      style={{ cursor: reachable ? 'pointer' : 'default' }}
                    >
                      <span
                        className="flex size-9 items-center justify-center rounded-full transition-all duration-300"
                        style={{
                          background: done || active ? 'var(--navy)' : 'var(--muted)',
                          boxShadow: active ? '0 0 0 4px var(--info-soft)' : 'none',
                        }}
                      >
                        {done
                          ? <LuCheck className="size-4" style={{ color: 'var(--navy-ink)' }} strokeWidth={3} />
                          : <Icon className="size-4" style={{ color: active ? 'var(--navy-ink)' : 'var(--muted-foreground)' }} />}
                      </span>
                      <span className="hidden text-[11px] font-semibold sm:block" style={{ color: active ? 'var(--info)' : done ? 'var(--foreground)' : 'var(--muted-foreground)' }}>
                        {s.id}. {s.label}
                      </span>
                    </button>
                  </div>
                )
              })}
            </div>
          </div>

          <div className="flex-1 overflow-y-auto px-6" style={{ minHeight: 360 }}>
            {step === 1 && <StepSource {...stepProps} />}
            {step === 2 && <StepIngestMap {...stepProps} />}
            {step === 3 && <StepIngestValidate {...stepProps} />}
            {step === 4 && <StepIngestCommit {...stepProps} onDone={onDone} />}
          </div>

          <div className="flex items-center justify-between gap-3 border-t px-6 py-4" style={{ borderColor: 'var(--border)' }}>
            <Button type="button" variant="ghost" onClick={back} disabled={step === 1}>
              ← Πίσω
            </Button>
            <div className="flex items-center gap-3">
              <span className="text-[12px] text-muted-foreground">Βήμα {step} από {STEPS.length}</span>
              {step < 4 && (
                <Button type="button" disabled={!canNext} onClick={next}>
                  Επόμενο →
                </Button>
              )}
            </div>
          </div>
        </DialogPrimitive.Popup>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  )
}
