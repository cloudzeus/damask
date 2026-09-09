'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuSend, LuCheck, LuX, LuLoaderCircle, LuTriangleAlert, LuCircleCheck, LuPencilLine } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  getProposalSubmissions, submitProposal, decideProposal,
  type ProposalSubmissionView, type ProposalSubmissionStatusStr,
} from '@/lib/pm/actions'

const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
const STATUS_META: Record<ProposalSubmissionStatusStr, { label: string; cls: string }> = {
  DRAFT: { label: 'Πρόχειρο', cls: 'muted' },
  SUBMITTED: { label: 'Υποβλήθηκε — αναμονή έγκρισης', cls: 'warn' },
  APPROVED: { label: 'Εγκρίθηκε', cls: 'ok' },
  REJECTED: { label: 'Απορρίφθηκε', cls: 'warn' },
}
function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString('el-GR') : '—'
}

/**
 * Β1 — «Υποβολή πρότασης»: readiness gate + state machine versioned
 * ProposalSubmission (Υποβολή → Έγκριση/Απόρριψη → Τροποποίηση→επανυποβολή).
 * Self-fetching (mirror BudgetProposalPanel). Κάθεται πάνω από τα στοιχεία ΟΠΣΚΕ.
 */
export function SubmissionPanel({ applicationId, canManage }: { applicationId: string; canManage?: boolean }) {
  const readOnly = canManage === false
  const [data, setData] = React.useState<ProposalSubmissionView | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [busy, setBusy] = React.useState(false)
  const [opskeRef, setOpskeRef] = React.useState('')
  const [note, setNote] = React.useState('')

  const load = React.useCallback(() => {
    getProposalSubmissions(applicationId).then(d => setData(d)).catch(() => toast.error('Αποτυχία φόρτωσης.')).finally(() => setLoading(false))
  }, [applicationId])
  React.useEffect(() => { load() }, [load])

  async function submit() {
    setBusy(true)
    try {
      const r = await submitProposal(applicationId, { opskeRef: opskeRef.trim() || null, note: note.trim() || null })
      toast.success(`Η πρόταση υποβλήθηκε (έκδοση ${r.version}).`)
      setNote(''); load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Η υποβολή απέτυχε.') } finally { setBusy(false) }
  }
  async function decide(approve: boolean) {
    if (!data?.current) return
    if (!approve && !note.trim()) { toast.error('Γράψε λόγο απόρριψης.'); return }
    setBusy(true)
    try {
      await decideProposal(data.current.id, approve, approve ? undefined : note.trim())
      toast.success(approve ? 'Η πρόταση εγκρίθηκε.' : 'Η πρόταση απορρίφθηκε.')
      setNote(''); load()
    } catch (e) { toast.error(e instanceof Error ? e.message : 'Η ενέργεια απέτυχε.') } finally { setBusy(false) }
  }

  if (loading) return <div className="glass flex items-center justify-center gap-2 rounded-[22px] p-8 text-[0.78125rem] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…</div>
  if (!data) return null

  const { current, history, readiness, canSubmit, canModify } = data
  const pending = current?.status === 'SUBMITTED'
  const sm = current ? STATUS_META[current.status] : null

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Υποβολή πρότασης</div>
        {current && sm && (
          <span className={`badge-pill ${sm.cls}`}>έκδοση {current.version} · {sm.label}</span>
        )}
      </div>

      {/* Readiness */}
      {readiness.ready ? (
        <div className="mb-3 flex items-center gap-2 rounded-xl border border-[color:var(--success)]/30 bg-[color:var(--success)]/5 px-3 py-2 text-[0.75rem]">
          <LuCircleCheck className="size-4 shrink-0 text-[color:var(--success)]" aria-hidden />
          <span>Το σχέδιο δαπανών και τα δικαιολογητικά είναι έτοιμα για υποβολή{readiness.totalPlanned > 0 ? ` — σύνολο ${EUR.format(readiness.totalPlanned)} €` : ''}.</span>
        </div>
      ) : (
        <div className="mb-3 rounded-xl border border-[color:var(--coral)]/30 bg-[color:var(--coral)]/5 px-3 py-2">
          <div className="flex items-center gap-2 text-[0.75rem] font-semibold text-[color:var(--coral)]"><LuTriangleAlert className="size-4 shrink-0" aria-hidden /> Δεν είναι έτοιμη η υποβολή</div>
          <ul className="mt-1 list-disc pl-6 text-[0.71875rem] text-muted-foreground">
            {readiness.blockers.map((b, i) => <li key={i}>{b}</li>)}
          </ul>
        </div>
      )}
      {readiness.warnings.length > 0 && (
        <ul className="mb-3 list-disc pl-6 text-[0.6875rem] text-[color:var(--warning)]">
          {readiness.warnings.map((w, i) => <li key={i}>{w}</li>)}
        </ul>
      )}

      {/* Ενέργειες */}
      {!readOnly && (
        <div className="rounded-xl border border-border bg-card/50 p-3">
          {pending ? (
            // Απόφαση σε εκκρεμή υποβολή
            <div className="flex flex-col gap-2">
              <div className="text-[0.75rem] text-muted-foreground">Η έκδοση {current!.version} περιμένει απόφαση.</div>
              <Input value={note} onChange={e => setNote(e.target.value)} placeholder="Λόγος απόρριψης (αν απορρίπτεται)" autoComplete="off" />
              <div className="flex flex-wrap gap-2">
                <Button type="button" onClick={() => decide(true)} disabled={busy}><LuCheck className="size-3.5" aria-hidden /> Έγκριση</Button>
                <Button type="button" variant="outline" onClick={() => decide(false)} disabled={busy}><LuX className="size-3.5" aria-hidden /> Απόρριψη</Button>
              </div>
            </div>
          ) : canSubmit ? (
            // Υποβολή ή επανυποβολή (τροποποίηση)
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                <Input value={opskeRef} onChange={e => setOpskeRef(e.target.value)} placeholder="Αρ. ΟΠΣΚΕ (προαιρετικό)" autoComplete="off" />
                <Input value={note} onChange={e => setNote(e.target.value)} placeholder={canModify ? 'Αιτιολόγηση τροποποίησης' : 'Σημείωση (προαιρετικό)'} autoComplete="off" />
              </div>
              <div>
                <Button type="button" onClick={submit} disabled={busy}>
                  {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : canModify ? <LuPencilLine className="size-3.5" aria-hidden /> : <LuSend className="size-3.5" aria-hidden />}
                  {canModify ? 'Τροποποίηση → νέα υποβολή' : 'Υποβολή πρότασης'}
                </Button>
              </div>
            </div>
          ) : (
            <div className="text-[0.75rem] text-muted-foreground">Διόρθωσε τα εμπόδια παραπάνω για να υποβάλεις την πρόταση.</div>
          )}
        </div>
      )}

      {/* Ιστορικό εκδόσεων */}
      {history.length > 0 && (
        <div className="mt-3">
          <div className="mb-1 text-[0.65625rem] font-semibold uppercase tracking-wide text-muted-foreground">Ιστορικό υποβολών</div>
          <ul className="flex flex-col gap-1">
            {history.map(h => {
              const m = STATUS_META[h.status]
              return (
                <li key={h.id} className="flex flex-wrap items-center gap-2 rounded-lg bg-card/60 px-2.5 py-1.5 text-[0.71875rem]">
                  <span className="font-semibold">v{h.version}</span>
                  <span className={`badge-pill ${m.cls} shrink-0`}>{m.label}</span>
                  {h.opskeRef && <span className="text-muted-foreground">ΟΠΣΚΕ {h.opskeRef}</span>}
                  {h.totalAmount != null && <span className="tabular-nums text-muted-foreground">{EUR.format(h.totalAmount)} €</span>}
                  <span className="ml-auto text-muted-foreground">υποβ. {fmtDate(h.submittedAt)}{h.decidedAt ? ` · απόφ. ${fmtDate(h.decidedAt)}` : ''}</span>
                  {h.note && <span className="w-full text-[0.6875rem] text-muted-foreground">— {h.note}</span>}
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </section>
  )
}
