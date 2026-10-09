'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { Sparkles, RefreshCw, PenLine, EyeOff, RotateCcw, Plus, ExternalLink, Loader2, Lightbulb } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Switch } from '@/components/ui/switch'
import { cn } from '@/lib/utils'
import { autopilotState, saveAutopilotSettings, harvestNow, writeIdeaNow, setIdeaStatus, addIdea, seedCompetitorIdeas, type IdeaRow } from './seo-actions'

const SOURCE: Record<string, string> = { ESPA_NEWS: 'espa.gr', PROGRAM: 'Πρόγραμμα', KEYWORD: 'Λέξη-κλειδί', MANUAL: 'Χειροκίνητη' }
const STATUS: Record<string, { label: string; cls: string }> = {
  NEW: { label: 'Νέα', cls: 'bg-sky-500/15 text-sky-800 dark:text-sky-300' },
  WRITING: { label: 'Γράφεται…', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  USED: { label: 'Άρθρο', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  SKIPPED: { label: 'Παραλείφθηκε', cls: 'bg-muted text-muted-foreground' },
  ERROR: { label: 'Σφάλμα', cls: 'bg-destructive/10 text-destructive' },
}

/**
 * Αυτόματη αρθρογραφία για SEO/GEO/AEO: ιδέες από espa.gr / προγράμματα / λέξεις-κλειδιά → άρθρα με φυσικό,
 * εμπορικό λόγο, έλεγχο στοιχείων, FAQ, εσωτερικούς συνδέσμους και εικόνα από το Gallery. Ρυθμός ανά εβδομάδα.
 */
export function AutopilotTab({ canEdit }: { canEdit: boolean }) {
  const [state, setState] = useState<Awaited<ReturnType<typeof autopilotState>> | null>(null)
  const [filter, setFilter] = useState<'NEW' | 'USED' | 'all'>('NEW')
  const [pending, start] = useTransition()
  const [title, setTitle] = useState('')
  const [keyword, setKeyword] = useState('')

  const load = useCallback(async () => { setState(await autopilotState()) }, [])
  useEffect(() => {
    let alive = true
    void autopilotState().then(r => { if (alive) setState(r) })
    return () => { alive = false }
  }, [])
  // Όσο γράφεται κάποιο άρθρο, ανανέωση κάθε 10″.
  const writing = state?.ideas.some(i => i.status === 'WRITING')
  useEffect(() => {
    if (!writing) return
    const t = setInterval(() => void load(), 10_000)
    return () => clearInterval(t)
  }, [writing, load])

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const r = await fn()
    if (r.ok) toast.success(r.message); else toast.error(r.message)
    await load()
  })

  if (!state) return <div className="glass flex items-center gap-2 p-4 text-[length:var(--fs-13)] text-muted-foreground"><Loader2 className="size-4 animate-spin" />Φόρτωση…</div>
  const s = state.settings
  const ideas = state.ideas.filter(i => filter === 'all' || (filter === 'NEW' ? ['NEW', 'WRITING', 'ERROR'].includes(i.status) : i.status === 'USED'))
  const save = (patch: Partial<typeof s>) => run(() => saveAutopilotSettings({ ...s, ...patch }))

  return (
    <div className="space-y-3.5">
      <div className="glass p-4">
        <div className="flex flex-wrap items-start gap-4">
          <div className="min-w-0 flex-1">
            <h2 className="flex items-center gap-2 text-[length:var(--fs-16)] font-semibold"><Sparkles className="size-4 text-primary" aria-hidden />Αυτόματη αρθρογραφία</h2>
            <p className="text-[length:var(--fs-13)] text-muted-foreground">
              Κάθε πρωί ο μηχανισμός διαβάζει τα νέα του espa.gr και τα ενεργά προγράμματα, κρατά ό,τι ενδιαφέρει επιχειρήσεις και γράφει άρθρα με φυσικό, εμπορικό λόγο — με έλεγχο στοιχείων από την επίσημη πηγή, «Με μια ματιά», Συχνές ερωτήσεις (Google & AI απαντήσεις), εσωτερικούς συνδέσμους και φωτογραφία από το Gallery. Άρθρα που δεν περνούν τον έλεγχο ποιότητας μένουν «Προς έγκριση».
            </p>
          </div>
          <div className="flex flex-col gap-2 text-[length:var(--fs-13)]">
            <label className="flex items-center justify-between gap-3"><span>Ενεργό</span><Switch checked={s.enabled} disabled={!canEdit || pending} onCheckedChange={v => save({ enabled: v })} /></label>
            <label className="flex items-center justify-between gap-3"><span>Αυτόματη δημοσίευση</span><Switch checked={s.autoPublish} disabled={!canEdit || pending} onCheckedChange={v => save({ autoPublish: v })} /></label>
            <label className="flex items-center justify-between gap-3">
              <span>Άρθρα / εβδομάδα</span>
              <select value={s.perWeek} disabled={!canEdit || pending} onChange={e => save({ perWeek: Number(e.target.value) })} className="h-8 rounded-lg border border-input bg-card px-2">
                {[1, 2, 3, 4, 5, 7].map(n => <option key={n} value={n}>{n}</option>)}
              </select>
            </label>
          </div>
        </div>
        {canEdit && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(harvestNow)}><RefreshCw className="size-4" />Νέες ιδέες από espa.gr</Button>
            <Button type="button" variant="outline" disabled={pending} onClick={() => run(seedCompetitorIdeas)}><Lightbulb className="size-4" />Ιδέες από ανάλυση ανταγωνισμού</Button>
          </div>
        )}
      </div>

      {canEdit && (
        <form className="glass flex flex-wrap items-end gap-2 p-3" onSubmit={e => { e.preventDefault(); run(async () => { const r = await addIdea({ title, keyword }); if (r.ok) { setTitle(''); setKeyword('') } return r }) }}>
          <label className="min-w-[16rem] flex-1 text-[length:var(--fs-12-5)] text-muted-foreground">Θέμα άρθρου
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Πώς χρηματοδοτείται ένα νέο αρτοποιείο το 2026"
              className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-[length:var(--fs-13-5)] text-foreground outline-none focus:border-primary" />
          </label>
          <label className="w-56 text-[length:var(--fs-12-5)] text-muted-foreground">Λέξη-κλειδί (προαιρετικά)
            <input value={keyword} onChange={e => setKeyword(e.target.value)} placeholder="π.χ. επιδότηση αρτοποιείου"
              className="mt-1 h-10 w-full rounded-lg border border-input bg-card px-3 text-[length:var(--fs-13-5)] text-foreground outline-none focus:border-primary" />
          </label>
          <Button type="submit" disabled={pending || title.trim().length < 8}><Plus className="size-4" />Προσθήκη ιδέας</Button>
        </form>
      )}

      <div className="flex flex-wrap items-center gap-1.5">
        {(['NEW', 'USED', 'all'] as const).map(f => (
          <button key={f} type="button" className={cn('pill', filter === f && 'on')} onClick={() => setFilter(f)}>
            {f === 'NEW' ? 'Ιδέες προς γραφή' : f === 'USED' ? 'Γραμμένα άρθρα' : 'Όλες'}
          </button>
        ))}
      </div>

      <ul className="space-y-2">
        {ideas.length === 0 && <li className="glass p-4 text-[length:var(--fs-13)] text-muted-foreground">Καμία ιδέα εδώ ακόμα — πατήστε «Νέες ιδέες από espa.gr» ή προσθέστε δική σας.</li>}
        {ideas.map(i => <IdeaItem key={i.id} i={i} canEdit={canEdit} busy={pending} run={run} />)}
      </ul>
    </div>
  )
}

