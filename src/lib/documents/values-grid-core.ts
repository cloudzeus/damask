import { periodLabel, rangePeriods } from '@/lib/documents/series'
import { parseGreekNumber } from '@/lib/tax/greek-format'

/**
 * (Plain module.) «Πίνακας τιμών» από πολλά δικαιολογητικά — ίδια λογική με το πλέγμα μισθοδοσίας:
 * γραμμές = πεδία του Οδηγού (τζίρος, ΦΠΑ…), στήλες = περίοδοι (μήνες/τρίμηνα ομαδοποιημένα ανά έτος, ή έτη για Ε3/Ε1),
 * σύνολο έτους για ποσά, και ΚΕΝΑ (περίοδοι χωρίς έγγραφο ή χωρίς τιμές) ορατά με μια ματιά.
 */

export type GridKind = 'MONTHLY' | 'QUARTERLY' | 'YEARLY'
export type GridField = { key: string; label: string; valueType: string }
export type GridValue = { fieldKey: string; period: string; value: number | null; text: string | null; verified: boolean; docId: string | null }
export type GridDoc = { id: string; period: string; name: string; mimeType: string | null }

export type GridColumn = {
  key: string
  label: string
  year: number
  doc: GridDoc | null
  /** Καμία τιμή (υπάρχει ή όχι έγγραφο). */
  empty: boolean
  /** Δεν υπάρχει έγγραφο για την περίοδο. */
  missing: boolean
}
export type GridYear = { year: number; keys: string[]; have: number; expected: number }
export type GridCell = { text: string; num: number | null; verified: boolean; docId: string | null }
export type ValuesGrid = {
  kind: GridKind
  fields: (GridField & { summable: boolean })[]
  columns: GridColumn[]
  years: GridYear[]
  cells: Record<string, GridCell>
  /** `${fieldKey}|${year}` → άθροισμα περιόδων (μόνο για σειρές & ποσά). */
  totals: Record<string, number>
  summary: { from: string | null; to: string | null; withValues: number; total: number; missing: string[]; empty: string[] }
}

const SUMMABLE = new Set(['CURRENCY', 'NUMBER', 'INTEGER'])
export const cellKey = (fieldKey: string, period: string) => `${fieldKey}|${period}`

/** Αριθμός κελιού: αποθηκευμένο ποσό ή ανάγνωση ελληνικής μορφής από το κείμενο («1.234,56»). */
export function numOf(v: { value: number | null; text: string | null }): number | null {
  if (v.value != null && Number.isFinite(v.value)) return v.value
  return v.text ? parseGreekNumber(v.text) : null
}

const yearOf = (period: string) => Number(period.slice(0, 4))
const NUM = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 })

/** Κείμενο κελιού ανά τύπο: ποσά/αριθμοί με ελληνική μορφή, ημερομηνίες ως ημ/νία, ακέραιοι (π.χ. έτος) χωρίς τελείες. */
export function displayOf(valueType: string, v: { value: number | null; text: string | null }): { text: string; num: number | null } {
  if (valueType === 'DATE') {
    if (v.text?.trim() && !/^\d{10,}$/.test(v.text.trim())) return { text: v.text.trim(), num: null }
    const ms = v.value ?? (v.text ? Number(v.text) : NaN)
    return { text: Number.isFinite(ms) && ms > 0 ? new Date(ms).toLocaleDateString('el-GR') : '', num: null }
  }
  if (['CURRENCY', 'NUMBER', 'PERCENT'].includes(valueType)) {
    const n = numOf(v)
    return n != null ? { text: NUM.format(n) + (valueType === 'PERCENT' ? '%' : ''), num: n } : { text: v.text?.trim() ?? '', num: null }
  }
  if (valueType === 'INTEGER') {
    const n = numOf(v)
    return n != null ? { text: String(Math.round(n)), num: n } : { text: v.text?.trim() ?? '', num: null }
  }
  return { text: (v.text ?? (v.value != null ? String(v.value) : '')).trim(), num: numOf(v) }
}

