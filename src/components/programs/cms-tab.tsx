'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuSparkles, LuLoaderCircle, LuSave, LuPlus, LuTrash2 } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { getProgramCmsAction, generateProgramCmsAction, saveProgramCmsAction } from '@/lib/programs/actions'
import type { ProgramCms, ProgramCmsFaq } from '@/lib/programs/cms'

/**
 * «CMS» tab προγράμματος — public περιεχόμενο (SEO/GEO/AEO + marketing) που
 * παράγεται αυτόματα από την αποδελτίωση μέσω DeepSeek (και σε κάθε νέο PDF).
 * Επεξεργάσιμο + αποθήκευση. Self-fetching (setState ΜΕΤΑ το await).
 */
const EMPTY: ProgramCms = {
  seoTitle: '', seoDescription: '', keywords: [], heroTag: '', heroTitle: '', heroSubtitle: '',
  cardTitle: '', cardSummary: '', amountDisplay: '', amountNote: '', overview: '',
  audience: [], eligibleExpenses: [], benefits: [], faq: [], deadlineText: '', regionText: '',
}

export function CmsTab({ programId }: { programId: string }) {
  const [cms, setCms] = React.useState<ProgramCms | null>(null)
  const [generatedAt, setGeneratedAt] = React.useState<string | null>(null)
  const [model, setModel] = React.useState<string | null>(null)
  const [loading, setLoading] = React.useState(true)
  const [generating, startGenerating] = React.useTransition()
  const [saving, startSaving] = React.useTransition()

  React.useEffect(() => {
    let cancelled = false
    getProgramCmsAction(programId)
      .then(r => { if (!cancelled) { setCms(r.cms); setGeneratedAt(r.generatedAt); setModel(r.model) } })
      .catch(() => { /* ignore */ })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [programId])

  const d = cms ?? EMPTY
  function patch(p: Partial<ProgramCms>) { setCms({ ...d, ...p }) }

  function handleGenerate() {
    startGenerating(async () => {
      try {
        const res = await generateProgramCmsAction(programId)
        if (!res.ok || !res.cms) throw new Error(res.error)
        setCms(res.cms); setGeneratedAt(new Date().toISOString())
        toast.success('Το περιεχόμενο δημιουργήθηκε από την αποδελτίωση.')
      } catch (err) {
        toast.error(err instanceof Error ? err.message : 'Η δημιουργία απέτυχε.')
      }
    })
  }

  function handleSave() {
    startSaving(async () => {
      try {
        await saveProgramCmsAction(programId, d)
        toast.success('Το περιεχόμενο αποθηκεύτηκε.')
      } catch {
        toast.error('Η αποθήκευση απέτυχε.')
      }
    })
  }

  if (loading) {
    return <section className="glass rounded-[22px] p-4"><div className="flex items-center justify-center gap-2 py-10 text-[0.8125rem] text-muted-foreground"><LuLoaderCircle className="size-4 animate-spin" /> Φόρτωση…</div></section>
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="dotted-leader text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">Περιεχόμενο ιστότοπου (SEO / GEO / AEO)</div>
          <p className="mt-1 text-[0.71875rem] text-muted-foreground">
            {generatedAt ? <>Δημιουργήθηκε {new Date(generatedAt).toLocaleString('el-GR')}{model ? ` · ${model}` : ''}</> : 'Δεν έχει δημιουργηθεί ακόμη — παράγεται αυτόματα σε κάθε αποδελτίωση.'}
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" onClick={handleGenerate} disabled={generating}>
            {generating ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuSparkles className="size-4" />}
            {cms ? 'Ανανέωση με DeepSeek' : 'Δημιουργία με DeepSeek'}
          </Button>
          <Button type="button" onClick={handleSave} disabled={saving || !cms}>
            {saving ? <LuLoaderCircle className="size-4 animate-spin" /> : <LuSave className="size-4" />}
            Αποθήκευση
          </Button>
        </div>
      </div>

      {!cms ? (
        <div className="flex flex-col items-center gap-3 py-10 text-center">
          <LuSparkles className="size-7 text-muted-foreground" />
          <p className="max-w-md text-[0.8125rem] text-muted-foreground">Πάτησε «Δημιουργία με DeepSeek» για να παραχθεί αυτόματα το περιεχόμενο της δημόσιας σελίδας από την αποδελτίωση του προγράμματος.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-5">
          <Group title="SEO">
            <Field label="SEO Title (≤60)"><Input value={d.seoTitle} onChange={e => patch({ seoTitle: e.target.value })} /></Field>
            <Field label="SEO Description (≤160)"><textarea className="cms-textarea" rows={2} value={d.seoDescription} onChange={e => patch({ seoDescription: e.target.value })} /></Field>
            <Field label="Λέξεις-κλειδιά (μία ανά γραμμή)"><textarea className="cms-textarea" rows={3} value={d.keywords.join('\n')} onChange={e => patch({ keywords: splitLines(e.target.value) })} /></Field>
          </Group>

          <Group title="Hero (banner)">
            <Field label="Tag / badge"><Input value={d.heroTag} onChange={e => patch({ heroTag: e.target.value })} /></Field>
            <Field label="Τίτλος hero"><Input value={d.heroTitle} onChange={e => patch({ heroTitle: e.target.value })} /></Field>
            <Field label="Υπότιτλος (lede)"><textarea className="cms-textarea" rows={2} value={d.heroSubtitle} onChange={e => patch({ heroSubtitle: e.target.value })} /></Field>
          </Group>

          <Group title="Κάρτα (λίστα / αρχική)">
            <Field label="Τίτλος κάρτας"><Input value={d.cardTitle} onChange={e => patch({ cardTitle: e.target.value })} /></Field>
            <Field label="Σύντομη περιγραφή"><textarea className="cms-textarea" rows={2} value={d.cardSummary} onChange={e => patch({ cardSummary: e.target.value })} /></Field>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Ποσό (π.χ. «έως €36.000»)"><Input value={d.amountDisplay} onChange={e => patch({ amountDisplay: e.target.value })} /></Field>
              <Field label="Διευκρίνιση ποσού"><Input value={d.amountNote} onChange={e => patch({ amountNote: e.target.value })} /></Field>
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Προθεσμία (κείμενο)"><Input value={d.deadlineText ?? ''} onChange={e => patch({ deadlineText: e.target.value })} /></Field>
              <Field label="Περιοχή (κείμενο)"><Input value={d.regionText ?? ''} onChange={e => patch({ regionText: e.target.value })} /></Field>
            </div>
          </Group>

          <Group title="Παρουσίαση">
            <Field label="Επισκόπηση (παράγραφοι)"><textarea className="cms-textarea" rows={6} value={d.overview} onChange={e => patch({ overview: e.target.value })} /></Field>
            <Field label="Σε ποιους απευθύνεται (μία ανά γραμμή)"><textarea className="cms-textarea" rows={4} value={d.audience.join('\n')} onChange={e => patch({ audience: splitLines(e.target.value) })} /></Field>
            <Field label="Επιλέξιμες δαπάνες (μία ανά γραμμή)"><textarea className="cms-textarea" rows={4} value={d.eligibleExpenses.join('\n')} onChange={e => patch({ eligibleExpenses: splitLines(e.target.value) })} /></Field>
            <Field label="Οφέλη (μία ανά γραμμή)"><textarea className="cms-textarea" rows={4} value={d.benefits.join('\n')} onChange={e => patch({ benefits: splitLines(e.target.value) })} /></Field>
          </Group>

          <Group title="Συχνές ερωτήσεις (FAQ)">
            <RowEditor<ProgramCmsFaq>
              rows={d.faq}
              onChange={rows => patch({ faq: rows })}
              blank={{ q: '', a: '' }}
              render={(row, set) => (
                <>
                  <Input placeholder="Ερώτηση" value={row.q} onChange={e => set({ q: e.target.value })} />
                  <textarea className="cms-textarea" rows={2} placeholder="Απάντηση" value={row.a} onChange={e => set({ a: e.target.value })} />
                </>
              )}
              addLabel="Προσθήκη ερώτησης"
            />
          </Group>
        </div>
      )}
    </section>
  )
}

function splitLines(v: string): string[] {
  return v.split('\n').map(s => s.trim()).filter(Boolean)
}

function Group({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-border bg-card/50 p-3.5">
      <div className="mb-2.5 text-[0.75rem] font-bold text-foreground">{title}</div>
      <div className="flex flex-col gap-3">{children}</div>
    </div>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field !mb-0">
      <span className="mb-1 block text-[0.75rem] font-semibold text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function RowEditor<T>({ rows, onChange, blank, render, addLabel }: {
  rows: T[]
  onChange: (rows: T[]) => void
  blank: T
  render: (row: T, set: (patch: Partial<T>) => void) => React.ReactNode
  addLabel: string
}) {
  return (
    <div className="flex flex-col gap-2.5">
      {rows.map((row, i) => (
        <div key={i} className="flex items-start gap-2 rounded-xl border border-border bg-card p-2.5">
          <div className="flex min-w-0 flex-1 flex-col gap-2">
            {render(row, p => onChange(rows.map((r, j) => (j === i ? { ...r, ...p } : r))))}
          </div>
          <button type="button" aria-label="Αφαίρεση" onClick={() => onChange(rows.filter((_, j) => j !== i))}
            className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-muted-foreground hover:bg-destructive/10 hover:text-destructive">
            <LuTrash2 className="size-4" />
          </button>
        </div>
      ))}
      <Button type="button" variant="outline" size="sm" className="self-start" onClick={() => onChange([...rows, { ...blank }])}>
        <LuPlus className="size-3.5" /> {addLabel}
      </Button>
    </div>
  )
}
