'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import {
  LuBuilding2, LuLoaderCircle, LuPlay, LuCheck, LuTriangleAlert, LuHash,
  LuFileCheck2, LuPackagePlus, LuCloudUpload,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { processCompanyInvoice } from '@/lib/invoice-flows/company'
import type { InvoiceDocKind, InvoiceFlowReport } from '@/lib/invoice-flows/prep'
import type { ExtractedDocument } from '@/lib/ocr/schema'

/**
 * UI (W4 T2) του Workflow Α «Εταιρία» (docs/superpowers/specs/2026-07-23-invoice-ocr-w4-design.md
 * §Workflow Α) — κάθεται μετά την επιβεβαίωση ενός OCR-extracted παραστατικού
 * (OcrUploader.onConfirm) σε οποιαδήποτε σελίδα το ενσωματώνει (π.χ. ocr-demo).
 * Preview → «Εκτέλεση» → processCompanyInvoice (server action, company.ts) →
 * report card. Δεν ξαναδιαβάζει/ξαναδιορθώνει τα δεδομένα — αυτό έγινε ήδη στο
 * OcrReviewPanel πριν το confirm.
 */

const DOC_KIND_LABEL: Record<InvoiceDocKind, string> = {
  purchase: 'Αγορά — ο εκδότης είναι ο προμηθευτής μας',
  sale: 'Πώληση — ο παραλήπτης είναι ο πελάτης μας',
}

function fmtMoney(n: number | null): string {
  return n == null ? '—' : `${n.toFixed(2)}€`
}

export interface CompanyInvoicePanelProps {
  extracted: ExtractedDocument
}