export function buildValuesGrid(input: { kind: GridKind; fields: GridField[]; values: GridValue[]; docs: GridDoc[] }): ValuesGrid {
  const { kind } = input
  // Υπόλοιπα/μεταφερόμενα ποσά είναι «στιγμιότυπα» — δεν αθροίζονται στο έτος.
  const balance = (label: string) => /υπολοιπ|μεταφορ|προς εκπτωση/.test(label.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''))
  const fields = input.fields.map(f => ({ ...f, summable: kind !== 'YEARLY' && SUMMABLE.has(f.valueType) && !balance(f.label) }))
  const cells: Record<string, GridCell> = {}
  const withValues = new Set<string>()
  const typeOf = new Map(input.fields.map(f => [f.key, f.valueType]))
  for (const v of input.values) {
    if (!v.period || !/^\d{4}/.test(v.period) || !typeOf.has(v.fieldKey)) continue
    const { text, num } = displayOf(typeOf.get(v.fieldKey)!, v)
    if (!text) continue
    cells[cellKey(v.fieldKey, v.period)] = { text, num, verified: v.verified, docId: v.docId }
    withValues.add(v.period)
  }
  const docByPeriod = new Map<string, GridDoc>()
  for (const d of input.docs) if (d.period && !docByPeriod.has(d.period)) docByPeriod.set(d.period, d)

  const known = [...new Set([...withValues, ...docByPeriod.keys()])].sort()
  const from = known[0] ?? null
  const to = known[known.length - 1] ?? null
  let keys: string[] = []
  if (from && to) {
    if (kind === 'YEARLY') for (let y = yearOf(from); y <= yearOf(to) && keys.length < 40; y++) keys.push(String(y))
    else keys = rangePeriods(kind, from, to)
    if (!keys.length) keys = known
  }

  const columns: GridColumn[] = keys.map(k => ({
    key: k,
    label: kind === 'YEARLY' ? k : periodLabel(k),
    year: yearOf(k),
    doc: docByPeriod.get(k) ?? null,
    empty: !withValues.has(k),
    missing: !docByPeriod.has(k) && !withValues.has(k),
  }))

  const perYear = kind === 'MONTHLY' ? 12 : kind === 'QUARTERLY' ? 4 : 1
  const years: GridYear[] = []
  for (const c of columns) {
    let y = years[years.length - 1]
    if (!y || y.year !== c.year) { y = { year: c.year, keys: [], have: 0, expected: perYear }; years.push(y) }
    y.keys.push(c.key)
    if (!c.empty) y.have++
  }

  const totals: Record<string, number> = {}
  for (const f of fields) {
    if (!f.summable) continue
    for (const y of years) {
      let sum = 0
      let any = false
      for (const k of y.keys) { const n = cells[cellKey(f.key, k)]?.num; if (n != null) { sum += n; any = true } }
      if (any) totals[cellKey(f.key, String(y.year))] = Math.round(sum * 100) / 100
    }
  }

  return {
    kind, fields, columns, years, cells, totals,
    summary: {
      from, to, withValues: columns.filter(c => !c.empty).length, total: columns.length,
      missing: columns.filter(c => c.missing).map(c => c.key),
      empty: columns.filter(c => c.empty && !c.missing).map(c => c.key),
    },
  }
}

/** CSV (Excel ελληνικά: «;» και κόμμα δεκαδικών) — γραμμές = πεδία, στήλες = περίοδοι (+ σύνολο έτους). */
export function gridToCsv(g: ValuesGrid): string {
  const esc = (s: string) => (/[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s)
  const num = (n: number) => n.toLocaleString('el-GR', { useGrouping: false, maximumFractionDigits: 2 })
  const header = ['Πεδίο']
  const plan: ({ key: string } | { year: number })[] = []
  for (const y of g.years) {
    for (const k of y.keys) { header.push(g.columns.find(c => c.key === k)?.label ?? k); plan.push({ key: k }) }
    if (g.kind !== 'YEARLY' && g.fields.some(f => f.summable)) { header.push(`Σύνολο ${y.year}`); plan.push({ year: y.year }) }
  }
  const rows = g.fields.map(f => [f.label, ...plan.map(p => {
    if ('key' in p) { const c = g.cells[cellKey(f.key, p.key)]; return c ? (c.num != null && f.valueType !== 'INTEGER' ? num(c.num) : c.text) : '' }
    const t = g.totals[cellKey(f.key, String(p.year))]
    return t != null ? num(t) : ''
  })])
  return '﻿' + [header, ...rows].map(r => r.map(esc).join(';')).join('\r\n')
}

export type FieldYearTotal = { year: number; total: number; have: number; expected: number; complete: boolean }
export type FieldPeriodTotals = {
  fieldKey: string
  label: string
  years: FieldYearTotal[]
  /** Τελευταίοι 12 μήνες (ή 4 τρίμηνα) με τιμή — για «τρέχοντα» τζίρο όταν δεν υπάρχει ακόμη Ε3. */
  last12: { from: string; to: string; total: number; have: number; expected: number } | null
}

/**
 * Σύνολα ανά έτος από σειρά (Φ2 μήνες → ετήσιο ποσό) για ΚΑΘΕ αθροίσιμο πεδίο, με την κάλυψη (12/12 = πλήρες).
 * Τα διαβάζουν η αξιολόγηση ένταξης, ο Thanos, η Μνήμη γραφείου και τα στοιχεία εταιρίας.
 */
export function periodTotals(g: ValuesGrid): FieldPeriodTotals[] {
  if (g.kind === 'YEARLY') return []
  const per = g.kind === 'MONTHLY' ? 12 : 4
  return g.fields.filter(f => f.summable).map(f => {
    const years = g.years.flatMap(y => {
      const t = g.totals[cellKey(f.key, String(y.year))]
      if (t == null) return []
      const have = y.keys.filter(k => g.cells[cellKey(f.key, k)]?.num != null).length
      return [{ year: y.year, total: t, have, expected: per, complete: have >= per }]
    })
    const withVal = g.columns.filter(c => g.cells[cellKey(f.key, c.key)]?.num != null)
    const lastCols = g.columns.slice(-per)
    const last = withVal.length ? lastCols.filter(c => g.cells[cellKey(f.key, c.key)]?.num != null) : []
    const last12 = last.length
      ? { from: lastCols[0].key, to: lastCols[lastCols.length - 1].key, total: Math.round(last.reduce((a, c) => a + (g.cells[cellKey(f.key, c.key)]!.num ?? 0), 0) * 100) / 100, have: last.length, expected: per }
      : null
    return { fieldKey: f.key, label: f.label, years, last12 }
  }).filter(t => t.years.length)
}
