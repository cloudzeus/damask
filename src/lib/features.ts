/**
 * Διακόπτες λειτουργιών ανά εγκατάσταση.
 * SoftOne: η WWA δεν έχει (ακόμη) SoftOne — η ΣΥΝΔΕΣΗ/ο ΣΥΓΧΡΟΝΙΣΜΟΣ είναι εκτός προδιαγραφών προς το παρόν
 * (2026-10-08). Η ΔΟΜΗ tables/objects μένει κατά SoftOne (TRDR/SODTYPE κ.λπ.) για μελλοντική διασύνδεση.
 * Επανενεργοποίηση με FEATURE_SOFTONE=1.
 */
export const FEATURES = {
  softone: process.env.FEATURE_SOFTONE === '1' || process.env.NEXT_PUBLIC_FEATURE_SOFTONE === '1',
} as const
