'use client'

import * as React from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { LuBrain, LuLoaderCircle, LuSend, LuX, LuRefreshCw, LuLayers, LuCalendarClock, LuTable2, LuStethoscope, LuLink2, LuMerge } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { askMemoryAction, refreshMemoryAction, searchMemoryCustomers } from '@/lib/memory/actions'
import type { CoreDocType, MemoryAnswer } from '@/lib/memory/core'
import { checkMemoryHealth, relinkRequirement, mergeDocumentTypes, type MemoryHealth } from '@/lib/memory/health'

const EXAMPLES = [
  'Ποια δικαιολογητικά ζητούν τα περισσότερα ενεργά προγράμματα;',
  'Ποια προγράμματα ζητούν υπεύθυνη δήλωση προηγούμενων ενισχύσεων (de minimis);',
  'Τι κύκλο εργασιών και ΦΠΑ εκροών είχε η EFCC ανά μήνα το 2022;',
  'Ποια είναι τα στοιχεία της εγκριτικής απόφασης της EFCC;',
]

/** Κομμάτι κειμένου: **έντονα** και παραπομπές [n] → άγκυρα στην πηγή. */
function Inline({ text }: { text: string }) {
  const parts = text.split(/(\*\*[^*]+\*\*|\[\d+(?:,\s*\d+)*\])/g).filter(Boolean)
  return (
    <>
      {parts.map((p, j) => {
        if (/^\*\*.+\*\*$/.test(p)) return <strong key={j}>{p.slice(2, -2)}</strong>
        const cite = /^\[(\d+(?:,\s*\d+)*)\]$/.exec(p)
        if (cite) {
          return cite[1].split(/,\s*/).map(n => (
            <a key={`${j}-${n}`} href={`#src-${n}`} className="ml-0.5 inline-flex h-4 min-w-4 items-center justify-center rounded-full bg-primary/10 px-1 align-super text-[length:var(--fs-10)] font-bold text-primary no-underline hover:bg-primary/20">{n}</a>
          ))
        }
        return <React.Fragment key={j}>{p}</React.Fragment>
      })}
    </>
  )
}

/** Κείμενο απάντησης: παράγραφοι, λίστες «- », επικεφαλίδες «#», πίνακες markdown «| … |». */
function AnswerText({ text }: { text: string }) {
  const lines = text.split('\n').filter(l => l.trim())
  const blocks: ({ kind: 'table'; rows: string[][] } | { kind: 'line'; text: string })[] = []
  for (const l of lines) {
    if (/^\s*\|/.test(l)) {
      if (/^[\s|:-]+$/.test(l) && l.includes('-')) continue // γραμμή διαχωρισμού |---|---|
      const cells = l.trim().replace(/^\||\|$/g, '').split('|').map(c => c.trim())
      const last = blocks[blocks.length - 1]
      if (last?.kind === 'table') last.rows.push(cells)
      else blocks.push({ kind: 'table', rows: [cells] })
    } else blocks.push({ kind: 'line', text: l })
  }
  return (
    <div className="flex flex-col gap-1.5 text-[length:var(--fs-13)] leading-relaxed">
      {blocks.map((b, i) => {
        if (b.kind === 'table') {
          const [head, ...body] = b.rows
          return (
            <div key={i} className="my-1 overflow-x-auto rounded-xl border border-border">
              <table className="w-full text-[length:var(--fs-12)]">
                <thead className="bg-muted/50 text-left text-[length:var(--fs-11)] font-bold text-muted-foreground">
                  <tr>{head.map((c, k) => <th key={k} className="px-2 py-1.5 whitespace-nowrap">{c}</th>)}</tr>
                </thead>
                <tbody>
                  {body.map((r, k) => <tr key={k} className="border-t border-border">{r.map((c, m) => <td key={m} className={cn('px-2 py-1 tabular-nums', m > 0 && 'text-right')}><Inline text={c} /></td>)}</tr>)}
                </tbody>
              </table>
            </div>
          )
        }
        const h = /^\s*#{1,4}\s+(.*)$/.exec(b.text)
        if (h) return <p key={i} className="mt-1 font-bold"><Inline text={h[1]} /></p>
        const bullet = /^\s*[-•*]\s+/.test(b.text)
        const body = b.text.replace(/^\s*[-•*]\s+/, '')
        return bullet
          ? <div key={i} className="flex gap-2 pl-1"><span aria-hidden className="text-muted-foreground">•</span><span><Inline text={body} /></span></div>
          : <p key={i}><Inline text={body} /></p>
      })}
    </div>
  )
}

