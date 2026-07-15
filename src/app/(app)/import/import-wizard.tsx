'use client'

import { useState } from 'react'
import {
  LuFileSpreadsheet, LuTable, LuGitMerge, LuListChecks, LuRocket, LuCheck,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { PRODUCT_TARGET } from '@/lib/import/targets'
import { DEFAULT_IMPORT_CONFIG, type ImportConfig } from './types'
import { StepUpload } from './step-upload'
import { StepSheet } from './step-sheet'
import { StepMapping, type MappingTemplate } from './step-mapping'
import { StepValidate } from './step-validate'
import { StepExecute } from './step-execute'

const STEPS = [
  { id: 1, label: 'Αρχείο', icon: LuFileSpreadsheet },
  { id: 2, label: 'Φύλλο & Στήλες', icon: LuTable },
  { id: 3, label: 'Αντιστοίχιση', icon: LuGitMerge },
  { id: 4, label: 'Έλεγχος', icon: LuListChecks },
  { id: 5, label: 'Εκτέλεση', icon: LuRocket },
] as const

type StepId = (typeof STEPS)[number]['id']

function canProceed(step: StepId, config: ImportConfig): boolean {
  switch (step) {
    case 1:
      return !!config.fileName && config.sheets.length > 0
    case 2:
      return !!config.selectedSheet && config.columns.length - config.excludedColumns.length > 0
    case 3: {
      const mappedKeys = new Set(config.mappings.filter(m => m.fieldKey).map(m => m.fieldKey))
      return PRODUCT_TARGET.fields.filter(f => f.required).every(f => mappedKeys.has(f.key))
    }
    case 4:
      return !!config.validation && config.validation.toCreate + config.validation.toUpdate > 0
    case 5:
      return true
  }
}

export function ExcelImportWizard({ initialTemplates }: { initialTemplates: MappingTemplate[] }) {
  const [step, setStep] = useState<StepId>(1)
  const [config, setConfig] = useState<ImportConfig>(DEFAULT_IMPORT_CONFIG)

  function patch(update: Partial<ImportConfig>) {
    setConfig(prev => ({ ...prev, ...update }))
  }

  function goTo(target: StepId) {
    if (target <= step || canProceed(step, config)) setStep(target)
  }

  function next() {
    if (canProceed(step, config) && step < 5) setStep((step + 1) as StepId)
  }

  function back() {
    if (step > 1) setStep((step - 1) as StepId)
  }

  const canNext = canProceed(step, config)
  const executing = step === 5 && (config.execution?.status === 'RUNNING')
  const backDisabled = step === 1 || executing

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-5">
      <div className="glass rounded-2xl px-6 py-5">
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

      <div className="glass rounded-2xl p-6 sm:p-7" style={{ minHeight: 420 }}>
        {step === 1 && <StepUpload config={config} onChange={patch} />}
        {step === 2 && <StepSheet config={config} onChange={patch} />}
        {step === 3 && <StepMapping config={config} onChange={patch} templates={initialTemplates} />}
        {step === 4 && <StepValidate config={config} onChange={patch} />}
        {step === 5 && <StepExecute config={config} onChange={patch} />}
      </div>

      <div className="flex items-center justify-between gap-3">
        <div>
          {step > 1 && (
            <Button type="button" variant="ghost" onClick={back} disabled={backDisabled}>
              ← Πίσω
            </Button>
          )}
        </div>
        <div className="flex items-center gap-3">
          <span className="text-[12px] text-muted-foreground">Βήμα {step} από {STEPS.length}</span>
          {step < 5 && (
            <Button type="button" disabled={!canNext} onClick={next}>
              {step === 4 ? 'Συνέχεια στην Εκτέλεση →' : 'Επόμενο →'}
            </Button>
          )}
        </div>
      </div>
    </div>
  )
}
