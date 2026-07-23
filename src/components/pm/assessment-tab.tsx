'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuCalculator, LuClipboardList, LuSparkles, LuLoaderCircle } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  listCriterionScores, saveCriterionScore, recomputeAssessment, setAssessmentVerdict, generateObligations, getApplication,
  type CriterionScoreItem,
} from '@/lib/pm/actions'
import { verdictLabel, type VerdictStr } from '@/lib/pm/types'

const VERDICTS: VerdictStr[] = ['PENDING', 'ELIGIBLE', 'INELIGIBLE']

/**
 * «Αξιολόγηση» tab (Task 11) — λίστα κριτηρίων της αίτησης (γεννημένη από
 * τα κριτήρια του Προγράμματος μέσω generateObligations), βαθμολόγηση ανά
 * κριτήριο, υπολογισμός τελικού ποσοστού, και κατάσταση ένταξης (verdict).
 * Self-fetching client component, mirror του idiom στο required-forms-tab.tsx.
 */
export function AssessmentTab({ applicationId, canManage }: { applicationId: string; canManage: boolean }) {
  const router = useRouter()
  const [scores, setScores] = React.useState<CriterionScoreItem[]>([])
  const [verdict, setVerdict] = React.useState<VerdictStr>('PENDING')
  const [pct, setPct] = React.useState<number | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [generating, setGenerating] = React.useState(false)
  const [computing, setComputing] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listCriterionScores(applicationId), getApplication(applicationId)])
      .then(([s, app]) => {
        setScores(s)
        setVerdict(app.assessmentVerdict)
        setPct(
          app.assessmentScore != null && app.assessmentMaxScore
            ? Math.round((app.assessmentScore / app.assessmentMaxScore) * 100)
            : null,
        )
      })
      .catch(() => setError('Η φόρτωση της αξιολόγησης απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  React.useEffect(() => { load() }, [load])

  function patchLocal(id: string, patch: Partial<CriterionScoreItem>) {
    setScores(prev => prev.map(s => (s.id === id ? { ...s, ...patch } : s)))
  }

  async function persist(id: string, patch: { score?: number | null; note?: string | null }) {
    try {
      await saveCriterionScore(id, patch)
      router.refresh()
    } catch {
      toast.error('Η αποθήκευση απέτυχε.')
      load()
    }
  }

  function handleScoreBlur(row: CriterionScoreItem, value: string) {
    const trimmed = value.trim()
    if (!trimmed) {
      if (row.score == null) return
      patchLocal(row.id, { score: null })
      void persist(row.id, { score: null })
      return
    }
    const parsed = Number(trimmed)
    if (Number.isNaN(parsed)) {
      toast.error('Ο βαθμός πρέπει να είναι αριθμός.')
      patchLocal(row.id, { score: row.score })
      return
    }
    const clamped = Math.min(row.maxScore, Math.max(0, parsed))
    if (clamped === row.score) return
    patchLocal(row.id, { score: clamped })
    void persist(row.id, { score: clamped })
  }

  function handleNoteBlur(row: CriterionScoreItem, value: string) {
    const next = value.trim() ? value.trim() : null
    if (next === row.note) return
    patchLocal(row.id, { note: next })
    void persist(row.id, { note: next })
  }

  async function handleGenerate() {
    setGenerating(true)
    try {
      const { addedScores } = await generateObligations(applicationId)
      toast.success(`Προστέθηκαν ${addedScores} κριτήρια.`)
      router.refresh()
      load()
    } catch {
      toast.error('Η δημιουργία απέτυχε.')
    } finally {
      setGenerating(false)
    }
  }

  async function handleRecompute() {
    setComputing(true)
    try {
      const { pct: newPct } = await recomputeAssessment(applicationId)
      setPct(newPct)
      toast.success(`Βαθμολογία: ${newPct}%`)
      router.refresh()
    } catch {
      toast.error('Ο υπολογισμός βαθμολογίας απέτυχε.')
    } finally {
      setComputing(false)
    }
  }

  function handleVerdictChange(next: VerdictStr) {
    const prev = verdict
    setVerdict(next)
    setAssessmentVerdict(applicationId, next)
      .then(() => {
        toast.success('Η κατάσταση ένταξης ενημερώθηκε.')
        router.refresh()
      })
      .catch(() => {
        toast.error('Η ενημέρωση απέτυχε.')
        setVerdict(prev)
      })
  }

  if (loading) {
    return (
      <section className="glass rounded-[22px] p-4">
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      </section>
    )
  }

  if (error) {
    return (
      <section className="glass rounded-[22px] p-4">
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      </section>
    )
  }

  if (scores.length === 0) {
    return (
      <section className="glass rounded-[22px] p-4">
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuClipboardList className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">Δεν υπάρχουν κριτήρια αξιολόγησης.</p>
          {canManage && (
            <Button type="button" onClick={handleGenerate} disabled={generating}>
              {generating ? 'Δημιουργία…' : (<><LuSparkles className="size-3.5" aria-hidden /> Δημιουργία από κριτήρια προγράμματος</>)}
            </Button>
          )}
        </div>
      </section>
    )
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Κριτήρια αξιολόγησης ({scores.length})
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Κριτήριο</th>
              <th className="ctr">Βάρος</th>
              <th className="ctr">Βαθμός</th>
              <th>Σημείωση</th>
            </tr>
          </thead>
          <tbody>
            {scores.map(row => (
              <tr key={row.id} className="dotted-row-bottom">
                <td style={{ minWidth: 200 }}>
                  <span className="text-[13px] font-semibold">{row.name}</span>
                </td>
                <td className="ctr text-[12.5px] text-muted-foreground">{row.weight}</td>
                <td className="ctr">
                  <div className="inline-flex items-center gap-1">
                    <input
                      type="number"
                      min={0}
                      max={row.maxScore}
                      defaultValue={row.score ?? ''}
                      onBlur={e => handleScoreBlur(row, e.target.value)}
                      className="w-16 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-center text-[13px] font-semibold outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:ring-2 focus-visible:ring-ring/30"
                    />
                    <span className="text-[11px] text-muted-foreground">/ {row.maxScore}</span>
                  </div>
                </td>
                <td style={{ minWidth: 180 }}>
                  <input
                    defaultValue={row.note ?? ''}
                    placeholder="—"
                    onBlur={e => handleNoteBlur(row, e.target.value)}
                    className="w-full min-w-0 rounded-md border border-transparent bg-transparent px-1.5 py-1 text-[12.5px] text-muted-foreground outline-none transition-colors hover:border-border focus-visible:border-ring focus-visible:bg-card focus-visible:text-foreground focus-visible:ring-2 focus-visible:ring-ring/30"
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2.5 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
        <div className="flex flex-wrap items-center gap-2.5">
          <span className="text-[11.5px] font-semibold text-muted-foreground">Κατάσταση ένταξης</span>
          <Select value={verdict} onValueChange={v => handleVerdictChange(v as VerdictStr)}>
            <SelectTrigger className="h-8 w-44 rounded-full border-border bg-card px-3 text-[12.5px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {VERDICTS.map(v => (
                <SelectItem key={v} value={v}>{verdictLabel(v)}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          {pct != null && <span className="badge-pill info">Βαθμολογία {pct}%</span>}
        </div>
        <Button type="button" variant="outline" onClick={handleRecompute} disabled={computing}>
          {computing ? 'Υπολογισμός…' : (<><LuCalculator className="size-3.5" aria-hidden /> Υπολογισμός βαθμολογίας</>)}
        </Button>
      </div>
    </section>
  )
}
