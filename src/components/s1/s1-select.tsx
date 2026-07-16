'use client'

import { useMemo, useState } from 'react'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { cn } from '@/lib/utils'
import type { S1Option } from '@/lib/s1-options'

/**
 * Κοινό pattern component για τα S1 reference combos (VAT/Country/TrdCategory/
 * Payment/Shipment/Currency) — server-loaded options (μόνο ISACTIVE=1, βλ.
 * src/lib/s1-options.ts) περνιούνται ως props από τον server-component parent
 * (π.χ. partners/page.tsx), rendering εδώ είναι απλό client dropdown.
 * `value`/`onChange` δουλεύουν με string (SoftOne numeric id ως string) — ο
 * caller μετατρέπει σε number όταν αποθηκεύει.
 */
export function S1Select({
  id, label, options, value, onChange, allowEmpty = true, emptyLabel = '—', required, error,
}: {
  id: string
  label: string
  options: S1Option[]
  value: string | null
  onChange: (value: string | null) => void
  allowEmpty?: boolean
  emptyLabel?: string
  required?: boolean
  error?: string
}) {
  const NONE = '__none__'
  const selectValue = value ?? NONE

  return (
    <div className="field">
      <label htmlFor={id}>{label}{required ? '*' : ''}</label>
      <Select value={selectValue} onValueChange={v => onChange(v === NONE ? null : v)}>
        <SelectTrigger id={id} aria-label={label} className="h-11 w-full rounded-full border-border bg-card px-4">
          <SelectValue>{(v: string) => (v === NONE ? emptyLabel : (options.find(o => o.value === v)?.label ?? v))}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {allowEmpty && <SelectItem value={NONE}>{emptyLabel}</SelectItem>}
          {options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
        </SelectContent>
      </Select>
      {error && <div className="error">{error}</div>}
    </div>
  )
}

/**
 * Searchable variant — για μεγάλες λίστες (IrsdataSelect: 200+ ΔΟΥ). Απλό
 * text input + filtered dropdown λίστα (χωρίς εξωτερικό combobox dependency —
 * το project δεν έχει cmdk εγκατεστημένο).
 */
export function S1SearchableSelect({
  id, label, options, value, onChange, placeholder = 'Αναζήτηση…', emptyLabel = '—', required, error,
}: {
  id: string
  label: string
  options: S1Option[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  emptyLabel?: string
  required?: boolean
  error?: string
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')

  const selected = useMemo(() => options.find(o => o.value === value) ?? null, [options, value])
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return options.slice(0, 50)
    return options.filter(o => o.label.toLowerCase().includes(q) || o.value.toLowerCase().includes(q)).slice(0, 50)
  }, [options, query])

  return (
    <div className="field" style={{ position: 'relative' }}>
      <label htmlFor={id}>{label}{required ? '*' : ''}</label>
      <div className="inwrap">
        <input
          id={id}
          role="combobox"
          aria-expanded={open}
          aria-controls={`${id}-listbox`}
          value={open ? query : (selected?.label ?? '')}
          onChange={e => { setQuery(e.target.value); setOpen(true) }}
          onFocus={() => { setQuery(''); setOpen(true) }}
          onBlur={() => setTimeout(() => setOpen(false), 150)}
          placeholder={placeholder}
          autoComplete="off"
        />
      </div>
      {open && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          className={cn(
            'absolute z-50 mt-1 max-h-64 w-full overflow-y-auto rounded-lg bg-popover text-popover-foreground shadow-md ring-1 ring-foreground/10',
          )}
          style={{ top: '100%' }}
        >
          <button
            type="button"
            className="flex w-full cursor-default items-center px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
            onMouseDown={e => { e.preventDefault(); onChange(null); setOpen(false) }}
          >
            {emptyLabel}
          </button>
          {filtered.length === 0 && <div className="px-3 py-2 text-[12px] text-muted-foreground">Δεν βρέθηκαν αποτελέσματα.</div>}
          {filtered.map(o => (
            <button
              key={o.value}
              type="button"
              className="flex w-full cursor-default items-center px-3 py-1.5 text-left text-sm hover:bg-accent hover:text-accent-foreground"
              onMouseDown={e => { e.preventDefault(); onChange(o.value); setOpen(false) }}
            >
              {o.label}
            </button>
          ))}
        </div>
      )}
      {error && <div className="error">{error}</div>}
    </div>
  )
}
