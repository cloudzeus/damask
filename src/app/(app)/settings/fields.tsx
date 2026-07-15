'use client'

import { useState } from 'react'
import { Eye, EyeOff, Check, AlertTriangle } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import { relativeTime } from '@/lib/relative-time'
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select'
import type { CheckResult } from '@/lib/settings'

/** Κοινά field primitives για τις κάρτες integrations + τις φόρμες Εταιρεία/SEO του /settings. */

/**
 * Client-side προεπισκόπηση μάσκας (ίδιος αλγόριθμος με το server-side
 * maskSecret του src/lib/settings.ts — duplicated εδώ γιατί εκείνο το module
 * εισάγει prisma και δεν πρέπει να μπει σε client bundle). Χρησιμοποιείται
 * ΜΟΝΟ αμέσως μετά από επιτυχή αποθήκευση, πάνω στο plaintext που μόλις
 * υπέβαλε ο ίδιος ο χρήστης, ώστε η κάρτα να δείξει αμέσως το νέο «••••1234»
 * χωρίς να χρειάζεται full reload.
 */
export function maskSecretPreview(value: string): string | null {
  const str = value.trim()
  if (!str) return null
  if (str.length <= 4) return '•'.repeat(str.length)
  return `${'•'.repeat(Math.min(10, str.length - 4))}${str.slice(-4)}`
}

export function TextField({
  id, label, icon: Icon, value, onChange, type = 'text', placeholder, error, help, required,
}: {
  id: string
  label: string
  icon: LucideIcon
  value: string
  onChange: (value: string) => void
  type?: string
  placeholder?: string
  error?: string
  help?: string
  required?: boolean
}) {
  return (
    <div className="field">
      <label htmlFor={id}>
        {label}
        {required ? '*' : ''}
      </label>
      <div className="inwrap">
        <Icon aria-hidden />
        <input
          id={id}
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={placeholder}
          required={required}
        />
      </div>
      {help && !error && <div className="help">{help}</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

/**
 * Secret πεδίο: password input με show/hide (ίδιο idiom με το `.eye` toggle του
 * users/user-form-dialog.tsx). Όταν υπάρχει ήδη αποθηκευμένη τιμή, `maskedHint`
 * είναι το server-computed «••••••1234» (μόνο τελευταία 4 ορατά) — εμφανίζεται
 * ως placeholder ΚΑΙ η πραγματική τιμή ΔΕΝ φτάνει ποτέ στον browser όσο το
 * πεδίο μένει άθικτο. Κενό στο submit σημαίνει «κράτα την ήδη αποθηκευμένη» —
 * ίδια σύμβαση με το password στο createUser/updateUser.
 */
export function SecretField({
  id, label, icon: Icon, value, onChange, maskedHint, error,
}: {
  id: string
  label: string
  icon: LucideIcon
  value: string
  onChange: (value: string) => void
  maskedHint: string | null
  error?: string
}) {
  const [revealed, setRevealed] = useState(false)
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <div className="inwrap">
        <Icon aria-hidden />
        <input
          id={id}
          type={revealed ? 'text' : 'password'}
          value={value}
          onChange={e => onChange(e.target.value)}
          placeholder={maskedHint ?? 'Δεν έχει οριστεί'}
          autoComplete="off"
          style={{ paddingRight: 42 }}
        />
        <button
          type="button"
          className="eye"
          aria-label={revealed ? 'Απόκρυψη' : 'Εμφάνιση'}
          aria-pressed={revealed}
          onClick={() => setRevealed(v => !v)}
        >
          {revealed ? <EyeOff width={15} height={15} strokeWidth={1.8} aria-hidden /> : <Eye width={15} height={15} strokeWidth={1.8} aria-hidden />}
        </button>
      </div>
      {maskedHint && !error && <div className="help">Άφησέ το κενό — θα κρατηθεί η ήδη αποθηκευμένη τιμή.</div>}
      {error && <div className="error">{error}</div>}
    </div>
  )
}

export function SelectField({
  id, label, value, onChange, options, help,
}: {
  id: string
  label: string
  value: string
  onChange: (value: string) => void
  options: { value: string; label: string }[]
  help?: string
}) {
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <Select value={value} onValueChange={v => onChange(v as string)}>
        <SelectTrigger id={id} aria-label={label} className="h-11 w-full rounded-full border-border bg-card px-4">
          <SelectValue>{(v: string) => options.find(o => o.value === v)?.label ?? 'Επίλεξε…'}</SelectValue>
        </SelectTrigger>
        <SelectContent>
          {options.map(o => (
            <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>
          ))}
        </SelectContent>
      </Select>
      {help && <div className="help">{help}</div>}
    </div>
  )
}

/** Ρυθμισμένο ✓ / Μη ρυθμισμένο — badge εικονίδιο+λέξη+χρώμα (MASTER §6.6). */
export function ConfiguredBadge({ configured }: { configured: boolean }) {
  return configured ? (
    <span className="badge-pill ok">
      <Check className="size-3" strokeWidth={2.5} aria-hidden />
      Ρυθμισμένο
    </span>
  ) : (
    <span className="badge-pill muted">Μη ρυθμισμένο</span>
  )
}

/** Τελευταίος έλεγχος σύνδεσης — ✓ Επιτυχής / ⚠ μήνυμα, με σχετικό χρόνο. */
export function LastCheckBadge({ lastCheck, className }: { lastCheck: CheckResult | null; className?: string }) {
  if (!lastCheck) return null
  return (
    <span
      className={cn('badge-pill', lastCheck.ok ? 'ok' : 'warn', className)}
      style={{ maxWidth: '100%' }}
      title={lastCheck.ok ? undefined : lastCheck.message}
    >
      {lastCheck.ok ? <Check className="size-3 shrink-0" strokeWidth={2.5} aria-hidden /> : <AlertTriangle className="size-3 shrink-0" strokeWidth={2.2} aria-hidden />}
      <span className="truncate">{lastCheck.ok ? 'Επιτυχής σύνδεση' : lastCheck.message}</span>
      <span className="shrink-0 opacity-70">· {relativeTime(lastCheck.at)}</span>
    </span>
  )
}

export function CardHeader({
  icon: Icon, title, description, configured, lastCheck,
}: {
  icon: LucideIcon
  title: string
  description: string
  configured: boolean
  lastCheck: CheckResult | null
}) {
  return (
    <div className="mb-3.5 flex items-start gap-3">
      <div
        className="flex size-9 shrink-0 items-center justify-center rounded-[12px]"
        style={{ background: 'var(--info-soft)', color: 'var(--info)' }}
      >
        <Icon className="size-4" strokeWidth={1.8} aria-hidden />
      </div>
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
          <h3 className="text-[14.5px] font-bold">{title}</h3>
          <ConfiguredBadge configured={configured} />
        </div>
        <p className="mt-0.5 text-[12px] text-muted-foreground">{description}</p>
        <LastCheckBadge lastCheck={lastCheck} className="mt-1.5" />
      </div>
    </div>
  )
}
