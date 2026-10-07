'use client'

import * as React from 'react'
import { Combobox as C } from '@base-ui/react/combobox'
import { ChevronDown, X, Check } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Γενικό searchable combobox (Base UI) — για φίλτρα και επιλογές από μεγάλες
 * λίστες. Πληκτρολογείς για αναζήτηση (χωρίς τόνους/πεζά-κεφαλαία), ↑/↓/Enter,
 * «×» για καθαρισμό. `value` = string id ή null.
 */
export type ComboboxOption = { value: string; label: string; hint?: string }

function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function Combobox({
  options, value, onChange, placeholder = 'Επίλεξε…', emptyText = 'Δεν βρέθηκαν αποτελέσματα.',
  className, ariaLabel, id,
}: {
  options: ComboboxOption[]
  value: string | null
  onChange: (value: string | null) => void
  placeholder?: string
  emptyText?: string
  className?: string
  ariaLabel?: string
  id?: string
}) {
  const selected = React.useMemo(() => options.find(o => o.value === value) ?? null, [options, value])

  return (
    <C.Root
      // Το πρώτο αποτέλεσμα φωτίζεται αυτόματα όσο πληκτρολογείς, ώστε το Enter
      // να το επιλέγει (χωρίς να χρειάζεται ↓ — φυσικό για μη-τεχνικούς χρήστες).
      autoHighlight
      items={options}
      value={selected}
      onValueChange={(opt: ComboboxOption | null) => onChange(opt?.value ?? null)}
      itemToStringLabel={(opt: ComboboxOption) => opt.label}
      isItemEqualToValue={(a: ComboboxOption, b: ComboboxOption) => a.value === b.value}
      filter={(opt: ComboboxOption, query: string) => {
        const q = fold(query.trim())
        return !q || fold(opt.label).includes(q) || (opt.hint ? fold(opt.hint).includes(q) : false)
      }}
    >
      <div
        className={cn(
          'relative flex h-9 min-w-[12rem] items-center rounded-full border border-border bg-card pr-1 pl-3.5',
          'focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30',
          className,
        )}
      >
        <C.Input
          id={id}
          aria-label={ariaLabel}
          placeholder={placeholder}
          className="h-full min-w-0 flex-1 bg-transparent text-[length:var(--fs-12)] font-semibold outline-none placeholder:font-medium placeholder:text-muted-foreground"
        />
        {selected && (
          <C.Clear
            aria-label="Καθαρισμός"
            className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
          >
            <X className="size-3.5" aria-hidden />
          </C.Clear>
        )}
        <C.Trigger
          aria-label="Άνοιγμα λίστας"
          className="flex size-6 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground"
        >
          <ChevronDown className="size-3.5" aria-hidden />
        </C.Trigger>
      </div>

      <C.Portal>
        <C.Positioner sideOffset={4} className="z-50">
          <C.Popup className="max-h-[min(22rem,var(--available-height))] w-max max-w-[min(32rem,calc(100vw-2rem))] min-w-[max(var(--anchor-width),22rem)] overflow-y-auto rounded-xl bg-popover p-1 text-popover-foreground shadow-lg ring-1 ring-foreground/10">
            <C.Empty className="px-3 py-2 text-[length:var(--fs-12)] font-medium text-muted-foreground empty:hidden">{emptyText}</C.Empty>
            <C.List>
              {(opt: ComboboxOption) => (
                <C.Item
                  key={opt.value}
                  value={opt}
                  className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-1.5 text-[length:var(--fs-12)] font-semibold outline-none select-none data-highlighted:bg-muted"
                >
                  <span className="flex size-4 shrink-0 items-center justify-center">
                    <C.ItemIndicator><Check className="size-3.5 text-primary" aria-hidden /></C.ItemIndicator>
                  </span>
                  <span className="min-w-0 flex-1 truncate">{opt.label}</span>
                  {opt.hint && <span className="shrink-0 text-[length:var(--fs-10-5)] font-medium text-muted-foreground">{opt.hint}</span>}
                </C.Item>
              )}
            </C.List>
          </C.Popup>
        </C.Positioner>
      </C.Portal>
    </C.Root>
  )
}
