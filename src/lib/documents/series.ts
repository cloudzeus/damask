// src/lib/documents/series.ts — ISOMORPHIC (χωρίς prisma/react).
//
// «Σειρές» δικαιολογητικών: ένας τύπος που ζητείται ως ΣΥΝΟΛΟ εγγράφων — π.χ. Φ2 για κάθε μήνα, ΑΠΔ ανά μήνα,
// τριμηνιαίες καταστάσεις, ισολογισμοί τελευταίων ετών, ή απλή λίστα αρχείων (συμβάσεις εργαζομένων κ.λπ.).
// Κάθε έγγραφο σειράς έχει περίοδο («2025-03» | «2025-Q1» | «2025»)· η απαίτηση του προγράμματος είναι οι
// τελευταίες Ν ολοκληρωμένες περίοδοι πριν την υποβολή ή σταθερό διάστημα από–έως.

export type SeriesKind = 'MONTHLY' | 'QUARTERLY' | 'YEARLY' | 'LIST'

export const SERIES_KINDS: { value: SeriesKind; label: string; unit: string; defaultCount: number }[] = [
  { value: 'MONTHLY', label: 'Μηνιαία σειρά (π.χ. Φ2, ΑΠΔ)', unit: 'μήνες', defaultCount: 12 },
  { value: 'QUARTERLY', label: 'Τριμηνιαία σειρά', unit: 'τρίμηνα', defaultCount: 4 },
  { value: 'YEARLY', label: 'Ετήσια σειρά (π.χ. ισολογισμοί, Ε3)', unit: 'έτη', defaultCount: 3 },
  { value: 'LIST', label: 'Λίστα αρχείων (χωρίς περίοδο)', unit: 'αρχεία', defaultCount: 1 },
]

export function isSeriesKind(v: unknown): v is SeriesKind {
  return v === 'MONTHLY' || v === 'QUARTERLY' || v === 'YEARLY' || v === 'LIST'
}

export function seriesMeta(kind: SeriesKind) {
  return SERIES_KINDS.find(k => k.value === kind)!
}

const ROMAN_Q = ['Α΄', 'Β΄', 'Γ΄', 'Δ΄']

/** Ετικέτα περιόδου για εμφάνιση: «03/2025», «Α΄ τρίμ. 2025», «2025». */
export function periodLabel(period: string | null | undefined): string {
  if (!period) return '—'
  let m = /^(\d{4})-(\d{2})$/.exec(period)
  if (m) return `${m[2]}/${m[1]}`
  m = /^(\d{4})-Q([1-4])$/.exec(period)
  if (m) return `${ROMAN_Q[Number(m[2]) - 1]} τρίμ. ${m[1]}`
  return period
}

/** Κανονικοποίηση περιόδου στη μορφή του τύπου (δέχεται και «3/2025», «2025-3», «Q1 2025», «Α τρίμηνο 2025»). */
export function normalizePeriod(raw: string | null | undefined, kind: SeriesKind): string | null {
  if (!raw || kind === 'LIST') return null
  // Χωρίς τόνους (το «ΤΡΊΜΗΝΟ» αλλιώς δεν ταιριάζει)· η κεραία «΄» δεν είναι συνδυαστικός τόνος και μένει.
  const s = raw.trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/\s+/g, ' ')
  if (kind === 'MONTHLY') {
    let m = /^(\d{4})[-/.](\d{1,2})$/.exec(s)
    if (m) return valid(+m[1], +m[2]) ? `${m[1]}-${m[2].padStart(2, '0')}` : null
    m = /^(\d{1,2})[-/.](\d{4})$/.exec(s)
    if (m) return valid(+m[2], +m[1]) ? `${m[2]}-${m[1].padStart(2, '0')}` : null
    return null
  }
  if (kind === 'QUARTERLY') {
    let m = /^(\d{4})[- ]?Q([1-4])$/.exec(s)
    if (m) return `${m[1]}-Q${m[2]}`
    m = /^Q([1-4])[- /]?(\d{4})$/.exec(s)
    if (m) return `${m[2]}-Q${m[1]}`
    m = /^([ΑΒΓΔ])[΄']?\s*ΤΡΙΜ\S*\s*(\d{4})$/.exec(s)
    if (m) return `${m[2]}-Q${'ΑΒΓΔ'.indexOf(m[1]) + 1}`
    m = /^(\d{4})[-/.](\d{1,2})$/.exec(s) // μήνας → τρίμηνο του
    if (m && valid(+m[1], +m[2])) return `${m[1]}-Q${Math.ceil(+m[2] / 3)}`
    return null
  }
  const m = /(\d{4})/.exec(s)
  return m ? m[1] : null
}
function valid(y: number, mo: number) { return y >= 1990 && y <= 2100 && mo >= 1 && mo <= 12 }

