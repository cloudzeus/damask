'use client'

import { useEffect, useRef, useState, type DragEvent } from 'react'
import { toast } from 'sonner'
import {
  LuCloudUpload, LuX, LuTriangleAlert, LuScanText, LuLoaderCircle,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  isPdfFile, normalizeImageMimeType, imageFileToPage, rasterizePdf, MAX_RASTERIZE_PAGES,
} from '@/lib/ocr/rasterize'
import { runOcrExtraction } from '@/lib/ocr/actions'
import { OCR_DOC_TYPE_HINTS, type ExtractedDocument, type OcrDocTypeHint } from '@/lib/ocr/schema'
import { OcrReviewPanel } from './ocr-review-panel'
import { pageDataUrl, type StagedPage } from './types'

/**
 * Επαναχρησιμοποιήσιμο component ανάγνωσης παραστατικών (τιμολόγια/αποδείξεις/
 * δελτία αποστολής) από φωτογραφίες ή PDF: dropzone → client-side rasterize (PDF)
 * → server action (Gemini vision) → review panel επεξεργάσιμων πεδίων → onConfirm.
 * Καλεί απευθείας το src/lib/ocr/actions.ts (runOcrExtraction) — δεν χρειάζεται
 * `action` prop, μπορεί να μπει σε οποιαδήποτε σελίδα (π.χ. αργότερα στα findocs).
 */

const ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf'
const ACCEPTED_LABELS = ['JPG', 'PNG', 'WEBP', 'PDF']

const DOC_TYPE_HINT_LABEL: Record<OcrDocTypeHint, string> = {
  auto: 'Αυτόματη αναγνώριση',
  invoice: 'Τιμολόγιο',
  receipt: 'Απόδειξη',
  packing_list: 'Δελτίο αποστολής',
}

const PROCESSING_STEPS = [
  'Προετοιμασία εικόνων…',
  'Αποστολή στο Gemini…',
  'Ανάλυση εγγράφου…',
  'Έλεγχος συνόλων & ΦΠΑ…',
]

type Phase = 'upload' | 'processing' | 'review'

export interface OcrUploaderProps {
  /** Καλείται με τα (πιθανώς διορθωμένα από τον χρήστη) τελικά δεδομένα όταν πατηθεί «Επιβεβαίωση». */
  onConfirm: (data: ExtractedDocument) => void
  /** Προεπιλεγμένη υπόδειξη τύπου εγγράφου — ο χρήστης μπορεί να την αλλάξει πριν την ανάγνωση. */
  docTypeHint?: OcrDocTypeHint
  title?: string
}

