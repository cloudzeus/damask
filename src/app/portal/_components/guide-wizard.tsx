'use client'

import * as React from 'react'
import Link from 'next/link'
import { LuArrowLeft, LuArrowRight, LuCheck, LuLightbulb, LuPartyPopper, LuSparkles } from 'react-icons/lu'
import type { Guide } from '@/lib/pm/portal-guides'

const KEY = (slug: string) => `portal-guide:${slug}`
const read = (slug: string): number[] => { try { return JSON.parse(localStorage.getItem(KEY(slug)) ?? '[]') as number[] } catch { return [] } }

/** Wizard βήμα-βήμα: λίστα βημάτων (κλικ για μετάβαση), εξήγηση, «τι κάνετε», συμβουλή, ενέργεια, πρόοδος (τοπικά). */
export function GuideWizard({ guide, startAt = 0, preview = '' }: { guide: Guide; startAt?: number; preview?: string }) {
  const [i, setI] = React.useState(Math.min(startAt, guide.steps.length - 1))
  const [done, setDone] = React.useState<number[]>([])
  const [finished, setFinished] = React.useState(false)
  React.useEffect(() => { const d = read(guide.slug); if (d.length) setDone(d) }, [guide.slug]) // eslint-disable-line react-hooks/set-state-in-effect -- φόρτωση προόδου από localStorage μετά το hydration

  const step = guide.steps[i]
  const total = guide.steps.length
  const q = preview ? `?preview=${encodeURIComponent(preview)}` : ''
  function mark(n: number) {
    const next = done.includes(n) ? done : [...done, n]
    setDone(next)
    try { localStorage.setItem(KEY(guide.slug), JSON.stringify(next)) } catch { /* προαιρετικό */ }
  }
  function go(n: number) { setFinished(false); setI(Math.max(0, Math.min(total - 1, n))); window.scrollTo({ top: 0, behavior: 'smooth' }) }
  function next() { mark(i); if (i === total - 1) setFinished(true); else go(i + 1) }
  const ask = (text: string) => window.dispatchEvent(new CustomEvent('thanos:ask', { detail: { text } }))

  return (
    <div className="p-wizard">
      <ol className="p-wsteps" aria-label="Βήματα οδηγού">
        {guide.steps.map((s, n) => (
          <li key={n}>
            <button type="button" className={`${n === i && !finished ? 'on' : ''} ${done.includes(n) ? 'done' : ''}`} onClick={() => go(n)} aria-current={n === i ? 'step' : undefined}>
              <span className="n">{done.includes(n) ? <LuCheck aria-hidden /> : n + 1}</span><span className="t">{s.title}</span>
            </button>
          </li>
        ))}
      </ol>

      <div className="p-card p-wbody">
        <div className="p-wbar" role="progressbar" aria-valuenow={Math.round((done.length / total) * 100)} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος οδηγού"><span style={{ width: `${(done.length / total) * 100}%` }} /></div>
        {finished ? (
          <div className="p-wdone">
            <LuPartyPopper aria-hidden />
            <h2>Ολοκληρώσατε τον οδηγό</h2>
            <p className="p-muted">Αν κάτι δεν είναι ξεκάθαρο για το δικό σας έργο, ρωτήστε τον Thanos ή τον σύμβουλό σας.</p>
            <div className="acts"><Link className="p-btn" href={`/portal/odigoi${q}`}>Όλοι οι οδηγοί</Link><button type="button" className="p-btn p-btn-outline" onClick={() => go(0)}>Από την αρχή</button></div>
          </div>
        ) : (
          <>
            <div className="p-kicker">ΒΗΜΑ {i + 1} ΑΠΟ {total}</div>
            <h2>{step.title}</h2>
            <p className="lead">{step.body}</p>
            {step.todo?.length ? (
              <ul className="p-wtodo">{step.todo.map((t, n) => <li key={n}><LuCheck aria-hidden />{t}</li>)}</ul>
            ) : null}
            {step.tip && <div className="p-wtip"><LuLightbulb aria-hidden /><span>{step.tip}</span></div>}
            {step.action && (
              step.action.ask
                ? <button type="button" className="p-btn p-btn-outline" onClick={() => ask(step.action!.ask!)}><LuSparkles aria-hidden /> {step.action.label}</button>
                : <Link className="p-btn p-btn-outline" href={`${step.action.href}${q}`}>{step.action.label} →</Link>
            )}
            <div className="p-wnav">
              <button type="button" className="p-btn p-btn-outline" onClick={() => go(i - 1)} disabled={i === 0}><LuArrowLeft aria-hidden /> Προηγούμενο</button>
              <button type="button" className="p-btn" onClick={next}>{i === total - 1 ? <>Ολοκλήρωση <LuCheck aria-hidden /></> : <>Κατάλαβα, επόμενο <LuArrowRight aria-hidden /></>}</button>
            </div>
          </>
        )}
      </div>
    </div>
  )
}