type P = { y: number; i: number } // i: μήνας 1-12 | τρίμηνο 1-4 | 0 για έτος
function parse(period: string, kind: SeriesKind): P | null {
  const n = normalizePeriod(period, kind)
  if (!n) return null
  if (kind === 'MONTHLY') return { y: +n.slice(0, 4), i: +n.slice(5, 7) }
  if (kind === 'QUARTERLY') return { y: +n.slice(0, 4), i: +n.slice(6) }
  return { y: +n, i: 0 }
}
function fmt(p: P, kind: SeriesKind): string {
  if (kind === 'MONTHLY') return `${p.y}-${String(p.i).padStart(2, '0')}`
  if (kind === 'QUARTERLY') return `${p.y}-Q${p.i}`
  return String(p.y)
}
function prev(p: P, kind: SeriesKind): P {
  if (kind === 'YEARLY') return { y: p.y - 1, i: 0 }
  const max = kind === 'MONTHLY' ? 12 : 4
  return p.i > 1 ? { y: p.y, i: p.i - 1 } : { y: p.y - 1, i: max }
}
function next(p: P, kind: SeriesKind): P {
  if (kind === 'YEARLY') return { y: p.y + 1, i: 0 }
  const max = kind === 'MONTHLY' ? 12 : 4
  return p.i < max ? { y: p.y, i: p.i + 1 } : { y: p.y + 1, i: 1 }
}
function current(ref: Date, kind: SeriesKind): P {
  const y = ref.getFullYear()
  const mo = ref.getMonth() + 1
  return kind === 'MONTHLY' ? { y, i: mo } : kind === 'QUARTERLY' ? { y, i: Math.ceil(mo / 3) } : { y, i: 0 }
}

/** Οι τελευταίες `count` ΟΛΟΚΛΗΡΩΜΕΝΕΣ περίοδοι πριν την ημερομηνία αναφοράς (η τρέχουσα δεν έχει κλείσει ακόμη), παλαιότερη πρώτη. */
export function lastPeriods(kind: SeriesKind, count: number, ref: Date = new Date()): string[] {
  if (kind === 'LIST' || count <= 0) return []
  const out: string[] = []
  let p = prev(current(ref, kind), kind)
  for (let k = 0; k < Math.min(count, 240); k++) { out.unshift(fmt(p, kind)); p = prev(p, kind) }
  return out
}

/** Όλες οι περίοδοι από–έως (συμπεριλαμβανομένων). */
export function rangePeriods(kind: SeriesKind, from: string, to: string): string[] {
  const a = parse(from, kind)
  const b = parse(to, kind)
  if (!a || !b) return []
  const out: string[] = []
  let p = a
  for (let k = 0; k < 240 && (p.y < b.y || (p.y === b.y && p.i <= b.i)); k++) { out.push(fmt(p, kind)); p = next(p, kind) }
  return out
}

export type SeriesRequirement = { kind: SeriesKind; count: number | null; from: string | null; to: string | null }

