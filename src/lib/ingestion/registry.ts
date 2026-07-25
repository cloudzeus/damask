import { PRODUCT_TARGET } from '@/lib/import/targets'
import { textField, emailField, afmField, intEnumField, dateField, intField } from './fields'
import { numberField } from '@/lib/import/targets'
import type { IngestionTarget, IngestionFieldDef } from './target'

// Per-field `aliases` are intentional: consumed by autoMatchField in src/lib/ingestion/map.ts (Task 2),
// coexisting with the product target's existing FIELD_ALIASES/autoMatchField mechanism in @/lib/import/targets.
const PARTNER_FIELDS: IngestionFieldDef[] = [
  { ...afmField({ key: 'afm', label: 'ΑΦΜ', required: true, sample: '094014201' }), aliases: ['vat', 'tin', 'αφμ'] },
  { ...textField({ key: 'name', label: 'Επωνυμία', required: true, sample: 'Damask AE', maxLength: 190 }), aliases: ['onomasia', 'εκδότης', 'επωνυμία', 'name'] },
  { ...textField({ key: 'doy', label: 'ΔΟΥ (κωδικός ή όνομα)', maxLength: 120, sample: "Α' ΑΘΗΝΩΝ" }), aliases: ['δου', 'δ.ο.υ.', 'doy'] },
  { ...textField({ key: 'legalForm', label: 'Νομική μορφή', maxLength: 120, sample: 'ΙΚΕ' }), aliases: ['νομική μορφή', 'legal form', 'μορφή'] },
  { ...textField({ key: 'jobtype', label: 'Δραστηριότητα / Επάγγελμα', maxLength: 300 }), aliases: ['επάγγελμα', 'δραστηριότητα', 'profession', 'occupation'] },
  { ...textField({ key: 'address', label: 'Διεύθυνση', maxLength: 190 }), aliases: ['διεύθυνση', 'addr'] },
  { ...textField({ key: 'city', label: 'Πόλη', maxLength: 120 }), aliases: ['περιοχή', 'city'] },
  { ...textField({ key: 'district', label: 'Συνοικία / Δημ. διαμέρισμα', maxLength: 120 }), aliases: ['συνοικία', 'district'] },
  { ...textField({ key: 'zip', label: 'Τ.Κ.', maxLength: 20 }), aliases: ['tk', 'zip', 'postal'] },
  { ...textField({ key: 'phone', label: 'Τηλέφωνο', maxLength: 40 }), aliases: ['τηλ', 'phone', 'phones'] },
  { ...textField({ key: 'phone2', label: 'Τηλέφωνο 2', maxLength: 40 }), aliases: ['δευτερεύων τηλ', 'τηλ 2', 'phone2', 'κινητό', 'mobile'] },
  { ...textField({ key: 'fax', label: 'Fax', maxLength: 40 }), aliases: ['fax', 'φαξ'] },
  { ...emailField({ key: 'email', label: 'Email', sample: 'info@damask.gr' }), aliases: ['emails', 'mail'] },
  { ...emailField({ key: 'emailAcc', label: 'Email λογιστηρίου', sample: 'logistirio@damask.gr' }), aliases: ['δευτερεύων email', 'email λογιστηρίου', 'accounting email', 'emailacc'] },
  { ...textField({ key: 'website', label: 'Ιστότοπος', maxLength: 300 }), aliases: ['website', 'web', 'url', 'ιστοσελίδα'] },
  { ...dateField({ key: 'foundingDate', label: 'Ημ/νία ίδρυσης/έναρξης', sample: '2007-10-08' }), aliases: ['ημ έναρξης', 'έναρξη', 'ίδρυση', 'founding'] },
  { ...intField({ key: 'employees', label: 'Αριθμός εργαζομένων', sample: '5' }), aliases: ['εργαζόμενοι', 'προσωπικό', 'employees', 'staff'] },
  { ...numberField({ key: 'annualRevenue', label: 'Ετήσια έσοδα (τελευταία)', sample: '26357713' }), aliases: ['ετήσια έσοδα', 'έσοδα', 'τζίρος', 'revenue', 'turnover'] },
  { ...textField({ key: 'notes', label: 'Σημειώσεις', maxLength: 2000 }), aliases: ['σημειώσεις', 'σχόλια', 'notes', 'comments'] },
  {
    ...intEnumField({ key: 'sodtype', label: 'Τύπος (12 Προμηθευτής / 13 Πελάτης)', allowed: [12, 13], defaultValue: 13 }),
    fixedChoices: [
      { value: '13', label: 'Όλοι Πελάτες (13)' },
      { value: '12', label: 'Όλοι Προμηθευτές (12)' },
    ],
  },
]

export const INGESTION_TARGETS: IngestionTarget[] = [
  {
    key: 'product', label: 'Προϊόντα', objectKey: 'products', permission: 'product.edit',
    fields: PRODUCT_TARGET.fields, uniqueBy: 'code',
    sources: ['excel', 'ocr', 'api'], ocr: { project: 'lines' },
  },
  {
    key: 'partner', label: 'Συναλλασσόμενοι', objectKey: 'partners', permission: 'customer.edit',
    fields: PARTNER_FIELDS, uniqueBy: 'afm', enrich: true,
    sources: ['excel', 'ocr', 'api'], ocr: { docTypeHint: 'invoice', project: 'party' },
  },
]

export function ingestionTargetByKey(key: string): IngestionTarget | undefined {
  return INGESTION_TARGETS.find(t => t.key === key)
}
export function targetsForObject(objectKey: string): IngestionTarget[] {
  return INGESTION_TARGETS.filter(t => t.objectKey === objectKey)
}
