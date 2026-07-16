'use client'

import { S1Select } from './s1-select'
import type { S1Option } from '@/lib/s1-options'

export function ShipmentSelect({ id = 'shipment-select', label = 'Τρόπος αποστολής', options, value, onChange, required, error }: {
  id?: string; label?: string; options: S1Option[]; value: string | null; onChange: (v: string | null) => void; required?: boolean; error?: string
}) {
  return <S1Select id={id} label={label} options={options} value={value} onChange={onChange} required={required} error={error} />
}