/** Περιγραφή της απαίτησης: «12 τελευταίοι μήνες», «01/2024 – 12/2024», «τουλάχιστον 3 αρχεία». */
export function requirementLabel(r: SeriesRequirement): string {
  const meta = seriesMeta(r.kind)
  if (r.kind === 'LIST') return `τουλάχιστον ${r.count ?? 1} ${(r.count ?? 1) === 1 ? 'αρχείο' : 'αρχεία'}`
  if (r.from && r.to) return `${periodLabel(normalizePeriod(r.from, r.kind))} – ${periodLabel(normalizePeriod(r.to, r.kind))}`
  return `${r.count ?? meta.defaultCount} τελευταί${r.kind === 'MONTHLY' ? 'οι μήνες' : r.kind === 'QUARTERLY' ? 'α τρίμηνα' : 'α έτη'}`
}

export type SeriesCoverage = { required: string[]; present: string[]; missing: string[]; complete: boolean; needed: number; have: number }

/** Κάλυψη μιας απαίτησης από τις περιόδους που υπάρχουν (για LIST: πλήθος αρχείων). */
export function seriesCoverage(r: SeriesRequirement, periods: (string | null)[], ref: Date = new Date()): SeriesCoverage {
  if (r.kind === 'LIST') {
    const needed = Math.max(1, r.count ?? 1)
    const have = periods.length
    return { required: [], present: [], missing: [], complete: have >= needed, needed, have }
  }
  const required = r.from && r.to ? rangePeriods(r.kind, r.from, r.to) : lastPeriods(r.kind, r.count ?? seriesMeta(r.kind).defaultCount, ref)
  const have = new Set(periods.map(p => normalizePeriod(p, r.kind)).filter((p): p is string => !!p))
  const present = required.filter(p => have.has(p))
  const missing = required.filter(p => !have.has(p))
  return { required, present, missing, complete: missing.length === 0 && required.length > 0, needed: required.length, have: present.length }
}

/** «9/12 — λείπουν 04/2025, 07/2025, 11/2025» (περικομμένο αν είναι πολλά). */
export function coverageLabel(c: SeriesCoverage, kind: SeriesKind): string {
  if (kind === 'LIST') return `${c.have}/${c.needed} αρχεία`
  if (c.complete) return `Πλήρης σειρά ${c.have}/${c.needed}`
  const miss = c.missing.slice(0, 6).map(periodLabel).join(', ')
  return `${c.have}/${c.needed} — λείπουν ${miss}${c.missing.length > 6 ? ` κ.ά. (${c.missing.length})` : ''}`
}

/** Περίοδος από το όνομα αρχείου (π.χ. «Φ2_03-2025.pdf», «F2 2025-3», «Ισολογισμός 2024»). */
export function periodFromFileName(fileName: string, kind: SeriesKind): string | null {
  if (kind === 'LIST') return null
  const base = fileName.replace(/\.[^.]+$/, '')
  // «Φ2 012022» / «F2_202201»: μήνας+έτος χωρίς διαχωριστικό.
  const c = /(?:^|\D)(0[1-9]|1[0-2])(20\d{2})(?:\D|$)|(?:^|\D)(20\d{2})(0[1-9]|1[0-2])(?:\D|$)/.exec(base)
  if (c && kind !== 'YEARLY') return normalizePeriod(c[1] ? `${c[2]}-${c[1]}` : `${c[3]}-${c[4]}`, kind)
  const m = /(\d{1,2})[-_. /](20\d{2})|(20\d{2})[-_. /](\d{1,2})/.exec(base)
  if (m && kind !== 'YEARLY') return normalizePeriod(m[1] ? `${m[1]}/${m[2]}` : `${m[3]}-${m[4]}`, kind)
  return kind === 'YEARLY' ? normalizePeriod(/(20\d{2})/.exec(base)?.[1] ?? null, kind) : null
}
