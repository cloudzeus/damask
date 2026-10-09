'use client'

import { useState } from 'react'
import Link from 'next/link'
import { LuSearch, LuX } from 'react-icons/lu'
import type { HubFaqGroup } from '@/lib/seo-content/faq-hub'

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ')

/** Αναζήτηση (χωρίς τόνους) + κατηγορίες σε accordion. Όλο το περιεχόμενο αποδίδεται και στον server (SEO). */
export function FaqHubList({ groups }: { groups: HubFaqGroup[] }) {
  const [q, setQ] = useState('')
  const terms = norm(q).split(/\s+/).filter(t => t.length > 1)
  const shown = groups
    .map(g => ({ ...g, items: terms.length ? g.items.filter(it => { const hay = norm(`${it.q} ${it.a}`); return terms.every(t => hay.includes(t)) }) : g.items }))
    .filter(g => g.items.length)
  const total = shown.reduce((n, g) => n + g.items.length, 0)

  return (
    <>
      <div className="faqhub-search r">
        <LuSearch aria-hidden />
        <input type="search" value={q} onChange={e => setQ(e.target.value)} placeholder="Αναζητήστε, π.χ. «προκαταβολή», «ΚΑΔ», «ελεύθερος επαγγελματίας»" aria-label="Αναζήτηση στις ερωτήσεις" />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Καθαρισμός αναζήτησης"><LuX /></button>}
      </div>
      <p className="faqhub-count" aria-live="polite">{terms.length ? (total ? `${total} ${total === 1 ? 'απάντηση' : 'απαντήσεις'}` : 'Δεν βρέθηκε απάντηση — ρωτήστε μας απευθείας.') : ''}</p>
      {!terms.length && (
        <nav className="faqhub-chips" aria-label="Κατηγορίες ερωτήσεων">
          {groups.map(g => <a key={g.id} href={`#${g.id}`} className="pill">{g.title}</a>)}
        </nav>
      )}
      {shown.map(g => (
        <section key={g.id} id={g.id} className="faqhub-group" aria-labelledby={`${g.id}-t`}>
          <h2 id={`${g.id}-t`}>{g.title}</h2>
          <p className="faqhub-intro">{g.intro}</p>
          <div className="acc faq">
            {g.items.map(it => (
              <details key={it.q} open={!!terms.length}>
                <summary>{it.q}</summary>
                <div className="acc-body">
                  {it.a}
                  {it.link && <> <Link href={it.link.href} className="faqhub-link">{it.link.label} →</Link></>}
                </div>
              </details>
            ))}
          </div>
        </section>
      ))}
    </>
  )
}