export function OcrUploader({ onConfirm, docTypeHint, title = 'Ανάγνωση εγγράφου' }: OcrUploaderProps) {
  const [phase, setPhase] = useState<Phase>('upload')
  const [pages, setPages] = useState<StagedPage[]>([])
  const [digitalText, setDigitalText] = useState<string | null>(null)
  const [docType, setDocType] = useState<OcrDocTypeHint>(docTypeHint ?? 'auto')
  const [processingFiles, setProcessingFiles] = useState(false)
  const [dragging, setDragging] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [stepIndex, setStepIndex] = useState(0)
  const [result, setResult] = useState<{ data: ExtractedDocument; model: string; usedFallback: boolean } | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const nextIdRef = useRef(0)
  const pagesRef = useRef<StagedPage[]>([])
  useEffect(() => { pagesRef.current = pages }, [pages])

  // Κυκλική εναλλαγή βημάτων προόδου ενώ περιμένουμε την απάντηση AI (§5 MASTER: spinner ΜΕ βήματα + εκτίμηση χρόνου,
  // ποτέ γυμνό spinner). Το stepIndex μηδενίζεται στο runExtraction() (event handler, όχι εδώ) πριν το setPhase('processing') —
  // το effect μόνο ΣΤΗΝΕΙ το interval, δεν κάνει synchronous setState στο σώμα του.
  useEffect(() => {
    if (phase !== 'processing') return
    const id = setInterval(() => setStepIndex(i => Math.min(i + 1, PROCESSING_STEPS.length - 1)), 1400)
    return () => clearInterval(id)
  }, [phase])

  async function handleFiles(fileList: FileList | File[]) {
    const files = Array.from(fileList)
    if (files.length === 0) return
    setError(null)
    setProcessingFiles(true)
    // Τοπικός μετρητής (όχι το `pages` state — μένει stale μέσα στο ίδιο batch) ώστε
    // πολλαπλά αρχεία στο ίδιο drop να σέβονται μαζί το καθολικό όριο σελίδων.
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
            const { pages: rendered, text, truncated } = await rasterizePdf(file, { maxPages: remaining })
            stagedCount += rendered.length
            setPages(prev => [
              ...prev,
              ...rendered.map((p, i) => ({
                id: `p${nextIdRef.current++}`, base64: p.base64, mimeType: p.mimeType,
                label: rendered.length > 1 ? `${file.name} — σελ. ${i + 1}` : file.name,
              })),
            ])
            if (text) setDigitalText(prev => (prev ? `${prev}\n\n${text}` : text))
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

  function resetAll() {
    setPages([])
    setDigitalText(null)
    setError(null)
  }

  async function runExtraction() {
    setStepIndex(0)
    setPhase('processing')
    setError(null)
    try {
      const res = await runOcrExtraction({
        images: pages.map(p => ({ base64: p.base64, mimeType: p.mimeType })),
        text: digitalText ?? undefined,
        docType,
      })
      if (!res.ok) {
        setError(res.message)
        setPhase('upload')
        toast.error(res.message)
        return
      }
      setResult({ data: res.data, model: res.model, usedFallback: res.usedFallback })
      setPhase('review')
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Η ανάγνωση του εγγράφου απέτυχε.'
      setError(message)
      setPhase('upload')
      toast.error(message)
    }
  }

  function handleRetry() {
    setResult(null)
    setError(null)
    setPhase('upload')
  }

  function handleConfirm(data: ExtractedDocument) {
    onConfirm(data)
    resetAll()
    setResult(null)
    setPhase('upload')
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setDragging(false)
    if (e.dataTransfer.files?.length) handleFiles(e.dataTransfer.files)
  }

  return (
    <div className="glass p-5">
      <div className="mb-4 flex items-center gap-2.5">
        <span className="flex size-9 shrink-0 items-center justify-center rounded-[12px]" style={{ background: 'var(--info-soft)', color: 'var(--info)' }}>
          <LuScanText className="size-4" aria-hidden />
        </span>
        <div className="min-w-0">
          <h2 className="text-[15px] font-bold">{title}</h2>
          <p className="text-[12px] text-muted-foreground">Φωτογραφία ή PDF τιμολογίου, απόδειξης ή δελτίου αποστολής.</p>
        </div>
      </div>

      {error && phase === 'upload' && (
        <div
          className="notice mb-4"
          style={{ background: 'color-mix(in srgb, var(--destructive) 10%, transparent)', borderColor: 'color-mix(in srgb, var(--destructive) 35%, transparent)' }}
          role="alert"
        >
          <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
          <span style={{ color: 'var(--destructive)' }}>{error}</span>
        </div>
      )}

      {phase === 'upload' && (
        <div className="flex flex-col gap-4">
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
                onClick={resetAll}
                className="flex size-20 shrink-0 flex-col items-center justify-center gap-1 rounded-xl border border-dashed border-border text-[10.5px] font-medium text-muted-foreground transition-colors hover:border-(--destructive) hover:text-(--destructive)"
              >
                <LuX className="size-4" aria-hidden />
                Καθαρισμός
              </button>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3">
            <Select value={docType} onValueChange={v => setDocType(v as OcrDocTypeHint)}>
              <SelectTrigger aria-label="Τύπος εγγράφου" className="h-9 min-w-[190px] rounded-full border-border bg-card px-3.5 text-[12.5px]">
                <SelectValue>{(v: string) => DOC_TYPE_HINT_LABEL[v as OcrDocTypeHint]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                {OCR_DOC_TYPE_HINTS.map(h => <SelectItem key={h} value={h}>{DOC_TYPE_HINT_LABEL[h]}</SelectItem>)}
              </SelectContent>
            </Select>
            <Button type="button" className="ml-auto" disabled={pages.length === 0 || processingFiles} onClick={runExtraction}>
              <LuScanText className="size-3.5" aria-hidden /> Ανάγνωση εγγράφου
            </Button>
          </div>
        </div>
      )}

      {phase === 'processing' && (
        <div className="flex flex-col items-center justify-center gap-3 py-14 text-center" role="status">
          <LuLoaderCircle className="size-9 animate-spin" style={{ color: 'var(--info)' }} aria-hidden />
          <p className="text-[14px] font-semibold">{PROCESSING_STEPS[stepIndex]}</p>
          <p className="text-[12px] text-muted-foreground">Συνήθως ~10-25 δευτερόλεπτα — μην κλείσεις αυτό το παράθυρο.</p>
        </div>
      )}

      {phase === 'review' && result && (
        <OcrReviewPanel
          pages={pages}
          initialData={result.data}
          model={result.model}
          usedFallback={result.usedFallback}
          onConfirm={handleConfirm}
          onRetry={handleRetry}
        />
      )}
    </div>
  )
}
