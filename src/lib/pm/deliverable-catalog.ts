// Built-in standard deliverable catalog (C2g spec amendment §8) — «ο πίνακας που είναι
// πάνω-κάτω ίδιος για όλα τα προγράμματα». Pure data module: no prisma/react/clock imports.
// Used by the wizard's «Βοήθεια/Πρότυπα» one-click import panel, and as a matching target
// for extraction (C2g.3).

import type { DeliverablePhaseStr } from './deliverable-phases'

export type CatalogTask = {
  phase: DeliverablePhaseStr
  name: string
  mandatory: boolean
  onSiteVerification: boolean
  minFiles: number
}

export type CatalogEntry = {
  key: string
  name: string
  description: string
  appliesTo: 'EXPENSE' | 'APPLICATION'
  tasks: CatalogTask[]
}

export const DELIVERABLE_CATALOG: CatalogEntry[] = [
  {
    key: 'personnel',
    name: 'Δαπάνες προσωπικού (μισθοδοσία)',
    description: 'Νέες προσλήψεις/μισθοδοσία που επιδοτούνται από το πρόγραμμα — σύμβαση, μισθοδοτικές καταστάσεις, ενημερότητες, ΑΠΔ, Ε4.',
    appliesTo: 'EXPENSE',
    tasks: [
      { phase: 'SUBMISSION', name: 'Σύμβαση/Αναγγελία πρόσληψης (ΔΥΠΑ/ΟΑΕΔ)', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Μηνιαίες μισθοδοτικές καταστάσεις (σφραγισμένες/υπογεγραμμένες)', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Εμβάσματα/extrait καταβολών μισθοδοσίας', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Αποδεικτικά εξόφλησης ασφαλιστικών εισφορών & ΦΜΥ (ενημερότητες)', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'ΑΠΔ (κατάθεση + ανάλυση)', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Πίνακας προσωπικού Ε4', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Αντίγραφο ταυτότητας νεοπροσλαμβανόμενου', mandatory: true, onSiteVerification: true, minFiles: 1 },
    ],
  },
  {
    key: 'equipment',
    name: 'Προμήθεια εξοπλισμού',
    description: 'Αγορά καινούργιου εξοπλισμού — προσφορά, τιμολόγιο, εξόφληση, εγκατάσταση και εγγραφή στο μητρώο παγίων.',
    appliesTo: 'EXPENSE',
    tasks: [
      { phase: 'SUBMISSION', name: 'Προσφορά/τεχνικές προδιαγραφές', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Τιμολόγιο αγοράς', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Εξτρέ τράπεζας/αποδεικτικό εξόφλησης', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Φωτογραφίες εγκατεστημένου εξοπλισμού', mandatory: true, onSiteVerification: true, minFiles: 2 },
      { phase: 'FULL_CERTIFICATION', name: 'Σειριακοί αριθμοί/πινακίδες', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Εγγραφή στο μητρώο παγίων', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Βεβαίωση καινούργιου & αμεταχείριστου', mandatory: true, onSiteVerification: false, minFiles: 1 },
    ],
  },
  {
    key: 'software',
    name: 'Λογισμικό/εφαρμογές',
    description: 'Απόκτηση λογισμικού/εφαρμογών — προσφορά, τιμολόγιο, εξόφληση, ενδείξεις λειτουργίας και άδειες χρήσης.',
    appliesTo: 'EXPENSE',
    tasks: [
      { phase: 'SUBMISSION', name: 'Προσφορά/πρόταση', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Τιμολόγιο', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Εξτρέ τράπεζας', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Screenshots εφαρμογής σε λειτουργία', mandatory: true, onSiteVerification: false, minFiles: 3 },
      { phase: 'FULL_CERTIFICATION', name: 'Άδειες χρήσης/licenses', mandatory: true, onSiteVerification: true, minFiles: 1 },
    ],
  },
  {
    key: 'licenses',
    name: 'Άδειες λειτουργίας',
    description: 'Ισχύουσες άδειες λειτουργίας και λοιπές εγκρίσεις/πιστοποιητικά της επιχείρησης.',
    appliesTo: 'APPLICATION',
    tasks: [
      { phase: 'FULL_CERTIFICATION', name: 'Άδεια λειτουργίας σε ισχύ', mandatory: true, onSiteVerification: true, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Λοιπές εγκρίσεις/πιστοποιητικά (πυρασφάλεια κ.λπ.)', mandatory: false, onSiteVerification: false, minFiles: 1 },
    ],
  },
  {
    key: 'building',
    name: 'Κτιριακά/διαμόρφωση χώρων',
    description: 'Εργασίες διαμόρφωσης/ανακαίνισης χώρων — προμέτρηση, τιμολόγια, εξόφληση, φωτογραφική τεκμηρίωση πριν/μετά.',
    appliesTo: 'EXPENSE',
    tasks: [
      { phase: 'SUBMISSION', name: 'Προσφορά/προμέτρηση εργασιών', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Τιμολόγια εργασιών', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Εξτρέ τράπεζας', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Φωτογραφίες πριν/μετά', mandatory: true, onSiteVerification: true, minFiles: 2 },
      { phase: 'FULL_CERTIFICATION', name: 'Επιμετρήσεις/βεβαίωση μηχανικού', mandatory: true, onSiteVerification: true, minFiles: 1 },
    ],
  },
  {
    key: 'marketing',
    name: 'Προβολή/διαφήμιση',
    description: 'Ενέργειες προβολής/διαφήμισης — πλάνο, τιμολόγια, εξόφληση, δείγματα υλικού και αποτύπωση δημοσιότητας.',
    appliesTo: 'EXPENSE',
    tasks: [
      { phase: 'SUBMISSION', name: 'Προσφορά/πλάνο προβολής', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Τιμολόγια', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FINAL_PAYMENT', name: 'Εξτρέ τράπεζας', mandatory: true, onSiteVerification: false, minFiles: 1 },
      { phase: 'FULL_CERTIFICATION', name: 'Δείγματα υλικού/αποτύπωση δημοσιότητας', mandatory: true, onSiteVerification: false, minFiles: 2 },
    ],
  },
]
