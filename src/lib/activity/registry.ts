import type { ActivityCategory } from '@prisma/client'

/**
 * Κεντρικό μητρώο ενεργειών (η «έξυπνη χαρτογράφηση») — ΜΙΑ πηγή αλήθειας για το
 * τι μετράει ως ενέργεια, σε ποια κατηγορία ανήκει, με τι ελληνική ετικέτα και
 * τι βαρύτητα (πόντοι). Ο helper logActivity() διαβάζει από εδώ. Πρόσθεσε νέα
 * ενέργεια = μία γραμμή εδώ + ένα `await logActivity('key', …)` στο action.
 */

export const CATEGORY_LABELS: Record<ActivityCategory, string> = {
  PARTNER: 'Πελάτες',
  REFERRER: 'Παραπομπές',
  PROGRAM: 'Προγράμματα',
  PROSPECT: 'Δυνητικοί',
  APPLICATION: 'Συμμετοχές / Έργα',
  COMMUNICATION: 'Επικοινωνία',
  SYSTEM: 'Σύστημα',
}

type ActionDef = { category: ActivityCategory; label: string; weight: number }

export const ACTIONS = {
  // Πελάτες
  'partner.create': { category: 'PARTNER', label: 'Δημιουργία πελάτη', weight: 3 },
  'partner.update': { category: 'PARTNER', label: 'Επεξεργασία πελάτη', weight: 1 },
  'partner.delete': { category: 'PARTNER', label: 'Διαγραφή πελάτη', weight: 2 },
  'partner.aade_check': { category: 'PARTNER', label: 'Έλεγχος ΑΑΔΕ πελάτη', weight: 1 },
  'partner.gemi_sync': { category: 'PARTNER', label: 'Συγχρονισμός ΓΕΜΗ', weight: 2 },
  'partner.kad_bulk': { category: 'PARTNER', label: 'Μαζικός εντοπισμός ΚΑΔ', weight: 2 },
  // Παραπομπές
  'referrer.create': { category: 'REFERRER', label: 'Δημιουργία παραπομπής', weight: 2 },
  'referrer.update': { category: 'REFERRER', label: 'Επεξεργασία παραπομπής', weight: 1 },
  'referrer.delete': { category: 'REFERRER', label: 'Διαγραφή παραπομπής', weight: 1 },
  // Προγράμματα
  'program.create': { category: 'PROGRAM', label: 'Δημιουργία προγράμματος', weight: 3 },
  'program.extract': { category: 'PROGRAM', label: 'Αποδελτίωση προγράμματος', weight: 5 },
  'program.delete': { category: 'PROGRAM', label: 'Διαγραφή προγράμματος', weight: 2 },
  // Δυνητικοί / Επικοινωνία
  'prospect.save': { category: 'PROSPECT', label: 'Αποθήκευση λίστας δυνητικών', weight: 2 },
  'newsletter.send': { category: 'COMMUNICATION', label: 'Αποστολή ενημέρωσης', weight: 2 },
  'newsletter.test': { category: 'COMMUNICATION', label: 'Δοκιμαστικό email', weight: 1 },
  'newsletter.subscribe': { category: 'COMMUNICATION', label: 'Εγγραφή στο newsletter', weight: 1 },
  'newsletter.unsubscribe': { category: 'COMMUNICATION', label: 'Διαγραφή από newsletter', weight: 1 },
  // Δημόσια φόρμα επιλεξιμότητας
  'public_lead.request': { category: 'PROSPECT', label: 'Αίτημα επιλεξιμότητας (site)', weight: 1 },
  'public_lead.verified': { category: 'PROSPECT', label: 'Επιβεβαιωμένο αίτημα επιλεξιμότητας', weight: 3 },
  // Συμμετοχές / Έργα
  'application.associate': { category: 'APPLICATION', label: 'Σύνδεση πελάτη με πρόγραμμα', weight: 2 },
  'application.lifecycle': { category: 'APPLICATION', label: 'Αλλαγή κατάστασης συμμετοχής', weight: 1 },
  'application.remove': { category: 'APPLICATION', label: 'Αφαίρεση σύνδεσης προγράμματος', weight: 1 },
  'application.create': { category: 'APPLICATION', label: 'Δημιουργία έργου (ένταξη)', weight: 3 },
  'application.stage': { category: 'APPLICATION', label: 'Αλλαγή σταδίου PM', weight: 1 },
  'opportunity.create': { category: 'APPLICATION', label: 'Δημιουργία ευκαιρίας', weight: 2 },
} satisfies Record<string, ActionDef>

export type ActivityAction = keyof typeof ACTIONS
