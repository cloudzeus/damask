'use client'

import * as React from 'react'
import Link from 'next/link'
import { Compass, X, Building2, Landmark, Link2, Wallet, ArrowRight } from 'lucide-react'

const KEY = 'damask:first-steps-dismissed'

const STEPS = [
  { icon: Building2, label: 'Καταχώρισε έναν πελάτη', hint: 'Με το ΑΦΜ — τα στοιχεία έρχονται αυτόματα από την ΑΑΔΕ.', href: '/partners' },
  { icon: Landmark, label: 'Πρόσθεσε ένα πρόγραμμα', hint: 'Ανέβασε την προκήρυξη — η αποδελτίωση εξάγει μόνη της τα βασικά.', href: '/programs' },
  { icon: Link2, label: 'Σύνδεσε πελάτη με πρόγραμμα', hint: 'Από την καρτέλα του πελάτη → «Σύνδεση με πρόγραμμα» — έτσι ξεκινά ένα έργο.', href: '/partners' },
  { icon: Wallet, label: 'Δούλεψε το έργο', hint: 'Δικαιολογητικά, δαπάνες, υποβολή, αποπληρωμή — όλα από την καρτέλα του έργου.', href: '/pm' },
]

/**
 * «Πρώτα βήματα» — καθοδήγηση για νέο/μη-τεχνικό χρήστη στο dashboard. Δείχνει τα
 * 4 βασικά βήματα ως clickable κάρτες. Κλείνει με persist σε localStorage ώστε να
 * μην ενοχλεί ξανά. Ασφαλές σε private window (try/catch).
 */
export function FirstSteps() {
  const [dismissed, setDismissed] = React.useState<boolean | null>(null)

  React.useEffect(() => {
    let v = false
    try { v = localStorage.getItem(KEY) === '1' } catch { /* ignore */ }
    setDismissed(v)
  }, [])

  function close() {
    setDismissed(true)
    try { localStorage.setItem(KEY, '1') } catch { /* ignore */ }
  }

  if (dismissed !== false) return null // null = δεν φορτώθηκε ακόμη (αποφυγή flash), true = κλειστό

  return (
    <section className="glass relative mb-3 px-4 pt-3.5 pb-4">
      <button type="button" onClick={close} aria-label="Κλείσιμο οδηγού" className="absolute top-3 right-3 flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground">
        <X className="size-4" aria-hidden />
      </button>
      <header className="mb-3 flex items-center gap-2 pr-8">
        <span className="flex size-[1.75rem] items-center justify-center rounded-[0.6875rem]" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
          <Compass className="size-[0.9375rem]" strokeWidth={1.8} aria-hidden />
        </span>
        <div>
          <h2 className="text-[0.8125rem] font-bold text-foreground">Πρώτα βήματα</h2>
          <p className="text-[0.6875rem] text-muted-foreground">Νέος εδώ; Ακολούθησε τη σειρά — κάθε βήμα σε πάει εκεί που χρειάζεται.</p>
        </div>
      </header>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-4">
        {STEPS.map((s, i) => {
          const Icon = s.icon
          return (
            <Link key={i} href={s.href} className="group flex items-start gap-2.5 rounded-xl border border-border bg-card/60 px-3 py-2.5 transition-colors hover:border-primary/40 hover:bg-muted">
              <span className="flex size-7 shrink-0 items-center justify-center rounded-lg" style={{ background: 'var(--muted)', color: 'var(--primary)' }}>
                <Icon className="size-4" strokeWidth={1.8} aria-hidden />
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-center gap-1 text-[0.78125rem] font-semibold text-foreground">
                  <span className="text-muted-foreground tabular-nums">{i + 1}.</span> {s.label}
                  <ArrowRight className="size-3 shrink-0 opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
                </span>
                <span className="mt-0.5 block text-[0.6875rem] leading-snug text-muted-foreground">{s.hint}</span>
              </span>
            </Link>
          )
        })}
      </div>
    </section>
  )
}
