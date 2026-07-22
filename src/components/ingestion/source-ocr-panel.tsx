'use client'

import { useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import { LuCloudUpload, LuX, LuTriangleAlert, LuScanText, LuLoaderCircle, LuCheck } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import {
  isPdfFile, normalizeImageMimeType, imageFileToPage, rasterizePdf, MAX_RASTERIZE_PAGES,
} from '@/lib/ocr/rasterize'
import { pageDataUrl, type StagedPage } from '@/components/ocr/types'
import { acquireFromOcr } from '@/lib/ingestion/actions'
import type { IngestionTarget } from '@/lib/ingestion/target'
import type { OcrCostView } from '@/lib/ingestion/ocr-cost'
import type { StepProps } from './types'
import { OcrCostPanel } from './ocr-cost-panel'

/**
 * Στάδιο OCR του Universal Ingestion Core. ΔΕΝ ξαναχρησιμοποιεί το `OcrUploader`
 * (src/components/ocr/ocr-uploader.tsx) απευθείας — εκείνο τρέχει τη δική του πλήρη
 * ροή (runOcrExtraction → OcrReviewPanel → onConfirm(ExtractedDocument)) φτιαγμένη για
 * ανάγνωση ΕΝΟΣ παραστατικού με editable review, όχι για την γενική ροή του ingestion
 * core (NormalizedBatch πολλαπλών εγγραφών μέσω acquireFromOcr). Ξαναχρησιμοποιεί όμως
 * το ΙΔΙΟ χαμηλού-επιπέδου staging pipeline (isPdfFile/normalizeImageMimeType/
 * imageFileToPage/rasterizePdf/MAX_RASTERIZE_PAGES + StagedPage type) — ίδιο dropzone
 * UX, ίδιο client-side PDF rasterization, απλώς οδηγεί το δικό της «Σάρωση» κουμπί στο
 * acquireFromOcr(target.key, …) του ingestion core.
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const ACCEPTED_LABELS = ['JPG', 'PNG', 'WEBP', 'PDF']

export function SourceOcrPanel({
  target, patch, ocrCost,
}: {
  target: IngestionTarget
  patch: StepProps['patch']
  ocrCost: OcrCostView | null
}) {
  const [pages, setPages] = useState<StagedPage[]>([])
  const [dragging, setDragging] = useState(false)
  const [processingFiles, setProcessingFiles] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordCount, setRecordCount] = useState<number | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextIdRef = useRef(0)
  const pagesRef = useRef<StagedPage[]>([])
  pagesRef.current = pages

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setError(null)
    setProcessingFiles(true)
    let stagedCount = pagesRef.current.length
    try {
      for (const file of files) {
        const remaining = MAX_RASTERIZE_PAGES - stagedCount
        if (remaining <= 0) {
          toast.warning(`Μόνο οι πρώτες ${MAX_RASTERIZE_PAGES} σελίδες στέλνονται για ανάλυση.`)
          break
        }
        if (isPdfFile(file)) {
          try {
            const { pages: rendered, truncated } = await rasterizePdf(file, { maxPages: remaining })
            stagedCount += rendered.length
            setPages(prev => [
              ...prev,
              ...rendered.map((p, i) => ({
                id: `p${nextIdRef.current++}`, base64: p.base64, mimeType: p.mimeType,
                label: rendered.length > 1 ? `${file.name} — σελ. ${i + 1}` : file.name,
              })),
            ])
            if (truncated) toast.warning(`Το "${file.name}" έχει περισσότερες σελίδες — στάλθηκαν μόνο οι πρώτες ${MAX_RASTERIZE_PAGES}.`)
          } catch (err) {
            toast.error(`Δεν ήταν δυνατή η ανάγνωση του "${file.name}" (${err instanceof Error ? err.message : 'άγνωστο σφάλμα'}).`)
          }
        } else if (normalizeImageMimeType(file)) {
          try {
            const page = await imageFileToPage(file)
            stagedCount += 1
            setPages(prev => [...prev, { id: `p${nextIdRef.current++}`, base64: page.base64, mimeType: page.mimeType, label: file.name }])
          } catch {
            toast.error(`Δεν ήταν δυνατή η ανάγνωση του "${file.name}".`)
          }
        } else {
          toast.error(`Μη υποστηριζόμενος τύπος αρχείου: "${file.name}". Δεκτά: JPG, PNG, WebP, PDF.`)
        }
      }
    } finally {
      setProcessingFiles(false)
    }
  }

  function removePage(id: string) {
    setPages(prev => prev.filter(p => p.id !== id))
  }

  function resetPages() {
    setPages([])
    setError(null)
    setRecordCount(null)
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  async function scan() {
    if (pages.length === 0 || busy) return
    setBusy(true)
    setError(null)
    try {
      const { batch, cost } = await acquireFromOcr(target.key, {
        images: pages.map(p => ({ base64: p.base64, mimeType: p.mimeType })),
      })
      setRecordCount(batch.records.length)
      patch({ batch, ocrCost: cost })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Η σάρωση απέτυχε.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {error && (
        <div className="notice" role="alert">
          <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
          <span style={{ color: 'var(--destructive)' }}>{error}</span>
        </div>
      )}

      <div
        role="button"
        tabIndex={0}
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={e => { e.preventDefault(); setDragging(true) }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragging(false) }}
        onDrop={onDrop}
        className="flex cursor-pointer flex-col items-center justify-center gap-2.5 rounded-2xl px-6 py-10 text-center transition-colors"
        style={{
          border: `2px dashed ${dragging ? 'var(--info)' : 'var(--border)'}`,
          background: dragging ? 'var(--info-soft)' : 'var(--muted)',
        }}
      >
        {processingFiles ? (
          <>
            <LuLoaderCircle className="size-8 animate-spin" style={{ color: 'var(--info)' }} aria-hidden />
            <p className="text-[13px] font-medium text-muted-foreground">Επεξεργασία αρχείων…</p>
          </>
        ) : (
          <>
            <span className="flex size-14 items-center justify-center rounded-2xl" style={{ background: dragging ? 'var(--info)' : 'var(--border)' }}>
              <LuCloudUpload className="size-6" style={{ color: dragging ? '#fff' : 'var(--muted-foreground)' }} aria-hidden />
            </span>
            <div>
              <p className="text-[14px] font-semibold">{dragging ? 'Άφησέ το εδώ' : 'Σύρε φωτογραφίες ή PDF εδώ'}</p>
              <p className="mt-1 text-[12px] text-muted-foreground">
                ή <span className="font-semibold" style={{ color: 'var(--info)' }}>κάνε κλικ για επιλογή</span>
              </p>
            </div>
            <div className="flex gap-1.5">
              {ACCEPTED_LABELS.map(ext => (
                <span key={ext} className="rounded bg-border px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">{ext}</span>
              ))}
            </div>
          </>
        )}
        <input
          ref={inputRef}
          type="file"
          multiple
          accept={ACCEPT}
          className="hidden"
          onChange={e => { if (e.target.files) handleFiles(e.target.files); e.target.value = '' }}
        />
      </div>

      {pages.length > 0 && (
        <div className="flex flex-wrap items-center gap-2.5">
          {pages.map(p => (
            <div key={p.id} className="group relative size-20 shrink-0 overflow-hidden rounded-xl border border-border bg-muted">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={pageDataUrl(p)} alt={p.label} className="size-full object-cover" />
              <button
                type="button"
                onClick={() => removePage(p.id)}
                className="absolute top-1 right-1 flex size-5 items-center justify-center rounded-full bg-black/60 text-white opacity-0 transition-opacity group-hover:opacity-100"
                aria-label={`Αφαίρεση ${p.label}`}
              >
                <LuX className="size-3" aria-hidden />
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={resetPages}
            className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[10.5px] font-medium text-muted-foreground transition-colors hover:border-(--destructive) hover:text-(--destructive)"
          >
            <LuX className="size-4" aria-hidden />
            Καθαρισμός
          </button>
        </div>
      )}

      <Button type="button" className="btn-pill btn-navy self-end" disabled={pages.length === 0 || processingFiles || busy} onClick={scan}>
        {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuScanText className="size-3.5" aria-hidden />}
        {busy ? 'Σάρωση…' : 'Σάρωση'}
      </Button>

      {recordCount != null && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: 'var(--success)' }}>
          <LuCheck className="size-3.5" aria-hidden /> {recordCount} εγγραφές έτοιμες
        </p>
      )}

      <OcrCostPanel cost={ocrCost} />
    </div>
  )
}
