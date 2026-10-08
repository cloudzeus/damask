'use client'

import { Search, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/** Πεζά + χωρίς τόνους — «Καταστατικό» ταιριάζει με «καταστατικο». */
export function foldText(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

/** Όλες οι λέξεις του φίλτρου υπάρχουν κάπου στα πεδία. */
export function matchesFilter(q: string, ...fields: unknown[]): boolean {
  const terms = foldText(q).split(/\s+/).filter(Boolean)
  if (!terms.length) return true
  const hay = fields.map(foldText).join(' ')
  return terms.every(t => hay.includes(t))
}

/** Μικρό πεδίο φίλτρου λίστας (καρτέλες πελάτη κ.λπ.). */
export function ListFilter({ value, onChange, placeholder = 'Αναζήτηση…', className }: { value: string; onChange: (v: string) => void; placeholder?: string; className?: string }) {
  return (
    <div className={cn('flex items-center gap-2 rounded-full border border-border bg-card px-3 py-1.5 focus-within:border-ring', className)}>
      <Search className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
      <input
        value={value}
        onChange={e => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="min-w-0 flex-1 bg-transparent text-[length:var(--fs-12-5)] outline-none"
      />
      {value && (
        <button type="button" onClick={() => onChange('')} aria-label="Καθαρισμός" className="text-muted-foreground hover:text-foreground">
          <X className="size-3.5" />
        </button>
      )}
    </div>
  )
}
