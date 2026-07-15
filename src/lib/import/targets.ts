/**
 * Import Engine — entity registry (spec §11α, design-system MASTER.md §4α).
 *
 * ΣΚΟΠΙΜΑ isomorphic: ΚΑΝΕΝΑ import από '@/lib/prisma' εδώ. Το module αυτό
 * τρέχει και μέσα σε 'use client' components (π.χ. step-mapping.tsx για fuzzy
 * auto-match, step-validate.tsx για client-side pre-check πριν σταλεί στο
 * server) και server-side (actions.ts, pg-boss worker). Η πρόσβαση στη DB
 * (έλεγχος code duplicate/existing) ζει αποκλειστικά στο
 * src/lib/import/product-upsert.ts (server-only).
 *
 * v1: μόνο 'product'. Νέα entity = νέο ImportTargetDef object + προσθήκη στο
 * IMPORT_TARGETS registry· ο οδηγός (wizard) και τα validate/execute actions
 * είναι ήδη γραμμένα δηλωτικά πάνω σε αυτό το registry.
 */

export type FieldError = { row: number; column: string; message: string }

/** Μία γραμμή δεδομένων έτοιμη προς validate/execute: fieldKey → raw string τιμή κελιού (μετά το mapping του Βήματος 3). */
export type RawImportRow = { rowNum: number; values: Record<string, string> }

export type FieldParseResult<T = unknown> = { value: T | null; error: string | null }

export type ImportFieldDef = {
  key: string
  label: string
  description?: string
  required: boolean
  /** Παράδειγμα τιμής — εμφανίζεται ως placeholder/βοήθεια στο mapping UI. */
  sample?: string
  /** raw = ήδη trimmed string τιμή του κελιού ('' αν κενό). */
  parse: (raw: string) => FieldParseResult
}

export type ImportTargetDef = {
  key: string
  label: string
  description?: string
  fields: ImportFieldDef[]
}

// ─── Ελληνική μορφή αριθμού ("τιμές: κόμμα→τελεία, αριθμοί") ──────────────────

/**
 * Δέχεται ελληνική/ευρωπαϊκή μορφή αριθμού: "12,50" (κόμμα δεκαδικό), "1.234,56"
 * (τελεία χιλιάδων + κόμμα δεκαδικό), ή απλή τελεία "12.5". Κενό string → null
 * (προαιρετικό πεδίο, δεν δόθηκε τιμή) χωρίς σφάλμα. `allowNegative=false`
 * (προεπιλογή) απορρίπτει αρνητικές τιμές — λογικό για τιμές/απόθεμα/βάρος/CBM.
 */
export function parseGreekNumber(raw: string, allowNegative = false): FieldParseResult<number> {
  const trimmed = raw.trim()
  if (trimmed === '') return { value: null, error: null }

  // Κρατάμε μόνο ψηφία, κόμμα, τελεία, πρόσημο — οτιδήποτε άλλο (π.χ. "€", "kg") απορρίπτεται εδώ.
  if (!/^-?[0-9.,\s]+$/.test(trimmed)) {
    return { value: null, error: `Μη έγκυρος αριθμός: "${raw}". Χρησιμοποίησε μορφή όπως 12,50.` }
  }

  const compact = trimmed.replace(/\s+/g, '')
  const lastComma = compact.lastIndexOf(',')
  const lastDot = compact.lastIndexOf('.')
  let normalized: string

  if (lastComma !== -1 && lastDot !== -1) {
    // Και τα δύο υπάρχουν — ό,τι εμφανίζεται ΤΕΛΕΥΤΑΙΟ είναι το δεκαδικό διαχωριστικό.
    normalized = lastComma > lastDot
      ? compact.replace(/\./g, '').replace(',', '.')
      : compact.replace(/,/g, '')
  } else if (lastComma !== -1) {
    normalized = compact.replace(',', '.')
  } else {
    normalized = compact
  }

  const value = Number(normalized)
  if (!Number.isFinite(value)) {
    return { value: null, error: `Μη έγκυρος αριθμός: "${raw}". Χρησιμοποίησε μορφή όπως 12,50.` }
  }
  if (!allowNegative && value < 0) {
    return { value: null, error: `Ο αριθμός δεν μπορεί να είναι αρνητικός: "${raw}".` }
  }
  return { value, error: null }
}

