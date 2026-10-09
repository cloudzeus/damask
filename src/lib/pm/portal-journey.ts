import type { LifecycleStr, StageStr } from '@/lib/pm/types'

/**
 * (Plain module.) Η πορεία ενός έργου ΕΣΠΑ όπως την καταλαβαίνει ο πελάτης: 6 απλά βήματα με
 * «τι γίνεται τώρα» και «τι ακολουθεί» — παράγονται από τα εσωτερικά lifecycle/stage/πληρωμές.
 */

export type JourneyKey = 'assessment' | 'documents' | 'submission' | 'implementation' | 'certification' | 'payment'
export type JourneyStep = { key: JourneyKey; label: string; desc: string; state: 'done' | 'current' | 'todo' }
export type Journey = { steps: JourneyStep[]; currentIndex: number; now: string; next: string | null; percent: number }

const STEPS: { key: JourneyKey; label: string; desc: string; now: string }[] = [
  { key: 'assessment', label: 'Αξιολόγηση', desc: 'Ελέγχουμε αν η επιχείρησή σας ταιριάζει στο πρόγραμμα.',
    now: 'Εξετάζουμε τα στοιχεία της επιχείρησής σας και τους όρους του προγράμματος, για να δούμε αν και πώς μπορείτε να ενταχθείτε.' },
  { key: 'documents', label: 'Δικαιολογητικά', desc: 'Συγκεντρώνουμε τα έγγραφα για τον φάκελο.',
    now: 'Ετοιμάζουμε τον φάκελο της αίτησης. Το πιο σημαντικό τώρα είναι να ανεβάσετε τα δικαιολογητικά που σας ζητάμε παρακάτω.' },
  { key: 'submission', label: 'Υποβολή & έγκριση', desc: 'Η αίτηση υποβάλλεται και αξιολογείται από τον φορέα.',
    now: 'Η αίτησή σας έχει υποβληθεί (ή υποβάλλεται) στο ΟΠΣΚΕ και περιμένουμε την αξιολόγηση του φορέα. Θα σας ενημερώσουμε μόλις βγει η απόφαση.' },
  { key: 'implementation', label: 'Υλοποίηση', desc: 'Κάνετε τις αγορές της επένδυσης.',
    now: 'Το έργο εγκρίθηκε και βρίσκεται σε υλοποίηση. Πριν από κάθε αγορά ρωτήστε μας (ή τον βοηθό) αν η δαπάνη είναι επιλέξιμη και στείλτε μας τα παραστατικά.' },
  { key: 'certification', label: 'Πιστοποίηση', desc: 'Ο φορέας ελέγχει τις δαπάνες.',
    now: 'Έχει υποβληθεί αίτημα πιστοποίησης/πληρωμής. Ο φορέας ελέγχει τα παραστατικά και μπορεί να κάνει επιτόπιο έλεγχο στην επιχείρηση.' },
  { key: 'payment', label: 'Εκταμίευση', desc: 'Η επιδότηση καταβάλλεται στον λογαριασμό σας.',
    now: 'Το έργο είναι στο στάδιο της αποπληρωμής: η επιδότηση καταβάλλεται στον τραπεζικό λογαριασμό της επιχείρησης.' },
]

export type JourneyInput = {
  lifecycle: LifecycleStr
  stage: StageStr
  opskeSubmitted: boolean
  /** Αιτήματα πληρωμής που έχουν υποβληθεί/εγκριθεί (όχι πρόχειρα). */
  paymentRequestsInProgress: number
  /** Πληρωμές που έχουν ήδη καταβληθεί. */
  paymentsPaid: number
}

export function journeyIndex(i: JourneyInput): number {
  switch (i.lifecycle) {
    case 'POTENTIAL':
      return i.stage === 'ASSESSMENT' ? 0 : 1
    case 'SUBMITTING':
      if (i.opskeSubmitted || i.stage === 'OPSKE_SUBMISSION' || i.stage === 'INSPECTION' || i.stage === 'MONITORING') return 2
      return i.stage === 'ASSESSMENT' ? 0 : 1
    case 'IMPLEMENTATION':
    case 'MODIFICATIONS':
      if (i.paymentsPaid > 0) return 5
      return i.paymentRequestsInProgress > 0 ? 4 : 3
    case 'PAYMENT':
      return 5
  }
}

export function buildJourney(i: JourneyInput): Journey {
  const idx = journeyIndex(i)
  const steps: JourneyStep[] = STEPS.map((s, k) => ({ key: s.key, label: s.label, desc: s.desc, state: k < idx ? 'done' : k === idx ? 'current' : 'todo' }))
  const modNote = i.lifecycle === 'MODIFICATIONS' ? ' Αυτή την περίοδο επεξεργαζόμαστε και ένα αίτημα τροποποίησης του έργου.' : ''
  return {
    steps,
    currentIndex: idx,
    now: STEPS[idx].now + modNote,
    next: idx < STEPS.length - 1 ? `${STEPS[idx + 1].label}: ${STEPS[idx + 1].desc}` : null,
    percent: Math.round(((idx + 0.5) / STEPS.length) * 100),
  }
}
