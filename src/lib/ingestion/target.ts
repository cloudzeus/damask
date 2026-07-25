import type { ImportFieldDef } from '@/lib/import/targets'
import type { OcrDocTypeHint } from '@/lib/ocr/schema'
import type { SourceKind } from './normalized'

export type IngestionFieldDef = ImportFieldDef & {
  aliases?: string[]
  /** Επιλογές σταθερής τιμής στο βήμα αντιστοίχισης — «όλες οι γραμμές παίρνουν αυτή την τιμή»
   *  (π.χ. sodtype: Προμηθευτής/Πελάτης όταν το Excel δεν έχει στήλη τύπου). */
  fixedChoices?: { value: string; label: string }[]
}
export type OcrProjection = 'party' | 'lines'

export type IngestionTarget = {
  key: string
  label: string
  objectKey: string
  permission: string
  fields: IngestionFieldDef[]
  uniqueBy: string
  sources: SourceKind[]
  ocr?: { docTypeHint?: OcrDocTypeHint; project: OcrProjection }
  /** true = το βήμα «Καταχώριση» προσφέρει επιλογές εμπλουτισμού (ΑΑΔΕ/ΓΕΜΗ/Περιφέρεια/Geodata). */
  enrich?: boolean
}

export function requiredFieldKeys(target: IngestionTarget): string[] {
  return target.fields.filter(f => f.required).map(f => f.key)
}

/**
 * Επιλογές εμπλουτισμού στο βήμα «Καταχώριση» (targets με enrich=true — σήμερα partner).
 * Ζει ΕΔΩ (client-safe module) και όχι στο server-only commit/ ώστε να το εισάγουν
 * και client components χωρίς να τραβούν prisma/next-auth.
 */
export type CommitEnrichOptions = {
  /** Έλεγχος ΑΑΔΕ: επωνυμία/διεύθυνση/ΔΟΥ/νομική μορφή/κατάσταση + ΚΑΔ (TrdrKad). */
  aade?: boolean
  /** ΓΕΜΗ sync: αρ. ΓΕΜΗ/στοιχεία/ΚΑΔ — ΧΩΡΙΣ λήψη εγγράφων (κατ' απαίτηση από την καρτέλα). */
  gemi?: boolean
  /** Αντιστοίχιση Περιφέρειας (Καλλικράτης) από διεύθυνση/ΓΕΜΗ/συντεταγμένες. */
  region?: boolean
  /** Geocoding διεύθυνσης → συντεταγμένες (χρειάζεται κλειδί geocode στη Ρύθμιση Maps). */
  geocode?: boolean
}
