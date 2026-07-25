import { textField, numberField, type ImportFieldDef, type FieldParseResult } from '@/lib/import/targets'

export { textField, numberField }

export function afmField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<string> {
      const t = raw.replace(/\s+/g, '').replace(/^(EL|GR)/i, '')
      if (t === '') {
        return opts.required
          ? { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` }
          : { value: null, error: null }
      }
      if (!/^\d{9}$/.test(t)) return { value: null, error: `${opts.label}: πρέπει να έχει 9 ψηφία.` }
      return { value: t, error: null }
    },
  }
}

export function emailField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<string> {
      const t = raw.trim()
      if (t === '') {
        return opts.required ? { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` } : { value: null, error: null }
      }
      if (!/^[^\s@.]+(\.[^\s@.]+)*@[^\s@.]+(\.[^\s@.]+)+$/.test(t)) return { value: null, error: `${opts.label}: μη έγκυρο email.` }
      return { value: t, error: null }
    },
  }
}

/**
 * Ημερομηνία από Excel/CSV κελί: ISO (YYYY-MM-DD), ελληνικό (DD/MM/YYYY ή
 * DD-MM-YYYY), ή Excel serial (ημέρες από 1899-12-30 — έτσι έρχονται τα
 * date-formatted κελιά όταν το SheetJS δεν κάνει cellDates). Επιστρέφει Date.
 */
export function dateField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<Date> {
      const t = raw.trim()
      if (t === '') {
        return opts.required ? { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` } : { value: null, error: null }
      }
      let d: Date | null = null
      if (/^\d{4}-\d{1,2}-\d{1,2}/.test(t)) {
        d = new Date(t)
      } else if (/^\d{1,2}[/-]\d{1,2}[/-]\d{4}$/.test(t)) {
        const [dd, mm, yyyy] = t.split(/[/-]/).map(Number)
        d = new Date(Date.UTC(yyyy, mm - 1, dd))
      } else if (/^\d+(\.\d+)?$/.test(t)) {
        const serial = Number(t)
        // 10000 ≈ 1927, 80000 ≈ 2119 — εκτός αυτού του εύρους δεν είναι λογικό Excel serial
        if (serial >= 10000 && serial <= 80000) d = new Date(Date.UTC(1899, 11, 30) + serial * 86_400_000)
      }
      if (!d || Number.isNaN(d.getTime())) {
        return { value: null, error: `${opts.label}: μη έγκυρη ημερομηνία (δεκτά: 2007-10-08, 08/10/2007, Excel serial).` }
      }
      return { value: d, error: null }
    },
  }
}

/** Ακέραιος ≥ 0 (π.χ. αριθμός εργαζομένων) — δέχεται και "12,0"/"12.0". */
export function intField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<number> {
      const t = raw.trim().replace(',', '.')
      if (t === '') {
        return opts.required ? { value: null, error: `${opts.label}: το πεδίο είναι υποχρεωτικό.` } : { value: null, error: null }
      }
      const n = Number(t)
      if (!Number.isFinite(n) || n < 0 || !Number.isInteger(n)) {
        return { value: null, error: `${opts.label}: πρέπει να είναι ακέραιος αριθμός ≥ 0.` }
      }
      return { value: n, error: null }
    },
  }
}

export function intEnumField(opts: { key: string; label: string; allowed: number[]; defaultValue: number }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: false,
    parse(raw): FieldParseResult<number> {
      const t = raw.trim()
      if (t === '') return { value: opts.defaultValue, error: null }
      const n = Number(t)
      if (!opts.allowed.includes(n)) return { value: null, error: `${opts.label}: επιτρεπτές τιμές ${opts.allowed.join('/')}.` }
      return { value: n, error: null }
    },
  }
}
