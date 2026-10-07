'use client'

import * as React from 'react'
import { X, UserRound, Building2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RecipientSuggestion } from '@/lib/email/actions'

/**
 * Πεδίο παραληπτών με «chips» + αυτόματες προτάσεις (επαφές πελάτη & συνεργάτες).
 * Η τιμή μένει comma-separated string (ίδιο API με το backend). Enter / Tab / κόμμα
 * προσθέτουν, Backspace σε κενό πεδίο αφαιρεί το τελευταίο, ↑/↓ για τις προτάσεις.
 */

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}

export function RecipientInput({
  id, value, onChange, suggestions, placeholder, icon, disabled,
}: {
  id: string
  value: string
  onChange: (v: string) => void
  suggestions: RecipientSuggestion[]
  placeholder?: string
  icon?: React.ReactNode
  disabled?: boolean
}) {
  const emails = React.useMemo(() => value.split(',').map(s => s.trim()).filter(Boolean), [value])
  const [query, setQuery] = React.useState('')
  const [open, setOpen] = React.useState(false)
  const [active, setActive] = React.useState(0)
  const inputRef = React.useRef<HTMLInputElement>(null)
  const listId = `${id}-suggestions`

  const nameOf = React.useMemo(() => new Map(suggestions.map(s => [s.email.toLowerCase(), s.name])), [suggestions])

  const filtered = React.useMemo(() => {
    const q = fold(query.trim())
    const taken = new Set(emails.map(e => e.toLowerCase()))
    return suggestions
      .filter(s => !taken.has(s.email.toLowerCase()))
      .filter(s => !q || fold(`${s.name} ${s.email} ${s.hint ?? ''}`).includes(q))
      .slice(0, 8)
  }, [query, suggestions, emails])

  function commit(list: string[]) {
    onChange([...new Set(list.map(s => s.trim()).filter(Boolean))].join(', '))
  }
  function add(email: string) {
    const e = email.trim().replace(/[,;]+$/, '')
    if (!e) return
    commit([...emails, e])
    setQuery('')
    setActive(0)
  }
  function remove(email: string) {
    commit(emails.filter(e => e !== email))
    inputRef.current?.focus()
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'ArrowDown' && filtered.length) { e.preventDefault(); setOpen(true); setActive(a => (a + 1) % filtered.length); return }
    if (e.key === 'ArrowUp' && filtered.length) { e.preventDefault(); setActive(a => (a - 1 + filtered.length) % filtered.length); return }
    if (e.key === 'Escape' && open) { e.preventDefault(); e.stopPropagation(); setOpen(false); return }
    if (e.key === 'Enter' || e.key === ',' || e.key === ';' || (e.key === 'Tab' && query.trim())) {
      if (open && filtered[active] && (e.key === 'Enter' || e.key === 'Tab')) { e.preventDefault(); add(filtered[active].email); return }
      if (query.trim()) { e.preventDefault(); add(query); return }
      if (e.key === 'Enter') e.preventDefault()
      return
    }
    if (e.key === 'Backspace' && !query && emails.length) remove(emails[emails.length - 1])
  }

  return (
    <div className="relative">
      <div
        className={cn('recip', disabled && 'opacity-60')}
        onClick={() => inputRef.current?.focus()}
      >
        <span className="recip-icon">{icon}</span>
        {emails.map(e => {
          const valid = EMAIL_RE.test(e)
          const name = nameOf.get(e.toLowerCase())
          return (
            <span
              key={e}
              title={valid ? e : `Μη έγκυρο email: ${e}`}
              className={cn(
                'inline-flex max-w-full items-center gap-1 rounded-full border px-2 py-0.5 text-[length:var(--fs-12)] font-semibold',
                valid ? 'border-border bg-muted text-foreground' : 'border-destructive/40 bg-destructive/10 text-destructive',
              )}
            >
              <span className="truncate">{name ? `${name}` : e}</span>
              {name && <span className="hidden truncate font-normal text-muted-foreground sm:inline">{e}</span>}
              {!disabled && (
                <button type="button" onClick={ev => { ev.stopPropagation(); remove(e) }} aria-label={`Αφαίρεση ${e}`} className="rounded-full p-0.5 hover:bg-foreground/10">
                  <X className="size-3" aria-hidden />
                </button>
              )}
            </span>
          )
        })}
        <input
          ref={inputRef}
          id={id}
          role="combobox"
          aria-expanded={open && filtered.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          autoComplete="off"
          disabled={disabled}
          value={query}
          onChange={e => {
            const v = e.target.value
            // Επικόλληση πολλών διευθύνσεων μαζί
            if (/[,;\s]/.test(v) && v.split(/[,;\s]+/).filter(Boolean).length > 1) {
              commit([...emails, ...v.split(/[,;\s]+/)])
              setQuery('')
              return
            }
            setQuery(v)
            setOpen(true)
            setActive(0)
          }}
          onFocus={() => setOpen(true)}
          onBlur={() => { setTimeout(() => setOpen(false), 120); if (query.trim() && EMAIL_RE.test(query.trim())) add(query) }}
          onKeyDown={onKeyDown}
          placeholder={emails.length ? '' : placeholder}
          className="recip-input"
        />
      </div>

      {open && filtered.length > 0 && (
        <ul id={listId} role="listbox" className="absolute top-full right-0 left-0 z-40 mt-1 max-h-72 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-xl">
          {filtered.map((s, i) => (
            <li
              key={s.email}
              role="option"
              aria-selected={i === active}
              onMouseDown={e => { e.preventDefault(); add(s.email) }}
              onMouseEnter={() => setActive(i)}
              className={cn('flex cursor-pointer items-center gap-2.5 rounded-lg px-2.5 py-1.5', i === active && 'bg-muted')}
            >
              <span className={cn('flex size-7 shrink-0 items-center justify-center rounded-full', s.kind === 'user' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground')}>
                {s.kind === 'user' ? <UserRound className="size-3.5" aria-hidden /> : <Building2 className="size-3.5" aria-hidden />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[length:var(--fs-12-5)] font-semibold">{s.name}</span>
                <span className="block truncate text-[length:var(--fs-11)] text-muted-foreground">{s.email}{s.hint ? ` · ${s.hint}` : ''}</span>
              </span>
              <span className="shrink-0 text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
                {s.kind === 'user' ? 'Συνεργάτης' : 'Πελάτης'}
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
