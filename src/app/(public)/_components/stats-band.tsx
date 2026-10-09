import type { ReactNode } from 'react'
import { LuBadgeCheck, LuTrendingUp, LuLayers, LuHandshake, LuMapPinned, LuBriefcase } from 'react-icons/lu'

export type StatItem = {
  /** Τελική τιμή για τον μετρητή (αν λείπει, εμφανίζεται το `display` ως έχει). */
  count?: number
  suffix?: string
  display: string
  label: string
  icon: 'approved' | 'rate' | 'programs' | 'partners' | 'regions' | 'sectors'
  /** 0–100: πόσο γεμίζει η μπάρα (οπτικό, όχι ακριβές μέγεθος). */
  fill: number
}

const ICONS: Record<StatItem['icon'], ReactNode> = {
  approved: <LuBadgeCheck />, rate: <LuTrendingUp />, programs: <LuLayers />,
  partners: <LuHandshake />, regions: <LuMapPinned />, sectors: <LuBriefcase />,
}

/**
 * «Σε αριθμούς»: σκούρα μπάντα με τις κορδέλες του λογότυπου σε αργή κίνηση, λευκοί μετρητές (data-count) και
 * χρωματιστή μπάρα ανά δείκτη που γεμίζει όταν εμφανιστεί (wwa-motion). Κάθε δείκτης παίρνει ένα χρώμα λογότυπου.
 */
export function StatsBand({ items, eyebrow = 'Σε αριθμούς', title = 'Αποτελέσματα που μετράνε' }: { items: StatItem[]; eyebrow?: string; title?: string }) {
  return (
    <section lang="el" className="sband" aria-labelledby="sband-t">
      <span className="sband-ribbons" aria-hidden><i /><i /><i /><i /></span>
      <div className="wrap">
        <div className="sband-head r">
          <span className="sband-eyebrow">{eyebrow}</span>
          <h2 id="sband-t">{title}</h2>
        </div>
        <ul className="sband-grid">
          {items.map((it, i) => (
            <li key={it.label} className={`sband-item c${i % 4} r`}>
              <span className="sband-ic" aria-hidden>{ICONS[it.icon]}</span>
              <span className="sband-val" {...(it.count != null ? { 'data-count': it.count, 'data-suffix': it.suffix ?? '' } : {})}>{it.display}</span>
              <span className="sband-label">{it.label}</span>
              <span className="sb-bar" aria-hidden><i style={{ width: `${Math.max(8, Math.min(100, it.fill))}%` }} /></span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

/** Οι βασικοί δείκτες της WWA (ίδιοι σε αρχική/εταιρεία). */
export const WWA_STATS: StatItem[] = [
  { count: 2500, suffix: '+', display: '2.500+', label: 'επενδυτικά σχέδια με έγκριση', icon: 'approved', fill: 92 },
  { display: '98–100%', label: 'ποσοστό εγκρίσεων', icon: 'rate', fill: 99 },
  { count: 30, suffix: '+', display: '30+', label: 'προγράμματα σε υλοποίηση ή ολοκληρωμένα', icon: 'programs', fill: 70 },
  { count: 6, display: '6', label: 'κλαδικοί φορείς — σύμβουλοι ή μέλη', icon: 'partners', fill: 55 },
]