export function MemoryClient({ core, canRelink, canMerge }: { core: CoreDocType[]; canRelink: boolean; canMerge: boolean }) {
  const [q, setQ] = React.useState('')
  const [asking, setAsking] = React.useState(false)
  const [result, setResult] = React.useState<(MemoryAnswer & { question: string }) | null>(null)
  const [customer, setCustomer] = React.useState<{ id: string; name: string } | null>(null)
  const [refreshing, setRefreshing] = React.useState(false)

  async function ask(question = q) {
    const text = question.trim()
    if (!text) return
    setQ(text)
    setAsking(true)
    try {
      const r = await askMemoryAction(text, { trdrId: customer?.id ?? null })
      setResult({ ...r, question: text })
    } catch { toast.error('Η ερώτηση απέτυχε.') } finally { setAsking(false) }
  }

  async function refresh() {
    setRefreshing(true)
    try {
      const r = await refreshMemoryAction()
      if (r.ok) toast.success(r.message); else toast.error(r.message)
    } finally { setRefreshing(false) }
  }

  const max = Math.max(1, ...core.map(c => c.programs.length))
  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-[22px] p-4" aria-labelledby="ask-title">
        <div className="mb-2 flex flex-wrap items-center gap-2">
          <LuBrain className="size-4 text-primary" aria-hidden />
          <h2 id="ask-title" className="text-[length:var(--fs-14)] font-bold">Ρωτήστε τη μνήμη</h2>
          <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => void refresh()} disabled={refreshing} title="Ενημέρωση με ό,τι άλλαξε (νέα δικαιολογητικά, τιμές, προγράμματα)">
            {refreshing ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuRefreshCw className="size-3.5" aria-hidden />} Ενημέρωση μνήμης
          </Button>
        </div>
        <form onSubmit={e => { e.preventDefault(); void ask() }} className="flex flex-col gap-2">
          <textarea
            value={q}
            onChange={e => setQ(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); void ask() } }}
            rows={2}
            placeholder="π.χ. Ποια προγράμματα ζητούν ισολογισμούς τριών ετών; Τι έχει ήδη ο πελάτης για το «Πράσινη Παραγωγική»;"
            aria-label="Ερώτηση"
            className="w-full resize-y rounded-2xl border border-border bg-card px-3.5 py-2.5 text-[length:var(--fs-13)] outline-none focus:border-ring"
          />
          <div className="flex flex-wrap items-center gap-2">
            {customer ? (
              <span className="badge-pill info" style={{ textTransform: 'none' }}>
                Πελάτης: {customer.name}
                <button type="button" onClick={() => setCustomer(null)} aria-label="Χωρίς πελάτη" className="ml-1"><LuX className="size-3" aria-hidden /></button>
              </span>
            ) : (
              <CustomerPicker onPick={setCustomer} />
            )}
            <Button type="submit" className="ml-auto" disabled={asking || !q.trim()}>
              {asking ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuSend className="size-3.5" aria-hidden />} Ερώτηση
            </Button>
          </div>
        </form>
        {!result && !asking && (
          <div className="mt-3 flex flex-wrap gap-1.5">
            {EXAMPLES.map(e => (
              <button key={e} type="button" onClick={() => void ask(e)} className="rounded-full border border-border bg-card px-3 py-1 text-left text-[length:var(--fs-11-5)] text-muted-foreground hover:border-primary hover:text-primary">{e}</button>
            ))}
          </div>
        )}
        {asking && <p className="mt-3 flex items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground"><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Ψάχνω σε προγράμματα, δικαιολογητικά, τιμές και αρχεία…</p>}
        {result && !asking && (
          <div className="mt-3 flex flex-col gap-3" aria-live="polite">
            <div className="rounded-2xl border border-border bg-card px-4 py-3">
              <p className="mb-1.5 text-[length:var(--fs-11-5)] font-semibold text-muted-foreground">{result.question}</p>
              <AnswerText text={result.answer} />
            </div>
            {result.sources.length > 0 && (
              <ol className="flex flex-col gap-1 text-[length:var(--fs-11-5)]">
                {result.sources.map(s => (
                  <li key={s.n} id={`src-${s.n}`} className="flex flex-wrap items-baseline gap-x-2 rounded-lg px-2 py-1 target:bg-primary/10">
                    <span className="font-bold text-primary tabular-nums">[{s.n}]</span>
                    <span className="badge-pill muted" style={{ textTransform: 'none' }}>{s.categoryLabel}</span>
                    {s.href ? <Link href={s.href} className="font-semibold hover:text-primary hover:underline">{s.title}</Link> : <span className="font-semibold">{s.title}</span>}
                    {s.trdrName && <span className="text-muted-foreground">· {s.trdrName}</span>}
                  </li>
                ))}
              </ol>
            )}
          </div>
        )}
      </section>

      <HealthSection canRelink={canRelink} canMerge={canMerge} />

      <section className="glass rounded-[22px] p-4" aria-labelledby="core-title">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <LuLayers className="size-4 text-primary" aria-hidden />
          <h2 id="core-title" className="text-[length:var(--fs-14)] font-bold">Πυρήνας δικαιολογητικών</h2>
          <span className="badge-pill muted">{core.length} τύποι</span>
        </div>
        <p className="mb-3 text-[length:var(--fs-11-5)] text-muted-foreground">Τα δικαιολογητικά ταξινομημένα με το πόσα προγράμματα τα ζητούν. Όσο πιο ψηλά, τόσο πιο χρήσιμο να τα έχει κάθε πελάτης πάντα σε ισχύ — ξαναχρησιμοποιούνται αυτόματα σε κάθε νέο έργο.</p>
        <div className="overflow-x-auto rounded-xl border border-border">
          <table className="w-full text-[length:var(--fs-12)]">
            <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
              <tr>
                <th className="px-2 py-2">Τύπος</th>
                <th className="w-56 px-2 py-2">Προγράμματα που το ζητούν</th>
                <th className="px-2 py-2">Μνήμη</th>
              </tr>
            </thead>
            <tbody>
              {core.map(c => (
                <tr key={c.typeId} className="border-t border-border align-middle">
                  <td className="px-2 py-1.5 font-semibold">{c.name}</td>
                  <td className="px-2 py-1.5">
                    <div className="flex items-center gap-2" title={c.programs.map(p => p.title).join('\n')}>
                      <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-primary" style={{ width: `${(c.programs.length / max) * 100}%` }} /></span>
                      <span className="w-16 text-right tabular-nums">{c.programs.length}{c.activePrograms ? <span className="text-muted-foreground"> · {c.activePrograms} ενεργ.</span> : null}</span>
                    </div>
                  </td>
                  <td className="px-2 py-1.5">
                    <div className="flex flex-wrap gap-1">
                      {c.expires && <span className="badge-pill warn" style={{ textTransform: 'none' }}><LuCalendarClock className="size-3" aria-hidden /> λήγει</span>}
                      {c.seriesKind && <span className="badge-pill info" style={{ textTransform: 'none' }}>σειρά</span>}
                      {c.hasValues && <span className="badge-pill ok" style={{ textTransform: 'none' }}><LuTable2 className="size-3" aria-hidden /> κρατά τιμές</span>}
                    </div>
                  </td>
                </tr>
              ))}
              {core.length === 0 && <tr><td colSpan={3} className="px-3 py-5 text-center text-muted-foreground">Δεν υπάρχουν προγράμματα με δηλωμένα δικαιολογητικά.</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  )
}

