'use client'

import { useEffect } from 'react'
import { LuTriangleAlert } from 'react-icons/lu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { requiredFieldKeys } from '@/lib/ingestion/target'
import { autoMatchMappings } from '@/lib/ingestion/map'
import type { StepProps } from './types'

export function StepIngestMap({ target, state, patch }: StepProps) {
  // Auto-match μία φορά όταν φτάσει το batch — δεν ξανατρέχει αν ο χρήστης έχει ήδη αγγίξει τα mappings.
  useEffect(() => {
    if (state.batch && state.mappings.length === 0) {
      patch({ mappings: autoMatchMappings(state.batch.sourceKeys.map(s => s.key), target) })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.batch])

  if (!state.batch) {
    return <div className="p-6 text-center text-sm text-muted-foreground">Πρώτα επίλεξε πηγή.</div>
  }

  const batch = state.batch
  const mappedKeys = new Set(state.mappings.filter(m => m.fieldKey).map(m => m.fieldKey))
  const required = target.fields.filter(f => f.required)
  const missingRequired = requiredFieldKeys(target).filter(key => !mappedKeys.has(key))

  function setMapping(sourceKey: string, fieldKey: string) {
    const exists = state.mappings.some(m => m.sourceKey === sourceKey)
    const next = exists
      ? state.mappings.map(m => (m.sourceKey === sourceKey ? { ...m, fieldKey } : m))
      : [...state.mappings, { sourceKey, fieldKey }]
    patch({ mappings: next })
  }

  return (
    <div className="space-y-4 py-4">
      <div>
        <h2 className="text-[16px] font-semibold">Αντιστοίχιση πεδίων</h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground">
          Πες ποιο πεδίο της πηγής αντιστοιχεί σε ποιο πεδίο του «{target.label}».
        </p>
      </div>

      {required.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {required.map(f => {
            const mapped = mappedKeys.has(f.key)
            return (
              <span
                key={f.key}
                className="badge-pill"
                style={{
                  color: mapped ? 'var(--success)' : 'var(--coral)',
                  background: mapped ? 'var(--success-soft)' : 'var(--coral-soft)',
                }}
              >
                {f.label}{!mapped && ' · απαιτείται'}
              </span>
            )
          })}
        </div>
      )}

      {missingRequired.length > 0 && (
        <div
          className="flex items-start gap-2 rounded-xl px-3 py-2.5 text-[12px]"
          style={{ background: 'var(--coral-soft)', color: 'var(--coral)' }}
        >
          <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" />
          <span>Υποχρεωτικά πεδία χωρίς αντιστοίχιση δεν επιτρέπουν συνέχεια στο επόμενο βήμα.</span>
        </div>
      )}

      <div className="overflow-hidden rounded-xl border border-border">
        <div
          className="grid gap-3 px-4 py-2 text-[10px] font-bold tracking-widest text-muted-foreground uppercase"
          style={{ gridTemplateColumns: '1fr 1fr', background: 'var(--muted)' }}
        >
          <span>Πεδίο πηγής</span>
          <span>Πεδίο «{target.label}»</span>
        </div>
        {batch.sourceKeys.map((sk, idx) => {
          const mapping = state.mappings.find(m => m.sourceKey === sk.key)
          const fieldKey = mapping?.fieldKey ?? ''
          return (
            <div
              key={sk.key}
              className="dotted-row-bottom grid items-center gap-3 px-4 py-3"
              style={{ gridTemplateColumns: '1fr 1fr', background: idx % 2 === 0 ? 'var(--card)' : 'var(--muted)' }}
            >
              <div className="min-w-0">
                <p className="truncate text-[12.5px] font-semibold">{sk.key}</p>
                {sk.sample && <p className="mt-0.5 truncate text-[10.5px] text-muted-foreground">π.χ. {sk.sample}</p>}
              </div>
              <Select value={fieldKey || '__skip__'} onValueChange={v => setMapping(sk.key, !v || v === '__skip__' ? '' : v)}>
                <SelectTrigger size="sm" className="w-full" aria-label={`Πεδίο για ${sk.key}`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__skip__">— παράβλεψη —</SelectItem>
                  {target.fields.map(f => (
                    <SelectItem key={f.key} value={f.key}>{f.label}{f.required ? ' *' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )
        })}
      </div>

      <p className="text-[11px] text-muted-foreground">
        Τα πεδία με <strong>*</strong> είναι υποχρεωτικά. Πεδία πηγής χωρίς αντιστοίχιση αγνοούνται στην καταχώριση.
      </p>
    </div>
  )
}
