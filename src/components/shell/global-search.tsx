'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { Search, LoaderCircle, Building2, Truck, Landmark, FolderKanban, UserPlus, CornerDownLeft } from 'lucide-react'
import { Dialog, DialogContent } from '@/components/ui/dialog'
import { searchEverything, type SearchResult, type SearchResultKind } from '@/lib/search/global'

const KIND: Record<SearchResultKind, { label: string; icon: typeof Building2 }> = {
  customer: { label: 'Πελάτης', icon: Building2 },
  supplier: { label: 'Προμηθευτής', icon: Truck },
  program: { label: 'Πρόγραμμα', icon: Landmark },
  project: { label: 'Έργο', icon: FolderKanban },
  lead: { label: 'Lead', icon: UserPlus },
}

/**
 * Καθολική αναζήτηση (⌘K / Ctrl+K). Αντικαθιστά το εικονικό κουτί του topbar με
 * πραγματική παλέτα: γράφεις όνομα/ΑΦΜ → βλέπεις πελάτες/έργα/προγράμματα/leads →
 * Enter ή κλικ για κατευθείαν μετάβαση. Πλήκτρα ↑/↓ για επιλογή.
 */
export function GlobalSearch() {
  const router = useRouter()
  const [open, setOpen] = React.useState(false)
  const [q, setQ] = React.useState('')
  const [results, setResults] = React.useState<SearchResult[]>([])
  const [loading, setLoading] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement | null>(null)

  // ⌘K / Ctrl+K ανοίγει από παντού.
  React.useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault(); setOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Αναζήτηση με debounce όταν αλλάζει το query. Όλα τα setState μέσα στο
  // timeout (async) — όχι σύγχρονα στο σώμα του effect.
  React.useEffect(() => {
    const query = q.trim()
    const t = setTimeout(() => {
      if (query.length < 2) { setResults([]); setLoading(false); return }
      setLoading(true)
      searchEverything(query).then(r => { setResults(r); setActive(0) }).catch(() => setResults([])).finally(() => setLoading(false))
    }, 200)
    return () => clearTimeout(t)
  }, [q])

  function reset() { setQ(''); setResults([]); setActive(0) }
  function go(r: SearchResult) { setOpen(false); reset(); router.push(r.href) }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setActive(a => Math.min(a + 1, results.length - 1)) }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActive(a => Math.max(a - 1, 0)) }
    else if (e.key === 'Enter' && results[active]) { e.preventDefault(); go(results[active]) }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Καθολική αναζήτηση"
        className="flex h-[34px] min-w-0 flex-1 cursor-pointer items-center gap-2 rounded-full border border-border bg-card px-3.5 text-[0.78125rem] text-muted-foreground shadow-[inset_0_1px_3px_rgb(23_43_58_/_5%)] transition-colors hover:border-primary/40 sm:min-w-[220px] sm:flex-none"
      >
        <Search className="size-3.5 shrink-0" strokeWidth={1.8} />
        <span className="truncate">Αναζήτηση πελάτη, έργου, προγράμματος…</span>
        <span className="ml-auto hidden rounded border border-border px-1 text-[0.625rem] sm:inline">⌘K</span>
      </button>

      <Dialog open={open} onOpenChange={o => { setOpen(o); if (!o) reset() }}>
        <DialogContent className="glass gap-0 overflow-hidden p-0 sm:max-w-[560px]" showCloseButton={false}>
          <div className="flex items-center gap-2.5 border-b border-border px-4 py-3">
            <Search className="size-4 shrink-0 text-muted-foreground" strokeWidth={1.8} aria-hidden />
            <input
              ref={inputRef}
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={onKeyDown}
              autoFocus
              placeholder="Όνομα ή ΑΦΜ…"
              className="min-w-0 flex-1 bg-transparent text-[0.9375rem] text-foreground outline-none placeholder:text-muted-foreground"
            />
            {loading && <LoaderCircle className="size-4 shrink-0 animate-spin text-muted-foreground" aria-hidden />}
          </div>

          <div className="max-h-[min(60vh,420px)] overflow-y-auto p-1.5">
            {q.trim().length < 2 ? (
              <p className="px-3 py-6 text-center text-[0.78125rem] text-muted-foreground">Γράψε τουλάχιστον 2 χαρακτήρες — όνομα εταιρίας ή ΑΦΜ.</p>
            ) : !loading && results.length === 0 ? (
              <p className="px-3 py-6 text-center text-[0.78125rem] text-muted-foreground">Κανένα αποτέλεσμα για «{q.trim()}».</p>
            ) : (
              <ul className="flex flex-col gap-0.5">
                {results.map((r, i) => {
                  const meta = KIND[r.kind]
                  const Icon = meta.icon
                  return (
                    <li key={`${r.kind}-${r.id}`}>
                      <button
                        type="button"
                        onClick={() => go(r)}
                        onMouseEnter={() => setActive(i)}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors ${i === active ? 'bg-muted' : 'hover:bg-muted/60'}`}
                      >
                        <span className="flex size-8 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--muted)', color: 'var(--primary)' }}>
                          <Icon className="size-4" strokeWidth={1.8} aria-hidden />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[0.8125rem] font-semibold text-foreground">{r.title}</span>
                          <span className="block truncate text-[0.6875rem] text-muted-foreground">{meta.label}{r.subtitle ? ` · ${r.subtitle}` : ''}</span>
                        </span>
                        {i === active && <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />}
                      </button>
                    </li>
                  )
                })}
              </ul>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