function IdeaItem({ i, canEdit, busy, run }: { i: IdeaRow; canEdit: boolean; busy: boolean; run: (fn: () => Promise<{ ok: boolean; message: string }>) => void }) {
  return (
    <li className="glass p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[length:var(--fs-11-5)]">
        <span className={cn('rounded-full px-2 py-0.5', STATUS[i.status]?.cls)}>{STATUS[i.status]?.label ?? i.status}</span>
        <span className="text-muted-foreground">{SOURCE[i.source] ?? i.source}</span>
        <span className="tabular-nums text-muted-foreground">βαθμός {i.score}</span>
        {i.targetKeyword && <span className="rounded-full bg-muted px-2 py-0.5">🔎 {i.targetKeyword}</span>}
        {i.sourceUrl && <a href={i.sourceUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">πηγή <ExternalLink className="size-3" aria-hidden /></a>}
      </div>
      <p className="text-[length:var(--fs-14)] font-semibold">{i.title}</p>
      {i.summary && <p className="text-[length:var(--fs-13)] text-muted-foreground">{i.summary}</p>}
      {i.error && <p className={cn('mt-1 text-[length:var(--fs-12-5)]', i.status === 'ERROR' ? 'text-destructive' : 'text-amber-700 dark:text-amber-300')}>{i.error}</p>}
      <div className="mt-2 flex flex-wrap gap-1.5">
        {i.postId && <Link href={`/cms/posts/${i.postId}`} className="btn-pill btn-glass h-8 px-3 text-[length:var(--fs-12-5)]"><PenLine className="size-3.5" aria-hidden />Άνοιγμα άρθρου{i.postStatus ? ` (${i.postStatus === 'PUBLISHED' ? 'δημοσιευμένο' : 'προς έγκριση'})` : ''}</Link>}
        {canEdit && ['NEW', 'ERROR'].includes(i.status) && (
          <>
            <Button type="button" size="sm" disabled={busy} onClick={() => run(() => writeIdeaNow(i.id, false))}><PenLine className="size-3.5" />Γράψε (προς έγκριση)</Button>
            <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => writeIdeaNow(i.id, true))}>Γράψε & δημοσίευσε</Button>
            <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setIdeaStatus(i.id, 'SKIPPED'))}><EyeOff className="size-3.5" />Παράλειψη</Button>
          </>
        )}
        {canEdit && i.status === 'SKIPPED' && <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => run(() => setIdeaStatus(i.id, 'NEW'))}><RotateCcw className="size-3.5" />Επαναφορά</Button>}
        {i.status === 'WRITING' && <span className="flex items-center gap-1.5 text-[length:var(--fs-12-5)] text-muted-foreground"><Loader2 className="size-3.5 animate-spin" />Συγγραφή & επιμέλεια (2-4′)…</span>}
      </div>
    </li>
  )
}
