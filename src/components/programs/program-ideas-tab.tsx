'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuLightbulb, LuLoaderCircle, LuSparkles, LuPencil, LuBookOpen, LuCircleX, LuCheck, LuX } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { getLatestIdeas, getIdeaSet, startProgramIdeas, saveCapabilities, type IdeaSetRow } from '@/lib/programs/idea-actions'
import type { ProgramIdea } from '@/lib/programs/ideas'

/**
 * «Ιδέες εφαρμογών»: τι μπορούμε να αναπτύξουμε (με το stack/αντικείμενό μας) ώστε να είναι επιλέξιμη δαπάνη
 * για δικαιούχους του προγράμματος — κάθε ιδέα με κατηγορία δαπάνης, παραπομπή στον οδηγό, βεβαιότητα, προϋποθέσεις.
 */

const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const confTone = (c: number) => (c >= 85 ? { cls: 'ok', label: 'Πολύ ισχυρή τεκμηρίωση' } : c >= 65 ? { cls: 'info', label: 'Ισχυρή τεκμηρίωση' } : { cls: 'warn', label: 'Υπό προϋποθέσεις' })

export function ProgramIdeasTab({ programId }: { programId: string }) {
  const [latest, setLatest] = React.useState<IdeaSetRow | null>(null)
  const [caps, setCaps] = React.useState('')
  const [editing, setEditing] = React.useState(false)
  const [draft, setDraft] = React.useState('')
  const [loading, setLoading] = React.useState(true)
  const [starting, setStarting] = React.useState(false)

  React.useEffect(() => {
    let alive = true
    getLatestIdeas(programId).then(r => { if (!alive) return; setLatest(r.latest); setCaps(r.capabilities) }).catch(() => {}).finally(() => { if (alive) setLoading(false) })
    return () => { alive = false }
  }, [programId])

  const runningId = latest?.status === 'RUNNING' ? latest.id : null
  React.useEffect(() => {
    if (!runningId) return
    const iv = setInterval(async () => {
      const r = await getIdeaSet(runningId).catch(() => null)
      if (r && r.status !== 'RUNNING') {
        setLatest(r)
        if (r.status === 'DONE') toast.success('Οι ιδέες είναι έτοιμες.')
        else toast.error(r.error ?? 'Η παραγωγή ιδεών απέτυχε.')
      }
    }, 4000)
    return () => clearInterval(iv)
  }, [runningId])

  async function generate() {
    setStarting(true)
    try {
      const { id } = await startProgramIdeas(programId)
      setLatest(await getIdeaSet(id))
    } catch { toast.error('Δεν ξεκίνησε.') } finally { setStarting(false) }
  }

  async function saveCaps() {
    await saveCapabilities(draft).then(() => { setCaps(draft.trim()); setEditing(false); toast.success('Το αντικείμενο αποθηκεύτηκε — ισχύει για όλα τα προγράμματα.') }).catch(() => toast.error('Η αποθήκευση απέτυχε.'))
  }

  const r = latest?.status === 'DONE' ? latest.result : null

  return (
    <div className="flex flex-col gap-4">
      <section className="glass rounded-[22px] p-4">
        <div className="mb-1 flex flex-wrap items-center gap-2">
          <LuLightbulb className="size-4 text-primary" aria-hidden />
          <span className="text-[length:var(--fs-13)] font-bold">Τι μπορούμε να αναπτύξουμε για αυτό το πρόγραμμα</span>
          <div className="flex-1" />
          <Button type="button" onClick={generate} disabled={starting || !!runningId}>
            {starting || runningId ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuSparkles className="size-3.5" aria-hidden />}
            {latest ? 'Νέες προτάσεις' : 'Πρότεινε εφαρμογές'}
          </Button>
        </div>
        <p className="text-[length:var(--fs-12)] text-muted-foreground">
          Η AI διαβάζει τον οδηγό και τη γνωσιακή μνήμη του προγράμματος και προτείνει εφαρμογές που μπορούμε να φτιάξουμε για δικαιούχους, ώστε το κόστος να είναι
          <b> επιλέξιμη δαπάνη</b> — μόνο όσες αντιστοιχούν σε ρητά επιλέξιμη κατηγορία, με παραπομπή στον οδηγό. Η βεβαιότητα είναι εκτίμηση· την τελική κρίση κάνει η Διαχειριστική Αρχή.
        </p>

        <div className="mt-3 rounded-xl border border-border bg-card p-3">
          <div className="mb-1 flex items-center gap-2 text-[length:var(--fs-11)] font-extrabold tracking-[0.08em] text-muted-foreground uppercase">
            Το αντικείμενό μας
            {!editing && <button type="button" onClick={() => { setDraft(caps); setEditing(true) }} className="ml-auto inline-flex items-center gap-1 text-[length:var(--fs-11-5)] font-semibold tracking-normal normal-case text-primary hover:underline"><LuPencil className="size-3" aria-hidden /> Αλλαγή</button>}
          </div>
          {editing ? (
            <>
              <textarea value={draft} onChange={e => setDraft(e.target.value)} rows={8} className="w-full rounded-lg border border-border bg-card px-2.5 py-2 text-[length:var(--fs-12)] outline-none focus:border-ring" aria-label="Το αντικείμενό μας" />
              <div className="mt-2 flex justify-end gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setEditing(false)}><LuX className="size-3.5" aria-hidden /> Άκυρο</Button>
                <Button type="button" size="sm" onClick={saveCaps}><LuCheck className="size-3.5" aria-hidden /> Αποθήκευση</Button>
              </div>
            </>
          ) : (
            <ul className="flex flex-col gap-0.5 text-[length:var(--fs-12)]">{caps.split('\n').filter(Boolean).map((c, i) => <li key={i}>• {c}</li>)}</ul>
          )}
        </div>
      </section>

      {loading && <div className="flex items-center justify-center gap-2 py-6 text-[length:var(--fs-12-5)] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>}
      {runningId && <div className="glass flex items-center gap-2 rounded-[22px] p-4 text-[length:var(--fs-12-5)]"><LuLoaderCircle className="size-4 animate-spin text-primary" aria-hidden /> Η AI διαβάζει τον οδηγό και ετοιμάζει προτάσεις — περίπου ένα λεπτό…</div>}
      {latest?.status === 'ERROR' && <p className="rounded-xl border border-(--danger) px-3 py-2 text-[length:var(--fs-12-5)] text-(--danger)">{latest.error}</p>}

      {r && (
        <>
          <section className="glass rounded-[22px] p-4 text-[length:var(--fs-12-5)]">
            <div className="mb-1 flex flex-wrap items-center gap-2 text-[length:var(--fs-11)] text-muted-foreground">
              <span>{new Date(latest!.createdAt).toLocaleString('el-GR')}</span>
              {r.usedGuidePdf ? <span className="inline-flex items-center gap-1">· <LuBookOpen className="size-3" aria-hidden /> με τον οδηγό</span> : <span className="badge-pill warn">χωρίς οδηγό PDF — πιο συντηρητικές</span>}
            </div>
            <p className="leading-relaxed">{r.overview}</p>
          </section>
          <div className="grid gap-3 lg:grid-cols-2">
            {r.ideas.map((idea, i) => <IdeaCard key={i} idea={idea} />)}
          </div>
          {r.rejected.length > 0 && (
            <section className="glass rounded-[22px] p-4">
              <div className="mb-2 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Δεν προτείνονται (δεν τεκμηριώνονται)</div>
              <ul className="flex flex-col gap-1.5 text-[length:var(--fs-12)]">
                {r.rejected.map((x, i) => <li key={i} className="flex gap-2"><LuCircleX className="mt-0.5 size-3.5 shrink-0 text-(--danger)" aria-hidden /><span><b>{x.idea}</b> — <span className="text-muted-foreground">{x.reason}</span></span></li>)}
              </ul>
            </section>
          )}
        </>
      )}
      {!loading && !latest && <p className="py-4 text-center text-[length:var(--fs-12-5)] text-muted-foreground">Πάτα «Πρότεινε εφαρμογές» για προτάσεις βάσει του οδηγού.</p>}
    </div>
  )
}

function IdeaCard({ idea }: { idea: ProgramIdea }) {
  const t = confTone(idea.confidence)
  return (
    <article className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 text-[length:var(--fs-12)]">
      <div className="flex items-start gap-2">
        <h3 className="flex-1 text-[length:var(--fs-14)] leading-snug font-bold">{idea.title}</h3>
        <span className={cn('badge-pill shrink-0 tabular-nums', t.cls)} title={t.label}>{idea.confidence}%</span>
      </div>
      <p className="leading-relaxed">{idea.summary}</p>
      <dl className="grid gap-1.5 sm:grid-cols-2">
        <div><dt className="text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">Κατηγορία δαπάνης</dt><dd className="font-semibold">{idea.expenseCategory}</dd></div>
        <div><dt className="text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">Ενδεικτικός π/υ</dt><dd className="font-semibold tabular-nums">{idea.budget.min != null || idea.budget.max != null ? `${idea.budget.min != null ? EUR.format(idea.budget.min) : '…'} – ${idea.budget.max != null ? EUR.format(idea.budget.max) : '…'} €` : '—'}{idea.budget.note ? <span className="block text-[length:var(--fs-11)] font-normal text-muted-foreground">{idea.budget.note}</span> : null}</dd></div>
        <div className="sm:col-span-2"><dt className="text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">Για ποιους</dt><dd>{idea.forWhom}</dd></div>
      </dl>
      <div className="rounded-xl bg-muted/50 p-2.5">
        <div className="mb-0.5 text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">Τεκμηρίωση επιλεξιμότητας</div>
        <p className="leading-relaxed">{idea.eligibilityRationale}</p>
        {idea.guideRefs.length > 0 && <p className="mt-1 text-[length:var(--fs-11)] text-primary italic">Οδηγός: {idea.guideRefs.join(' · ')}</p>}
      </div>
      {idea.components.length > 0 && (
        <div className="flex flex-wrap gap-1">{idea.components.map((c, i) => <span key={i} className="badge-pill muted" style={{ textTransform: 'none' }}>{c}</span>)}</div>
      )}
      {idea.scoringBenefits.length > 0 && <p><b>Ανεβάζει βαθμολογία:</b> {idea.scoringBenefits.join('· ')}</p>}
      {idea.conditions.length > 0 && <p className="text-muted-foreground"><b className="text-foreground">Προϋποθέσεις:</b> {idea.conditions.join('· ')}</p>}
    </article>
  )
}
