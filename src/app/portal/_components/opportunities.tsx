'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuHandHeart, LuLoaderCircle, LuCircleCheck, LuCalendarDays, LuExternalLink } from 'react-icons/lu'
import { expressInterest, type Opportunity } from '@/lib/pm/portal-documents'

const day = (iso: string) => new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

/** Ευκαιρίες ένταξης για την επιχείρηση + «Ενδιαφέρομαι» (γίνεται δυνητικό έργο & ειδοποιείται ο σύμβουλος). */
export function Opportunities({ items, preview }: { items: Opportunity[]; preview: boolean }) {
  const router = useRouter()
  const [busy, setBusy] = React.useState<string | null>(null)
  const [done, setDone] = React.useState<Set<string>>(new Set())

  async function interest(o: Opportunity) {
    setBusy(o.programId)
    const res = await expressInterest(o.programId).catch(() => null)
    setBusy(null)
    if (res?.ok) { toast.success(res.message); setDone(prev => new Set(prev).add(o.programId)); router.refresh() }
    else toast.error(res?.message ?? 'Δεν καταγράφηκε — δοκιμάστε ξανά.')
  }

  return (
    <div className="p-projects">
      {items.map(o => (
        <article key={o.programId} className="p-project" style={{ cursor: 'default' }}>
          <div className="meta">
            {o.fit === 'eligible' ? <span className="p-badge ok"><LuCircleCheck aria-hidden /> Ταιριάζει στην επιχείρησή σας</span>
              : o.fit === 'check' ? <span className="p-badge">Πιθανή ευκαιρία — θέλει έλεγχο{o.reasons.length ? ` (${o.reasons.join(', ')})` : ''}</span>
              : <span className="p-badge warn">Δεν ταιριάζει: {o.reasons.join(', ')}</span>}
            {o.rate && <span className="p-badge">Επιδότηση {o.rate}</span>}
          </div>
          <h3>{o.title}</h3>
          {o.summary && <p className="p-muted" style={{ margin: 0, fontSize: 14 }}>{o.summary}</p>}
          <div className="foot" style={{ alignItems: 'center', flexWrap: 'wrap', gap: 10 }}>
            <span style={{ display: 'inline-flex', gap: 6, alignItems: 'center' }}><LuCalendarDays aria-hidden style={{ width: 14, height: 14 }} />{o.deadline ? `Υποβολές έως ${day(o.deadline)}` : 'Ανοιχτή πρόσκληση'}</span>
            {o.slug && <a href={`/programmata/${o.slug}`} target="_blank" rel="noopener" style={{ display: 'inline-flex', gap: 4, alignItems: 'center', color: 'var(--p-brand)', minHeight: 44 }}>Λεπτομέρειες <LuExternalLink aria-hidden style={{ width: 13, height: 13 }} /></a>}
          </div>
          {done.has(o.programId)
            ? <span className="p-badge ok" style={{ alignSelf: 'flex-start' }}><LuCircleCheck aria-hidden /> Καταγράφηκε — θα σας καλέσουμε</span>
            : <button type="button" className="p-btn" style={{ alignSelf: 'flex-start' }} disabled={preview || busy === o.programId} onClick={() => void interest(o)}>
                {busy === o.programId ? <LuLoaderCircle className="spin" aria-hidden /> : <LuHandHeart aria-hidden />} Ενδιαφέρομαι
              </button>}
        </article>
      ))}
    </div>
  )
}
