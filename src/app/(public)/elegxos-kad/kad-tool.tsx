'use client'

import { useEffect, useRef, useState, useTransition } from 'react'
import Link from 'next/link'
import { LuSearch, LuCircleCheck, LuCircleX, LuCircleMinus, LuCircleDot, LuArrowRight, LuShieldCheck } from 'react-icons/lu'
import { kadSuggestAction, kadCheckAction } from './actions'
import type { KadSuggestion, KadCheckResult } from '@/lib/seo-content/kad-check'
import { openEligibility } from '../_components/eligibility-modal'

const STATUS = {
  eligible: { label: 'Επιλέξιμος ΚΑΔ', icon: <LuCircleCheck />, cls: 'ok' },
  all: { label: 'Όλοι οι ΚΑΔ', icon: <LuCircleDot />, cls: 'all' },
  'not-listed': { label: 'Όχι στη λίστα', icon: <LuCircleMinus />, cls: 'no' },
  excluded: { label: 'Εξαιρείται', icon: <LuCircleX />, cls: 'no' },
} as const

/** Γρήγορος έλεγχος ενός ΚΑΔ — δευτερεύον εργαλείο· κάθε αποτέλεσμα οδηγεί στον πλήρη έλεγχο με ΑΦΜ. */
export function KadTool() {
  const [q, setQ] = useState('')
  const [sugg, setSugg] = useState<KadSuggestion[]>([])
  const [result, setResult] = useState<KadCheckResult>(null)
  const [searched, setSearched] = useState(false)
  const [pending, start] = useTransition()
  const timer = useRef<number | undefined>(undefined)

  useEffect(() => {
    window.clearTimeout(timer.current)
    if (q.trim().length < 2) return
    timer.current = window.setTimeout(() => { kadSuggestAction(q).then(setSugg).catch(() => setSugg([])) }, 220)
    return () => window.clearTimeout(timer.current)
  }, [q])

  const check = (code: string) => {
    setSugg([]); setSearched(true)
    start(async () => setResult(await kadCheckAction(code).catch(() => null)))
  }
  const visibleSugg = q.trim().length >= 2 ? sugg : []

  return (
    <div className="kadt">
      <form className="kadt-form" onSubmit={e => { e.preventDefault(); if (visibleSugg[0] && !/^[\d.\s]+$/.test(q)) check(visibleSugg[0].code); else check(q) }} role="search">
        <label htmlFor="kadt-q" className="sr-only">ΚΑΔ ή δραστηριότητα</label>
        <LuSearch aria-hidden />
        <input id="kadt-q" value={q} onChange={e => { setQ(e.target.value); setResult(null); setSearched(false) }} autoComplete="off"
          placeholder="π.χ. 56.10 ή «εστιατόριο», «λογισμικό»" aria-autocomplete="list" aria-controls="kadt-list" />
        <button type="submit" className="btn" disabled={pending || q.trim().length < 2}>{pending ? 'Έλεγχος…' : 'Έλεγχος'}</button>
      </form>
      {visibleSugg.length > 0 && !result && (
        <ul id="kadt-list" className="kadt-sugg" role="listbox" aria-label="Προτεινόμενοι ΚΑΔ">
          {visibleSugg.map(s => (
            <li key={s.code} role="option" aria-selected="false">
              <button type="button" onClick={() => { setQ(`${s.code} ${s.title}`); check(s.code) }}><b>{s.code}</b><span>{s.title}</span></button>
            </li>
          ))}
        </ul>
      )}
      {searched && !pending && !result && <p className="kadt-empty">Δεν αναγνωρίσαμε τον ΚΑΔ. Δοκιμάστε τον κωδικό με τελείες (π.χ. 56.10.11) ή κάντε τον πλήρη έλεγχο με ΑΦΜ — βρίσκει μόνος του όλους τους ΚΑΔ σας.</p>}
      {result && (
        <div className="kadt-result" aria-live="polite">
          <div className="kadt-kad"><b>ΚΑΔ {result.code}</b>{result.title && <span>{result.title}</span>}</div>
          {result.programs.length === 0 ? (
            <p className="kadt-empty">Δεν υπάρχει ανοιχτό πρόγραμμα αυτή τη στιγμή.</p>
          ) : (
            <ul className="kadt-progs">
              {result.programs.map(p => {
                const st = STATUS[p.status]
                return (
                  <li key={p.slug} className={`is-${st.cls}`}>
                    <span className="st">{st.icon}{st.label}</span>
                    <Link href={`/programmata/${p.slug}`}><b>{p.title}</b></Link>
                    <small>{p.note}{p.rate ? ` · ${p.rate}` : ''}{p.deadline ? ` · έως ${p.deadline}` : ''}</small>
                  </li>
                )
              })}
            </ul>
          )}
          <div className="kadt-upsell">
            <LuShieldCheck aria-hidden />
            <div><b>Ο ΚΑΔ είναι μόνο το πρώτο κριτήριο.</b><span>Με τον ΑΦΜ σας ελέγχουμε αυτόματα όλους τους ΚΑΔ, την περιφέρεια, το μέγεθος και τα έτη λειτουργίας — σε όλα τα ενεργά προγράμματα.</span></div>
            <button type="button" className="btn" onClick={() => openEligibility()}>Πλήρης έλεγχος με ΑΦΜ <LuArrowRight aria-hidden /></button>
          </div>
        </div>
      )}
    </div>
  )
}
