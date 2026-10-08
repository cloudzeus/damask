'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Check, X, Pencil, Trash2, Plus, Sparkles, ThumbsUp, ThumbsDown, Loader2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'
import { setLessonStatus, updateLesson, deleteLesson, addManualLesson, distillNow } from './thanos-actions'

export type LessonItem = { id: string; question: string; answer: string; status: string; source: string; uses: number; program: string | null; createdAt: string }
export type TurnItem = { id: string; user: string; mode: string; question: string; reply: string; rating: number | null; note: string | null; cached: boolean; createdAt: string }
type Stats = { total: number; week: number; up: number; down: number; pending: number; active: number; suggested: number }

const SOURCE: Record<string, string> = { FEEDBACK: '👍 χρήστη', DISTILLED: 'από συζητήσεις', MANUAL: 'χειροκίνητο', CORRECTION: 'διόρθωση' }
const STATUS: Record<string, { label: string; cls: string }> = {
  ACTIVE: { label: 'Ενεργό', cls: 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' },
  SUGGESTED: { label: 'Προς έγκριση', cls: 'bg-amber-500/15 text-amber-800 dark:text-amber-300' },
  REJECTED: { label: 'Απορρίφθηκε', cls: 'bg-muted text-muted-foreground' },
}
const date = (iso: string) => new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })

/**
 * Πώς μαθαίνει ο Thanos: κάθε συζήτηση καταγράφεται· τα 👍 και η νυχτερινή απόσταξη (04:30) γίνονται «μαθήματα»
 * που ανακτώνται σε κάθε νέα ερώτηση. Εδώ τα εγκρίνεις/διορθώνεις ή προσθέτεις δικά σου.
 */