function textField(opts: {
  key: string; label: string; description?: string; required?: boolean; sample?: string; maxLength?: number
}): ImportFieldDef {
  const maxLength = opts.maxLength ?? 190
  return {
    key: opts.key,
    label: opts.label,
    description: opts.description,
    required: !!opts.required,
    sample: opts.sample,
    parse(raw) {
      const trimmed = raw.trim()
      if (trimmed === '') {
        return opts.required
          ? { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` }
          : { value: null, error: null }
      }
      if (trimmed.length > maxLength) {
        return { value: null, error: `${opts.label}: δεν μπορεί να ξεπερνά τους ${maxLength} χαρακτήρες.` }
      }
      return { value: trimmed, error: null }
    },
  }
}

function numberField(opts: {
  key: string; label: string; description?: string; required?: boolean; sample?: string
}): ImportFieldDef {
  return {
    key: opts.key,
    label: opts.label,
    description: opts.description,
    required: !!opts.required,
    sample: opts.sample,
    parse(raw) {
      const result = parseGreekNumber(raw)
      if (result.error) return { value: null, error: `${opts.label}: ${result.error}` }
      if (result.value === null && opts.required) {
        return { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` }
      }
      return result
    },
  }
}

// ─── Προϊόντα (v1 — μοναδικό target) ──────────────────────────────────────────

export const PRODUCT_TARGET: ImportTargetDef = {
  key: 'product',
  label: 'Προϊόντα',
  description: 'Δημιουργία/ενημέρωση προϊόντων με ταίριασμα βάσει κωδικού (code)',
  fields: [
    textField({ key: 'code', label: 'Κωδικός', required: true, sample: 'DM-1024', description: 'Μοναδικός κωδικός — κλειδί ταιριάσματος (δημιουργία ή ενημέρωση)' }),
    textField({ key: 'name', label: 'Ονομασία (Ελληνικά)', required: true, sample: 'Πολυθρόνα Άλμα' }),
    textField({ key: 'nameEn', label: 'Ονομασία (Αγγλικά)', required: false, sample: 'Alma Armchair' }),
    numberField({ key: 'priceWholesale', label: 'Τιμή Χονδρικής', sample: '120,50' }),
    numberField({ key: 'priceRetail', label: 'Τιμή Λιανικής', sample: '199,00' }),
    numberField({ key: 'cbmPerUnit', label: 'CBM / τεμάχιο', sample: '0,85' }),
    numberField({ key: 'weightPerUnit', label: 'Βάρος / τεμάχιο (kg)', sample: '12,4' }),
    numberField({ key: 'stock', label: 'Απόθεμα', sample: '25' }),
  ],
}

export const IMPORT_TARGETS: Record<string, ImportTargetDef> = {
  product: PRODUCT_TARGET,
}

export function getImportTarget(key: string): ImportTargetDef | undefined {
  return IMPORT_TARGETS[key]
}

// ─── Fuzzy header matching (ελληνικά + αγγλικά aliases) ───────────────────────

const GREEK_ACCENTS: Record<string, string> = {
  ά: 'α', έ: 'ε', ή: 'η', ί: 'ι', ό: 'ο', ύ: 'υ', ώ: 'ω', ϊ: 'ι', ΐ: 'ι', ϋ: 'υ', ΰ: 'υ',
}

/** lowercase, αφαίρεση ελληνικών τόνων, μόνο [a-z0-9α-ω] — για ανθεκτικό ταίριασμα headers. */
export function normalizeHeader(input: string): string {
  return input
    .toLowerCase()
    .split('')
    .map(ch => GREEK_ACCENTS[ch] ?? ch)
    .join('')
    .replace(/[^a-z0-9α-ω]/g, '')
}

const FIELD_ALIASES: Record<string, string> = {
  // code
  κωδικος: 'code', κωδ: 'code', κωδικοσειδους: 'code', code: 'code', sku: 'code',
  itemcode: 'code', productcode: 'code',
  // name (EL)
  περιγραφη: 'name', ονομασια: 'name', ονομα: 'name', τιτλος: 'name',
  περιγραφηειδους: 'name', ονομασιαειδους: 'name', name: 'name', description: 'name', title: 'name',
  // name (EN)
  nameen: 'nameEn', englishname: 'nameEn', ονομασιααγγλικα: 'nameEn', αγγλικηονομασια: 'nameEn',
  ονομασιαen: 'nameEn', περιγραφηαγγλικα: 'nameEn',
  // priceWholesale
  χονδρικη: 'priceWholesale', τιμηχονδρικης: 'priceWholesale', χονδρικητιμη: 'priceWholesale',
  wholesale: 'priceWholesale', wholesaleprice: 'priceWholesale',
  // priceRetail
  λιανικη: 'priceRetail', τιμηλιανικης: 'priceRetail', λιανικητιμη: 'priceRetail',
  τιμηπωλησης: 'priceRetail', τιμη: 'priceRetail', retail: 'priceRetail', retailprice: 'priceRetail', price: 'priceRetail',
  // cbmPerUnit
  cbm: 'cbmPerUnit', ογκος: 'cbmPerUnit', ογκοστεμ: 'cbmPerUnit', κυβικα: 'cbmPerUnit', volume: 'cbmPerUnit',
  // weightPerUnit
  βαρος: 'weightPerUnit', βαροστεμ: 'weightPerUnit', weight: 'weightPerUnit', kg: 'weightPerUnit',
  // stock
  αποθεμα: 'stock', ποσοτητα: 'stock', διαθεσιμο: 'stock', stock: 'stock', qty: 'stock', quantity: 'stock',
}

