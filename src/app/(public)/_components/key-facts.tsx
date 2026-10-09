import { Users, Building2, CalendarClock, FileCheck2, Landmark, MapPin, Clock, Percent, Info, Coins } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * «Με μια ματιά»: ο πίνακας στοιχείων του άρθρου (markdown) γίνεται οπτικό μπλοκ — το πιο σημαντικό κομμάτι.
 *  • ποσοστά → δακτύλιοι (navy πάνελ, cyan)   • ποσά/εύρη ποσών → μεγάλοι αριθμοί + μπάρες σύγκρισης
 *  • υπόλοιπα (δικαιούχοι, αιτήσεις, προθεσμίες…) → κάρτες με εικονίδιο.
 */

export type FactRow = { label: string; value: string }

/** Χωρίζει το markdown στην ενότητα «## Με μια ματιά» (πίνακας). */
export function splitGlance(body: string): { before: string; rows: FactRow[]; after: string } | null {
  const head = body.match(/^##\s+Με μια ματιά[^\n]*\n/m)
  if (!head || head.index === undefined) return null
  const start = head.index
  const contentStart = start + head[0].length
  const next = body.slice(contentStart).search(/^##\s/m)
  const end = next < 0 ? body.length : contentStart + next
  const rows = body.slice(contentStart, end).split('\n').map(l => l.trim()).filter(l => l.startsWith('|'))
    .map(l => l.replace(/^\||\|$/g, '').split('|').map(c => c.replace(/\*\*/g, '').trim()))
    .filter(c => c.length >= 2 && !/^:?-{2,}/.test(c[0]) && !/^στοιχείο$/i.test(c[0]))
    .map(c => ({ label: c[0], value: c.slice(1).join(' · ') }))
  if (rows.length < 2) return null
  return { before: body.slice(0, start), rows, after: body.slice(end) }
}

const num = (s: string) => Number(s.replace(/\./g, '').replace(',', '.'))
/** Ποσά σε € από κείμενο («20.000 € έως 8.000.000 €», «330 εκατ. ευρώ», «1,3 δισ.»). */
function amountsOf(v: string): number[] {
  const out: number[] = []
  for (const m of v.matchAll(/(\d{1,3}(?:\.\d{3})+|\d+(?:,\d+)?)\s*(εκατ\.?|εκατομμύρια|δισ\.?|δισεκατομμύρια|χιλ\.?)?\s*(?:€|ευρώ)?/gi)) {
    const n = num(m[1])
    if (!Number.isFinite(n) || n === 0) continue
    const unit = (m[2] ?? '').toLowerCase()
    const mult = unit.startsWith('δισ') ? 1e9 : unit.startsWith('εκατ') ? 1e6 : unit.startsWith('χιλ') ? 1e3 : 1
    out.push(n * mult)
  }
  return out
}
const isMoney = (v: string) => /€|ευρώ/i.test(v) && amountsOf(v).some(n => n >= 1000)
const percentOf = (v: string) => { const m = v.match(/(\d+(?:[.,]\d+)?)\s*%/); return m ? Math.min(100, num(m[1])) : null }
const eur = (n: number) => (n >= 1e9 ? `${(n / 1e9).toLocaleString('el-GR', { maximumFractionDigits: 1 })} δισ. €` : n >= 1e6 ? `${(n / 1e6).toLocaleString('el-GR', { maximumFractionDigits: 1 })} εκατ. €` : `${n.toLocaleString('el-GR')} €`)

function iconFor(label: string): LucideIcon {
  const l = label.toLowerCase()
  if (/δικαιούχ|ποιοι|επιχειρήσ/.test(l)) return Users
  if (/προθεσμ|λήξη|έναρξη|ημερομην|υποβολ/.test(l)) return CalendarClock
  if (/αίτησ|δικαιολογ|πλατφόρμ/.test(l)) return FileCheck2
  if (/ταμείο|φορέας|πρόγραμμα|δράση/.test(l)) return Landmark
  if (/περιοχ|περιφέρει|γεωγραφ/.test(l)) return MapPin
  if (/διάρκει|χάριτος|μήνες/.test(l)) return Clock
  if (/ποσοστ|επιδότηση επιτοκ/.test(l)) return Percent
  if (/κεφάλαι|προϋπολογ|ποσό/.test(l)) return Coins
  if (/εταιρ|μορφή/.test(l)) return Building2
  return Info
}

export function KeyFacts({ rows }: { rows: FactRow[] }) {
  const percents = rows.map(r => ({ ...r, pct: percentOf(r.value) })).filter(r => r.pct != null && !isMoney(r.value)) as (FactRow & { pct: number })[]
  const money = rows.filter(r => isMoney(r.value) && !percents.includes(r as FactRow & { pct: number }))
    .map(r => { const a = amountsOf(r.value).filter(n => n >= 1000); return { ...r, min: Math.min(...a), max: Math.max(...a), range: a.length > 1 } })
  const rest = rows.filter(r => !percents.some(p => p.label === r.label) && !money.some(m => m.label === r.label))
  const scaleMax = Math.max(...money.map(m => m.max), 1)
  // Λογαριθμική κλίμακα ώστε και τα μικρά ποσά να φαίνονται δίπλα στα μεγάλα.
  const w = (n: number) => `${Math.max(4, (Math.log10(Math.max(n, 1)) / Math.log10(scaleMax)) * 100)}%`

  return (
    <div className="keyfacts r" role="region" aria-label="Με μια ματιά">
      <div className="kf-head"><span className="kf-eyebrow">Με μια ματιά</span><span className="kf-sub">Τα βασικά σε 30 δευτερόλεπτα</span></div>

      {(percents.length > 0 || money.length > 0) && (
        <div className="kf-hero">
          {percents.slice(0, 3).map(p => (
            <div key={p.label} className="kf-ring">
              <div className="ring" style={{ ['--p' as string]: p.pct }} role="img" aria-label={`${p.label}: ${p.value}`}>
                <span>{p.pct.toLocaleString('el-GR')}<small>%</small></span>
              </div>
              <div className="kf-ring-label"><b>{p.label}</b><span>{p.value}</span></div>
            </div>
          ))}
          {money.length > 0 && (
            <div className="kf-money">
              {money.slice(0, 4).map(m => (
                <div key={m.label} className="kf-amount">
                  <div className="kf-amount-top"><span className="kf-amount-label">{m.label}</span><span className="kf-amount-value">{m.range ? <>έως {eur(m.max)}</> : eur(m.max)}</span></div>
                  <div className="kf-bar" aria-hidden><span className="kf-bar-fill" style={{ width: w(m.max) }} />{m.range && <span className="kf-bar-min" style={{ width: w(m.min) }} />}</div>
                  {m.range && <div className="kf-amount-note">από {eur(m.min)}</div>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {rest.length > 0 && (
        <dl className="kf-grid">
          {rest.map(r => { const Icon = iconFor(r.label); return (
            <div key={r.label} className="kf-item">
              <span className="kf-ico" aria-hidden><Icon size={20} strokeWidth={1.6} /></span>
              <div><dt>{r.label}</dt><dd>{r.value}</dd></div>
            </div>
          ) })}
        </dl>
      )}
    </div>
  )
}