export function ThanosKnowledge({ lessons, turns, stats }: { lessons: LessonItem[]; turns: TurnItem[]; stats: Stats }) {
  const [view, setView] = useState<'lessons' | 'turns'>('lessons')
  const [filter, setFilter] = useState<'SUGGESTED' | 'ACTIVE' | 'REJECTED' | 'all'>(stats.suggested ? 'SUGGESTED' : 'ACTIVE')
  const [adding, setAdding] = useState(false)
  const [pending, start] = useTransition()
  const shown = lessons.filter(l => filter === 'all' || l.status === filter)

  const run = (fn: () => Promise<{ ok: boolean; message: string }>) => start(async () => {
    const r = await fn()
    if (r.ok) toast.success(r.message); else toast.error(r.message)
  })

  return (
    <div className="space-y-3.5">
      <div className="glass p-4">
        <div className="mb-3 flex flex-wrap items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[length:var(--fs-16)] font-semibold">Τι έχει μάθει ο Thanos</h2>
            <p className="text-[length:var(--fs-13)] text-muted-foreground">
              Κάθε συζήτηση καταγράφεται. Τα 👍 των συμβούλων γίνονται αμέσως γνώση· κάθε βράδυ (04:30) ο Thanos «αποστάζει» τις νέες συζητήσεις σε μαθήματα — χωρίς προσωπικά δεδομένα. Όσα στηρίζονται στον οδηγό ενεργοποιούνται αυτόματα, τα υπόλοιπα περιμένουν έγκριση εδώ.
            </p>
          </div>
          <Button type="button" variant="outline" disabled={pending} onClick={() => run(distillNow)}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}Μάθε τώρα ({stats.pending})
          </Button>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {[
            ['Συζητήσεις', `${stats.total}`, `${stats.week} την τελευταία εβδομάδα`],
            ['Αξιολογήσεις', `${stats.up} 👍 · ${stats.down} 👎`, 'από τους χρήστες'],
            ['Ενεργά μαθήματα', `${stats.active}`, 'χρησιμοποιούνται στις απαντήσεις'],
            ['Προς έγκριση', `${stats.suggested}`, 'περιμένουν έλεγχο'],
          ].map(([k, v, h]) => (
            <div key={k} className="rounded-xl border border-border bg-card px-3 py-2">
              <dt className="text-[length:var(--fs-12)] text-muted-foreground">{k}</dt>
              <dd className="text-[length:var(--fs-18)] font-semibold tabular-nums">{v}</dd>
              <dd className="text-[length:var(--fs-11-5)] text-muted-foreground">{h}</dd>
            </div>
          ))}
        </dl>
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" className={cn('pill', view === 'lessons' && 'on')} onClick={() => setView('lessons')}>Μαθήματα</button>
        <button type="button" className={cn('pill', view === 'turns' && 'on')} onClick={() => setView('turns')}>Πρόσφατες συζητήσεις</button>
        <div className="flex-1" />
        {view === 'lessons' && (
          <>
            {(['SUGGESTED', 'ACTIVE', 'REJECTED', 'all'] as const).map(f => (
              <button key={f} type="button" onClick={() => setFilter(f)}
                className={cn('rounded-full px-3 py-1 text-[length:var(--fs-12-5)]', filter === f ? 'bg-primary text-primary-foreground' : 'hover:bg-muted')}>
                {f === 'all' ? 'Όλα' : STATUS[f].label}
              </button>
            ))}
            <Button type="button" size="sm" onClick={() => setAdding(a => !a)}><Plus className="size-3.5" />Νέο μάθημα</Button>
          </>
        )}
      </div>

      {view === 'lessons' && adding && <LessonEditor onCancel={() => setAdding(false)} onSave={(q, a) => run(async () => { const r = await addManualLesson({ question: q, answer: a }); if (r.ok) setAdding(false); return r })} />}

      {view === 'lessons' && (
        <ul className="space-y-2">
          {shown.length === 0 && <li className="glass p-4 text-[length:var(--fs-13)] text-muted-foreground">Δεν υπάρχουν μαθήματα σε αυτή την κατηγορία ακόμα — μαζεύονται όσο χρησιμοποιείται ο Thanos.</li>}
          {shown.map(l => <LessonRow key={l.id} l={l} busy={pending} run={run} />)}
        </ul>
      )}

      {view === 'turns' && (
        <ul className="space-y-2">
          {turns.length === 0 && <li className="glass p-4 text-[length:var(--fs-13)] text-muted-foreground">Καμία συζήτηση ακόμα.</li>}
          {turns.map(t => (
            <li key={t.id} className="glass p-3">
              <div className="mb-1 flex flex-wrap items-center gap-2 text-[length:var(--fs-12)] text-muted-foreground">
                <span className="font-medium text-foreground">{t.user}</span>
                <span>{t.mode === 'CUSTOMER' ? 'πελάτης' : 'σύμβουλος'}</span>
                <span>{date(t.createdAt)}</span>
                {t.cached && <span className="rounded-full bg-muted px-2">από cache</span>}
                {t.rating === 1 && <ThumbsUp className="size-3.5 text-emerald-600" aria-label="👍" />}
                {t.rating === -1 && <ThumbsDown className="size-3.5 text-destructive" aria-label="👎" />}
              </div>
              <p className="text-[length:var(--fs-13-5)] font-semibold">{t.question}</p>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-[length:var(--fs-13)] text-muted-foreground">{t.reply}</p>
              {t.note && <p className="mt-1 rounded-lg bg-amber-500/10 px-2 py-1 text-[length:var(--fs-12-5)]">Διόρθωση χρήστη: {t.note}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}

function LessonRow({ l, busy, run }: { l: LessonItem; busy: boolean; run: (fn: () => Promise<{ ok: boolean; message: string }>) => void }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <li><LessonEditor initial={l} onCancel={() => setEditing(false)} onSave={(q, a) => { run(() => updateLesson(l.id, { question: q, answer: a })); setEditing(false) }} /></li>
  return (
    <li className="glass p-3">
      <div className="mb-1 flex flex-wrap items-center gap-2 text-[length:var(--fs-11-5)]">
        <span className={cn('rounded-full px-2 py-0.5', STATUS[l.status]?.cls)}>{STATUS[l.status]?.label ?? l.status}</span>
        <span className="text-muted-foreground">{SOURCE[l.source] ?? l.source}</span>
        {l.program && <span className="rounded-full bg-muted px-2 py-0.5">{l.program}</span>}
        <span className="text-muted-foreground">χρησιμοποιήθηκε {l.uses}×</span>
      </div>
      <p className="text-[length:var(--fs-14)] font-semibold">{l.question}</p>
      <p className="mt-1 whitespace-pre-wrap text-[length:var(--fs-13-5)]">{l.answer}</p>
      <div className="mt-2 flex flex-wrap gap-1.5">
        {l.status !== 'ACTIVE' && <Button type="button" size="sm" disabled={busy} onClick={() => run(() => setLessonStatus(l.id, 'ACTIVE'))}><Check className="size-3.5" />Έγκριση</Button>}
        {l.status !== 'REJECTED' && <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => run(() => setLessonStatus(l.id, 'REJECTED'))}><X className="size-3.5" />Απόρριψη</Button>}
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => setEditing(true)}><Pencil className="size-3.5" />Διόρθωση</Button>
        <Button type="button" size="sm" variant="ghost" disabled={busy} onClick={() => { if (confirm('Οριστική διαγραφή μαθήματος;')) run(() => deleteLesson(l.id)) }}><Trash2 className="size-3.5" />Διαγραφή</Button>
      </div>
    </li>
  )
}

function LessonEditor({ initial, onSave, onCancel }: { initial?: { question: string; answer: string }; onSave: (q: string, a: string) => void; onCancel: () => void }) {
  const [q, setQ] = useState(initial?.question ?? '')
  const [a, setA] = useState(initial?.answer ?? '')
  return (
    <div className="glass space-y-2 p-3">
      <label className="block">
        <span className="mb-1 block text-[length:var(--fs-12-5)] text-muted-foreground">Ερώτηση (γενική διατύπωση)</span>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="π.χ. Από πού βγαίνει η Ετήσια Μονάδα Εργασίας (ΕΜΕ);"
          className="h-10 w-full rounded-lg border border-input bg-card px-3 text-[length:var(--fs-13-5)] outline-none focus:border-primary" />
      </label>
      <label className="block">
        <span className="mb-1 block text-[length:var(--fs-12-5)] text-muted-foreground">Σωστή απάντηση — όπως θα την έλεγε ο Thanos</span>
        <textarea value={a} onChange={e => setA(e.target.value)} rows={4}
          className="w-full rounded-lg border border-input bg-card px-3 py-2 text-[length:var(--fs-13-5)] outline-none focus:border-primary" />
      </label>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>Άκυρο</Button>
        <Button type="button" onClick={() => onSave(q, a)} disabled={q.trim().length < 8 || a.trim().length < 15}>Αποθήκευση</Button>
      </div>
    </div>
  )
}
