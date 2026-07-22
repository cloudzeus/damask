import { textField, numberField, type ImportFieldDef, type FieldParseResult } from '@/lib/import/targets'

export { textField, numberField }

export function afmField(opts: { key: string; label: string; required?: boolean; sample?: string }): ImportFieldDef {
  return {
    key: opts.key, label: opts.label, required: !!opts.required, sample: opts.sample,
    parse(raw): FieldParseResult<string> {
      const t = raw.trim().replace(/^(EL|GR)/i, '')
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
        return opts.required ? { value: null, error: `${opts.label}: υποχρεωτικό.` } : { value: null, error: null }
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) return { value: null, error: `${opts.label}: μη έγκυρο email.` }
      return { value: t, error: null }
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