/**
 * Προτείνει fieldKey για μια στήλη Excel βάσει του header της (alias lookup →
 * ακριβές ταίριασμα key/label → μερικό ταίριασμα). Επιστρέφει '' αν δεν βρεθεί
 * τίποτα αρκετά σίγουρο — ο χρήστης επιλέγει χειροκίνητα.
 */
export function autoMatchField(columnHeader: string, fields: ImportFieldDef[]): string {
  const norm = normalizeHeader(columnHeader)
  if (!norm) return ''

  const aliasKey = FIELD_ALIASES[norm]
  if (aliasKey && fields.some(f => f.key === aliasKey)) return aliasKey

  const exact = fields.find(f => normalizeHeader(f.key) === norm || normalizeHeader(f.label) === norm)
  if (exact) return exact.key

  const partial = fields.find(f =>
    normalizeHeader(f.key).includes(norm) || norm.includes(normalizeHeader(f.key)) ||
    normalizeHeader(f.label).includes(norm) || norm.includes(normalizeHeader(f.label)),
  )
  return partial?.key ?? ''
}

// ─── Row parsing (πεδίο-επίπεδο validate+transform — isomorphic, χωρίς DB) ────

export type ParsedProductFields = {
  code: string
  name: string
  nameEn: string | null
  priceWholesale: number | null
  priceRetail: number | null
  cbmPerUnit: number | null
  weightPerUnit: number | null
  stock: number | null
}

export type ParsedRow =
  | { rowNum: number; ok: true; data: ParsedProductFields }
  | { rowNum: number; ok: false; errors: FieldError[] }

/**
 * Εφαρμόζει το parse() κάθε πεδίου πάνω σε μία γραμμή δεδομένων (raw = fieldKey
 * → string τιμή κελιού, ήδη αντιστοιχισμένη από το mapping του Βήματος 3).
 * Πεδία εκτός target.fields αγνοούνται. Λείπον κλειδί = κενό string.
 */
export function parseProductRow(rowNum: number, raw: Record<string, string>): ParsedRow {
  const errors: FieldError[] = []
  const data: Partial<ParsedProductFields> = {}

  for (const field of PRODUCT_TARGET.fields) {
    const cell = raw[field.key] ?? ''
    const result = field.parse(cell)
    if (result.error) {
      errors.push({ row: rowNum, column: field.label, message: result.error })
    } else {
      ;(data as Record<string, unknown>)[field.key] = result.value
    }
  }

  if (errors.length > 0) return { rowNum, ok: false, errors }
  return { rowNum, ok: true, data: data as ParsedProductFields }
}

/**
 * Εντοπίζει διπλότυπους κωδικούς σε ΟΛΟΚΛΗΡΟ το αρχείο (όχι μόνο μέσα σε ένα
 * chunk) — τρέχει client-side πριν την αποστολή στο server, γιατί το server
 * action validateImportChunk βλέπει μόνο 1000 γραμμές τη φορά και δεν θα
 * έπιανε διπλότυπο ανάμεσα σε δύο διαφορετικά chunks. Η 1η εμφάνιση κάθε
 * κωδικού μένει καθαρή· οι επόμενες γίνονται σφάλμα (ίδιο μήνυμα με το
 * αντίστοιχο in-chunk έλεγχο του product-upsert.ts, για συνέπεια στο UI).
 */
export function findDuplicateCodes(rows: { rowNum: number; code: string }[]): FieldError[] {
  const firstSeenAt = new Map<string, number>()
  const errors: FieldError[] = []
  for (const row of rows) {
    const seenAtRow = firstSeenAt.get(row.code)
    if (seenAtRow) {
      errors.push({ row: row.rowNum, column: 'Κωδικός', message: `Διπλότυπος κωδικός μέσα στο αρχείο (ήδη στη γραμμή ${seenAtRow}).` })
    } else {
      firstSeenAt.set(row.code, row.rowNum)
    }
  }
  return errors
}