/** Προαιρετικός περιορισμός της ερώτησης σε έναν πελάτη (αναζήτηση με επωνυμία/ΑΦΜ). */
function CustomerPicker({ onPick }: { onPick: (c: { id: string; name: string }) => void }) {
  const [text, setText] = React.useState('')
  const [list, setList] = React.useState<{ id: string; name: string; afm: string | null }[]>([])
  const timer = React.useRef<ReturnType<typeof setTimeout> | null>(null)
  function change(v: string) {
    setText(v)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => { searchMemoryCustomers(v).then(setList).catch(() => setList([])) }, 250)
  }
  return (
    <div className="relative">
      <input
        value={text}
        onChange={e => change(e.target.value)}
        placeholder="Όλοι οι πελάτες — ή γράψτε επωνυμία/ΑΦΜ…"
        aria-label="Περιορισμός σε πελάτη"
        className="h-9 w-72 rounded-full border border-border bg-card px-3 text-[length:var(--fs-12-5)] outline-none focus:border-ring"
      />
      {list.length > 0 && text.trim().length >= 2 && (
        <ul className="absolute z-20 mt-1 max-h-64 w-80 overflow-y-auto rounded-xl border border-border bg-popover p-1 shadow-lg" role="listbox">
          {list.map(c => (
            <li key={c.id}>
              <button type="button" role="option" aria-selected={false} onClick={() => { onPick({ id: c.id, name: c.name }); setText(''); setList([]) }} className="flex w-full items-baseline gap-2 rounded-lg px-2.5 py-1.5 text-left text-[length:var(--fs-12-5)] hover:bg-muted">
                <span className="font-semibold">{c.name}</span>{c.afm && <span className="text-[length:var(--fs-11)] text-muted-foreground">{c.afm}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

/** «Έλεγχος μνήμης»: λάθος συνδέσεις απαιτήσεων ↔ τύπων και διπλότυποι τύποι — διόρθωση με ένα κλικ. */
function HealthSection({ canRelink, canMerge }: { canRelink: boolean; canMerge: boolean }) {
  const [health, setHealth] = React.useState<MemoryHealth | null>(null)
  const [busy, setBusy] = React.useState<string | null>(null)
  const [confirm, setConfirm] = React.useState<string | null>(null)

  async function check() {
    setBusy('check')
    try {
      const r = await checkMemoryHealth()
      if (!r.ok) { toast.error(r.message); return }
      setHealth(r.health)
      if (!r.health.links.length && !r.health.duplicates.length) toast.success('Η μνήμη είναι τακτοποιημένη — δεν βρέθηκαν προβλήματα.')
    } finally { setBusy(null) }
  }
  async function relink(formId: string, typeId: string) {
    setBusy(formId)
    try {
      await relinkRequirement(formId, typeId)
      toast.success('Η απαίτηση συνδέθηκε με τον σωστό τύπο.')
      setHealth(h => h && { ...h, links: h.links.filter(l => l.formId !== formId) })
    } catch { toast.error('Η σύνδεση απέτυχε.') } finally { setBusy(null) }
  }
  async function merge(keepId: string, ids: string[]) {
    setBusy(keepId)
    try {
      const r = await mergeDocumentTypes(keepId, ids)
      if (!r.ok) { toast.error(r.message); return }
      toast.success(r.message)
      setHealth(h => h && { ...h, duplicates: h.duplicates.filter(d => d.keepId !== keepId) })
    } catch { toast.error('Η συγχώνευση απέτυχε.') } finally { setBusy(null); setConfirm(null) }
  }

  return (
    <section className="glass rounded-[22px] p-4" aria-labelledby="health-title">
      <div className="mb-1 flex flex-wrap items-center gap-2">
        <LuStethoscope className="size-4 text-primary" aria-hidden />
        <h2 id="health-title" className="text-[length:var(--fs-14)] font-bold">Έλεγχος μνήμης</h2>
        <Button type="button" size="sm" variant="outline" className="ml-auto" onClick={() => void check()} disabled={!!busy}>
          {busy === 'check' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuStethoscope className="size-3.5" aria-hidden />} {health ? 'Νέος έλεγχος' : 'Έλεγχος'}
        </Button>
      </div>
      <p className="text-[length:var(--fs-11-5)] text-muted-foreground">Η μνήμη είναι τόσο καλή όσο οι συνδέσεις της: εντοπίζονται απαιτήσεις προγραμμάτων συνδεδεμένες με λάθος τύπο και ίδια έγγραφα καταχωρισμένα ως διαφορετικοί τύποι (που χαλούν την επαναχρησιμοποίηση).</p>
      {health && (
        <div className="mt-3 flex flex-col gap-3">
          {health.links.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[length:var(--fs-12-5)] font-bold">Λάθος συνδέσεις ({health.links.length})</h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {health.links.map(l => (
                  <li key={l.formId} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[length:var(--fs-12)]">
                    <span className="min-w-0 flex-1">
                      <b>{l.formName}</b> <span className="text-muted-foreground">· {l.programTitle}</span>
                      <span className="block text-[length:var(--fs-11)] text-muted-foreground">Τώρα: {l.currentType ?? 'κανένας τύπος'} → προτείνεται <b className="text-foreground">{l.suggestedType}</b>{l.reason ? ` — ${l.reason}` : ''}</span>
                    </span>
                    {canRelink && (
                      <Button type="button" size="sm" onClick={() => void relink(l.formId, l.suggestedTypeId)} disabled={!!busy}>
                        {busy === l.formId ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuLink2 className="size-3.5" aria-hidden />} Σύνδεση
                      </Button>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {health.duplicates.length > 0 && (
            <div>
              <h3 className="mb-1.5 text-[length:var(--fs-12-5)] font-bold">Διπλότυποι τύποι ({health.duplicates.length})</h3>
              <ul className="flex flex-col divide-y divide-border rounded-xl border border-border">
                {health.duplicates.map(d => (
                  <li key={d.keepId} className="flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-2 text-[length:var(--fs-12)]">
                    <span className="min-w-0 flex-1">
                      {d.merge.map(m => <span key={m.id} className="badge-pill muted mr-1" style={{ textTransform: 'none' }} title={`${m.docs} δικαιολογητικά · ${m.forms} απαιτήσεις`}>{m.name}</span>)}
                      → <b>{d.keepName}</b>
                      {d.reason && <span className="block text-[length:var(--fs-11)] text-muted-foreground">{d.reason}</span>}
                    </span>
                    {canMerge && (confirm === d.keepId ? (
                      <span className="flex items-center gap-1.5">
                        <span className="text-[length:var(--fs-11)] text-[color:var(--warning)]">Μεταφέρονται όλα στο «{d.keepName}».</span>
                        <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(null)} disabled={!!busy}>Άκυρο</Button>
                        <Button type="button" size="sm" onClick={() => void merge(d.keepId, d.merge.map(m => m.id))} disabled={!!busy}>
                          {busy === d.keepId ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null} Επιβεβαίωση
                        </Button>
                      </span>
                    ) : (
                      <Button type="button" size="sm" variant="outline" onClick={() => setConfirm(d.keepId)} disabled={!!busy}><LuMerge className="size-3.5" aria-hidden /> Συγχώνευση</Button>
                    ))}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {!health.links.length && !health.duplicates.length && <p className="text-[length:var(--fs-12)] text-[color:var(--success)]">Δεν βρέθηκαν προβλήματα.</p>}
        </div>
      )}
    </section>
  )
}
