import { PRODUCT_TARGET } from '@/lib/import/targets'
import { textField, emailField, afmField, intEnumField } from './fields'
import type { IngestionTarget, IngestionFieldDef } from './target'

const PARTNER_FIELDS: IngestionFieldDef[] = [
  { ...afmField({ key: 'afm', label: 'ΑΦΜ', required: true, sample: '094014201' }), aliases: ['vat', 'tin', 'αφμ'] },
  { ...textField({ key: 'name', label: 'Επωνυμία', required: true, sample: 'Damask AE', maxLength: 190 }), aliases: ['onomasia', 'εκδότης', 'επωνυμία', 'name'] },
  { ...textField({ key: 'address', label: 'Διεύθυνση', maxLength: 190 }), aliases: ['διεύθυνση', 'addr'] },
  { ...textField({ key: 'city', label: 'Πόλη', maxLength: 120 }), aliases: ['περιοχή', 'city'] },
  { ...textField({ key: 'zip', label: 'Τ.Κ.', maxLength: 20 }), aliases: ['tk', 'zip', 'postal'] },
  { ...textField({ key: 'phone', label: 'Τηλέφωνο', maxLength: 40 }), aliases: ['τηλ', 'phone', 'phones'] },
  { ...emailField({ key: 'email', label: 'Email', sample: 'info@damask.gr' }), aliases: ['emails', 'mail'] },
  { ...textField({ key: 'website', label: 'Ιστότοπος', maxLength: 300 }), aliases: ['website', 'web', 'url'] },
  intEnumField({ key: 'sodtype', label: 'Τύπος (12 Προμηθευτής / 13 Πελάτης)', allowed: [12, 13], defaultValue: 13 }),
]

export const INGESTION_TARGETS: IngestionTarget[] = [
  {
    key: 'product', label: 'Προϊόντα', objectKey: 'products', permission: 'product.edit',
    fields: PRODUCT_TARGET.fields, uniqueBy: 'code',
    sources: ['excel', 'ocr', 'api'], ocr: { project: 'lines' },
  },
  {
    key: 'partner', label: 'Συναλλασσόμενοι', objectKey: 'partners', permission: 'customer.edit',
    fields: PARTNER_FIELDS, uniqueBy: 'afm',
    sources: ['excel', 'ocr', 'api'], ocr: { docTypeHint: 'invoice', project: 'party' },
  },
]

export function ingestionTargetByKey(key: string): IngestionTarget | undefined {
  return INGESTION_TARGETS.find(t => t.key === key)
}
export function targetsForObject(objectKey: string): IngestionTarget[] {
  return INGESTION_TARGETS.filter(t => t.objectKey === objectKey)
}