export function CompanyInvoicePanel({ extracted }: CompanyInvoicePanelProps) {
  const [docKind, setDocKind] = useState<InvoiceDocKind>('purchase')
  const [enrichAade, setEnrichAade] = useState(true)
  const [running, setRunning] = useState(false)
  const [report, setReport] = useState<InvoiceFlowReport | null>(null)
  const [error, setError] = useState<string | null>(null)

  const party = docKind === 'purchase' ? extracted.issuer : extracted.counterparty
  const afm = party?.afm?.trim() ?? ''
  const afmValid = /^\d{9}$/.test(afm)

  async function handleRun() {
    setRunning(true)
    setError(null)
    try {
      const result = await processCompanyInvoice({ extracted, docKind, enrichAade })
      setReport(result)
      toast.success('Η καταχώριση της εταιρίας ολοκληρώθηκε.')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Η καταχώριση απέτυχε.'
      setError(message)
      toast.error(message)
    } finally {
      setRunning(false)
    }
  }

  return (
    <div className="glass p-5">
      <div className="mb-3.5 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
          <LuBuilding2 className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">Καταχώριση Εταιρίας (ΕΛΠ)</h2>
          <p className="text-[12px] text-muted-foreground">
            Συναλλασσόμενος (Trdr) + γραμμές είδη — προαιρετικό push στο SoftOne αν υπάρχει ενεργή σύνδεση.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-3.5">
        <div className="flex flex-wrap items-center gap-3">
          <Select value={docKind} onValueChange={v => setDocKind(v as InvoiceDocKind)}>
            <SelectTrigger aria-label="Είδος παραστατικού" className="h-9 min-w-[280px] rounded-full border-border bg-card px-3.5 text-[12.5px]">
              <SelectValue>{(v: string) => DOC_KIND_LABEL[v as InvoiceDocKind]}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="purchase">{DOC_KIND_LABEL.purchase}</SelectItem>
              <SelectItem value="sale">{DOC_KIND_LABEL.sale}</SelectItem>
            </SelectContent>
          </Select>

          <label className="flex cursor-pointer items-center gap-2 text-[12.5px] font-semibold">
            <input
              type="checkbox"
              checked={enrichAade}
              onChange={e => setEnrichAade(e.target.checked)}
              disabled={running}
              className="size-3.5"
            />
            Εμπλουτισμός από ΑΑΔΕ
          </label>
        </div>

        <div className="rounded-2xl border border-border p-3.5">
          <span className="mb-2 flex items-center gap-1.5 text-[12.5px] font-bold">
            <LuHash className="size-3.5" aria-hidden /> Αντισυμβαλλόμενος
          </span>
          {party?.name || afm ? (
            <div className="flex flex-col gap-0.5 text-[12.5px]">
              <div><b>Επωνυμία:</b> {party?.name || '—'}</div>
              <div><b>ΑΦΜ:</b> {afm || '—'}</div>
            </div>
          ) : (
            <p className="text-[12.5px] text-muted-foreground">
              Δεν εντοπίστηκε {docKind === 'purchase' ? 'εκδότης' : 'παραλήπτης'} σε αυτό το παραστατικό.
            </p>
          )}
          {!afmValid && (
            <p className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--warning)' }}>
              <LuTriangleAlert className="size-3.5 shrink-0" aria-hidden />
              Χρειάζεται έγκυρο ΑΦΜ (9 ψηφία) — δεν μπορεί να ξεκινήσει η καταχώριση.
            </p>
          )}
        </div>

        <div className="rounded-2xl border border-border p-3.5">
          <span className="mb-2 block text-[12.5px] font-bold">Γραμμές ({extracted.lines.length})</span>
          {extracted.lines.length === 0 ? (
            <p className="text-[12.5px] text-muted-foreground">Δεν υπάρχουν γραμμές.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {extracted.lines.map((line, i) => (
                <li key={i} className="flex items-center justify-between gap-2 text-[12.5px]">
                  <span className="min-w-0 truncate">{line.description || '(χωρίς περιγραφή)'}</span>
                  <span className="shrink-0 tabular-nums text-muted-foreground">{fmtMoney(line.total)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>

        {error && (
          <div className="notice" style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' }} role="alert">
            <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
            <span style={{ color: 'var(--destructive)' }}>{error}</span>
          </div>
        )}

        <div className="flex items-center gap-2.5">
          <Button type="button" onClick={handleRun} disabled={running || !afmValid}>
            {running ? (
              <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Εκτέλεση…</>
            ) : (
              <><LuPlay className="size-3.5" aria-hidden /> Εκτέλεση</>
            )}
          </Button>
        </div>

        {report && (
          <div className="rounded-2xl border border-border p-3.5" style={{ background: 'var(--success-soft)' }}>
            <span className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-bold" style={{ color: 'var(--success)' }}>
              <LuCheck className="size-3.5" aria-hidden /> Ολοκληρώθηκε
            </span>
            <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
              <div className="rounded-xl bg-card/70 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <LuBuilding2 className="size-3" aria-hidden /> Συναλλασσόμενος
                </div>
                <div className="mt-1 text-[13px] font-semibold">
                  {report.trdr.status === 'created' ? 'Δημιουργήθηκε νέος' : 'Βρέθηκε υπάρχων'}
                </div>
              </div>
              <div className="rounded-xl bg-card/70 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <LuPackagePlus className="size-3" aria-hidden /> Γραμμές
                </div>
                <div className="mt-1 text-[13px] font-semibold">
                  {report.lines.matched} υπάρχοντα · {report.lines.created} νέα
                </div>
              </div>
              <div className="rounded-xl bg-card/70 p-2.5">
                <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground uppercase">
                  <LuCloudUpload className="size-3" aria-hidden /> SoftOne
                </div>
                <div className="mt-1 text-[13px] font-semibold">
                  {report.s1.trdrPushed === undefined && report.s1.itemsPushed === 0 && report.s1.failed === 0 ? (
                    'Χωρίς αλλαγές προς S1'
                  ) : (
                    <>
                      {report.s1.itemsPushed > 0 && `${report.s1.itemsPushed} είδη ok`}
                      {report.s1.failed > 0 && (
                        <span style={{ color: 'var(--destructive)' }}>
                          {report.s1.itemsPushed > 0 ? ' · ' : ''}{report.s1.failed} απέτυχαν
                        </span>
                      )}
                    </>
                  )}
                </div>
              </div>
            </div>
            <p className="mt-2.5 flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
              <LuFileCheck2 className="size-3.5 shrink-0" aria-hidden />
              Trdr #{report.trdr.id}
            </p>
          </div>
        )}
      </div>
    </div>
  )
}
