'use client'

import { S1SearchableSelect } from './s1-select'
import type { S1Option } from '@/lib/s1-options'

/** value = Irsdata.CODE (string κωδικός ΔΟΥ) — searchable, 200+ entries. */
export function IrsdataSelect({ id = 'irsdata-select', label = 'Δ.Ο.Υ.', options, value, onChange, required, error }: {
  id?: string; label?: string; options: S1Option[]; value: string | null; onChange: (v: string | null) => void; required?: boolean; error?: string
}) {
  return <S1SearchableSelect id={id} label={label} options={options} value={value} onChange={onChange} placeholder="Αναζήτηση Δ.Ο.Υ…" required={required} error={error} />
}
