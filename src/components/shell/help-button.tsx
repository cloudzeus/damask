'use client'

import * as React from 'react'
import { HelpCircle, Search, ArrowRight } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'

/** Ο κύκλος ζωής μιας πρότασης, με απλά λόγια. */
const FLOW = [
  'Πελάτης — τον καταχωρείς με το ΑΦΜ',
  'Πρόγραμμα — ανεβάζεις την προκήρυξη',
  'Έργο — συνδέεις πελάτη με πρόγραμμα',
  'Δικαιολογητικά & δαπάνες — τα μαζεύεις',
  'Υποβολή — όταν όλα είναι έτοιμα',
  'Αγορές & αποπληρωμή — μετά την έγκριση',
]

/** Λεξικό όρων — τι σημαίνουν οι «δύσκολες» λέξεις. */
const GLOSSARY: { term: string; def: string }[] = [
  { term: 'ΟΠΣΚΕ', def: 'Το σύστημα του κράτους όπου υποβάλλεται επίσημα η πρόταση.' },
  { term: 'Δικαιολογητικά', def: 'Τα έγγραφα που πρέπει να μαζέψεις (π.χ. φορολογική ενημερότητα).' },
  { term: 'Πιστοποίηση', def: 'Η επιβεβαίωση ότι η δαπάνη έγινε πραγματικά (φωτογραφία προϊόντος, θέση).' },
  { term: 'Αποπληρωμή', def: 'Το αίτημα να πληρωθεί ο πελάτης για μια εγκεκριμένη δαπάνη.' },
  { term: 'Lead', def: 'Κάποιος που έδειξε ενδιαφέρον (π.χ. από τη φόρμα επιλεξιμότητας) αλλά δεν είναι ακόμη πελάτης.' },
]

/**
 * Διακριτικό «?» στο topbar → σύντομη βοήθεια για μη-τεχνικό χρήστη: πώς δουλεύει
 * η εφαρμογή, το ⌘K, και λεξικό όρων. (Το πλήρες εγχειρίδιο έρχεται.)
 */
export function HelpButton() {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Βοήθεια"
        className="hidden size-[30px] shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground sm:flex"
      >
        <HelpCircle className="size-[1.15rem]" strokeWidth={1.8} aria-hidden />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="glass sm:max-w-[520px]">
          <DialogHeader>
            <DialogTitle>Βοήθεια — πώς δουλεύει</DialogTitle>
            <DialogDescription>Τα βασικά με απλά λόγια. Το αναλυτικό εγχειρίδιο έρχεται σύντομα.</DialogDescription>
          </DialogHeader>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-muted/50 px-3 py-2.5 text-[0.78125rem]">
            <Search className="size-4 shrink-0 text-primary" aria-hidden />
            <span>Πάτα <kbd className="rounded border border-border px-1 text-[0.6875rem]">⌘K</kbd> από οπουδήποτε για να βρεις γρήγορα πελάτη, έργο ή πρόγραμμα.</span>
          </div>

          <div>
            <h3 className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-muted-foreground">Ο κύκλος μιας πρότασης</h3>
            <ol className="flex flex-col gap-1.5">
              {FLOW.map((f, i) => (
                <li key={i} className="flex items-center gap-2 text-[0.8125rem]">
                  <span className="flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/10 text-[0.6875rem] font-bold text-primary tabular-nums">{i + 1}</span>
                  <span className="text-foreground">{f}</span>
                  {i < FLOW.length - 1 && <ArrowRight className="ml-auto size-3 shrink-0 text-muted-foreground" aria-hidden />}
                </li>
              ))}
            </ol>
          </div>

          <div>
            <h3 className="mb-2 text-[0.6875rem] font-bold uppercase tracking-wide text-muted-foreground">Λεξικό όρων</h3>
            <dl className="flex flex-col gap-2">
              {GLOSSARY.map(g => (
                <div key={g.term} className="rounded-lg bg-muted/40 px-3 py-2">
                  <dt className="text-[0.78125rem] font-semibold text-foreground">{g.term}</dt>
                  <dd className="text-[0.71875rem] text-muted-foreground">{g.def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </DialogContent>
      </Dialog>
    </>
  )
}
