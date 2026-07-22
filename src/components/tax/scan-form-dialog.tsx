'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuTag, LuCalendar, LuFileText, LuUpload, LuScanText, LuFile } from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Progress } from '@/components/ui/progress'
import { CorrectionGrid, type GridRow } from './correction-grid'
import { listReadyTemplates, getTemplateFields, scanForm } from '@/lib/tax/actions'
import { cropRegion } from '@/lib/tax/crop'
import { isPdfFile, imageFileToPage, rasterizePdf, type RasterizedPage } from '@/lib/ocr/rasterize'
import type { OcrCostView } from '@/lib/ingestion/ocr-cost'

type GuideOption = { id: string; code: string; name: string; year: number | null }

type Phase = 'form' | 'scanning' | 'grid'

/** Ίδιο idiom με template-editor.tsx: PDF → σελίδες μέσω pdfjs, εικόνα → μία «σελίδα». */
async function fileToPages(file: File): Promise<RasterizedPage[]> {
  if (isPdfFile(file)) {
    const { pages } = await rasterizePdf(file)
    return pages
  }
  return [await imageFileToPage(file)]
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const comma = dataUrl.indexOf(',')
      resolve(comma === -1 ? dataUrl : dataUrl.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader απέτυχε.'))
    reader.readAsDataURL(file)
  })
}

function extOf(filename: string, isPdf: boolean): string {
  const m = filename.toLowerCase().match(/\.([a-z0-9]+)$/)
  if (m) return m[1]
  return isPdf ? 'pdf' : 'png'
}

function buildDefaultName(code: string, year: string, trdrName: string): string {
  return `${code} ${year} — ${trdrName}`.trim()
}

const CURRENT_YEAR = new Date().getFullYear()

/**
 * Wizard σάρωσης εντύπου για έναν συναλλασσόμενο (Task 14): επιλογή οδηγού +
 * έτος + αρχείο σαρωμένου (συμπληρωμένου) εντύπου → rasterize στον browser →
 * crop ΚΑΘΕ χαρτογραφημένης περιοχής (regionHint) πάνω στη σωστή σελίδα →
 * ένα scanForm() που κάνει OCR ανά περιοχή → correction grid προς
 * επιβεβαίωση πριν το saveFinancialValues. Ο server ΔΕΝ βλέπει ποτέ ολόκληρη
 * σελίδα εικόνας πέρα από τα ήδη-cropped πεδία + το πλήρες δείγμα (μόνο για
 * αρχειοθέτηση) — καμία επεξεργασία εικόνας (sharp) στον server.
 */
export function ScanFormDialog({
  trdrId, trdrName, open, onOpenChange, onSaved,
}: {
  trdrId: string
  trdrName: string
  open: boolean
  onOpenChange: (open: boolean) => void
  onSaved?: () => void
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const [templates, setTemplates] = React.useState<GuideOption[]>([])
  const [loadingTemplates, setLoadingTemplates] = React.useState(false)
  const [templateId, setTemplateId] = React.useState('')
  const [year, setYear] = React.useState(String(CURRENT_YEAR))
  const [yearTouched, setYearTouched] = React.useState(false)
  const [name, setName] = React.useState('')
  const [nameTouched, setNameTouched] = React.useState(false)
  const [usage, setUsage] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)

  const [phase, setPhase] = React.useState<Phase>('form')
  const [progress, setProgress] = React.useState(0)
  const [progressLabel, setProgressLabel] = React.useState('')
  const [error, setError] = React.useState<string | null>(null)

  const [result, setResult] = React.useState<{ recordId: string; grid: GridRow[]; cost: OcrCostView } | null>(null)
  const [resultTemplateId, setResultTemplateId] = React.useState('')
  const [resultYear, setResultYear] = React.useState(CURRENT_YEAR)

  // Φόρτωμα των ΕΤΟΙΜΩΝ οδηγών κάθε φορά που ανοίγει το dialog.
  React.useEffect(() => {
    if (!open) return
    let cancelled = false
    setLoadingTemplates(true)
    listReadyTemplates()
      .then(rows => { if (!cancelled) setTemplates(rows) })
      .catch(() => { if (!cancelled) toast.error('Αποτυχία φόρτωσης οδηγών εντύπων.') })
      .finally(() => { if (!cancelled) setLoadingTemplates(false) })
    return () => { cancelled = true }
  }, [open])

  function resetAll() {
    setTemplateId('')
    setYear(String(CURRENT_YEAR))
    setYearTouched(false)
    setName('')
    setNameTouched(false)
    setUsage('')
    setFile(null)
    setPhase('form')
    setProgress(0)
    setProgressLabel('')
    setError(null)
    setResult(null)
  }

  function handleOpenChange(next: boolean) {
    if (phase === 'scanning') return
    if (!next) resetAll()
    onOpenChange(next)
  }

  function selectedTemplate(): GuideOption | null {
    return templates.find(t => t.id === templateId) ?? null
  }

  function handleTemplateChange(id: string | null) {
    setTemplateId(id ?? '')
    const t = templates.find(x => x.id === id)
    const nextYear = yearTouched ? year : String(t?.year ?? (CURRENT_YEAR - 1))
    if (!yearTouched) setYear(nextYear)
    if (!nameTouched && t) setName(buildDefaultName(t.code, nextYear, trdrName))
  }

  function handleYearChange(v: string) {
    setYear(v)
    setYearTouched(true)
    const t = selectedTemplate()
    if (!nameTouched && t) setName(buildDefaultName(t.code, v, trdrName))
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (f) setFile(f)
  }

  async function handleScan() {
    const t = selectedTemplate()
    const yearTrimmed = year.trim()
    const yearNum = yearTrimmed ? Number(yearTrimmed) : NaN
    if (!t) { toast.error('Επίλεξε οδηγό εντύπου.'); return }
    if (!Number.isInteger(yearNum) || yearNum < 2000 || yearNum > 2100) { toast.error('Το έτος πρέπει να είναι έγκυρος 4ψήφιος αριθμός.'); return }
    if (!name.trim()) { toast.error('Το όνομα είναι υποχρεωτικό.'); return }
    if (!file) { toast.error('Επίλεξε το σαρωμένο αρχείο εντύπου.'); return }

    setPhase('scanning')
    setError(null)
    setProgress(0)

    try {
      setProgressLabel('Προεπεξεργασία εικόνας…')
      setProgress(5)
      const pages = await fileToPages(file)
      if (pages.length === 0) throw new Error('Δεν βρέθηκαν σελίδες στο αρχείο.')
      const base64 = await fileToBase64(file)
      const isPdf = isPdfFile(file)
      const ext = extOf(file.name, isPdf)
      const mimeType = file.type || (isPdf ? 'application/pdf' : 'image/png')

      setProgressLabel('Φόρτωση χαρτογραφημένων πεδίων…')
      setProgress(15)
      const templateFields = await getTemplateFields(t.id)
      const scannable = templateFields.filter(f => (f.kind === 'SINGLE' || f.kind === 'SERIES') && !!f.regionHint)
      const scannableTables = templateFields.filter(f => f.kind === 'TABLE' && !!f.regionHint)
      if (scannable.length === 0 && scannableTables.length === 0) throw new Error('Ο οδηγός δεν έχει χαρτογραφημένες περιοχές OCR.')

      const fieldImages: {
        fieldKey: string
        label: string
        valueType: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
        kind: 'SINGLE' | 'SERIES'
        aiHint?: string | null
        image: { base64: string; mimeType: string }
      }[] = []
      const tableImages: {
        fieldKey: string
        label: string
        valueType: 'CURRENCY' | 'NUMBER' | 'PERCENT' | 'INTEGER' | 'DATE' | 'BOOLEAN'
        columns?: string[]
        image: { base64: string; mimeType: string }
      }[] = []

      const totalScannable = scannable.length + scannableTables.length
      for (let i = 0; i < scannable.length; i++) {
        const f = scannable[i]
        const hint = f.regionHint!
        setProgressLabel(`Περικοπή περιοχής «${f.label}» (${i + 1}/${totalScannable})…`)
        setProgress(15 + Math.round(65 * (i / totalScannable)))
        const page = pages[hint.page]
        if (!page) continue // η περιοχή δείχνει σε σελίδα που δεν υπάρχει στο ανεβασμένο αρχείο — παράλειψη, ασφαλές fallback
        const cropped = await cropRegion(page.base64, page.mimeType, hint.bbox)
        fieldImages.push({
          fieldKey: f.fieldKey,
          label: f.label,
          valueType: f.valueType,
          kind: f.kind as 'SINGLE' | 'SERIES',
          aiHint: f.aiHint,
          image: cropped,
        })
      }
      for (let i = 0; i < scannableTables.length; i++) {
        const f = scannableTables[i]
        const hint = f.regionHint!
        const idx = scannable.length + i
        setProgressLabel(`Περικοπή πίνακα «${f.label}» (${idx + 1}/${totalScannable})…`)
        setProgress(15 + Math.round(65 * (idx / totalScannable)))
        const page = pages[hint.page]
        if (!page) continue // η περιοχή δείχνει σε σελίδα που δεν υπάρχει στο ανεβασμένο αρχείο — παράλειψη, ασφαλές fallback
        const cropped = await cropRegion(page.base64, page.mimeType, hint.bbox)
        tableImages.push({
          fieldKey: f.fieldKey,
          label: f.label,
          valueType: f.valueType,
          columns: f.config?.columns ?? undefined,
          image: cropped,
        })
      }
      if (fieldImages.length === 0 && tableImages.length === 0) throw new Error('Καμία περιοχή δεν βρέθηκε στις σελίδες του ανεβασμένου αρχείου.')

      setProgressLabel('Σάρωση με OCR…')
      setProgress(85)
      const res = await scanForm({
        trdrId,
        templateId: t.id,
        year: yearNum,
        name: name.trim(),
        usage: usage.trim() || null,
        sample: { base64, mimeType, ext, pageCount: pages.length },
        fieldImages,
        tableImages,
      })

      setProgress(100)
      setResult(res)
      setResultTemplateId(t.id)
      setResultYear(yearNum)
      setPhase('grid')
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Η σάρωση απέτυχε.'
      setError(message)
      toast.error(message)
      setPhase('form')
    }
  }

  function handleGridSaved() {
    onSaved?.()
    handleOpenChange(false)
  }

  const wide = phase === 'grid'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className={wide ? 'glass sm:max-w-[880px]' : 'glass sm:max-w-[560px]'}>
        <DialogHeader>
          <DialogTitle>Καταχώριση OCR εντύπου</DialogTitle>
          <DialogDescription>
            {phase === 'grid'
              ? `Επιβεβαίωσε τις τιμές πριν την αποθήκευση για ${trdrName} — ${resultYear}.`
              : `Σάρωσε ένα συμπληρωμένο έντυπο για ${trdrName}.`}
          </DialogDescription>
        </DialogHeader>

        {phase === 'grid' && result ? (
          <CorrectionGrid
            grid={result.grid}
            cost={result.cost}
            trdrId={trdrId}
            templateId={resultTemplateId}
            year={resultYear}
            recordId={result.recordId}
            onSaved={handleGridSaved}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
              <div className="field !mb-0">
                <label htmlFor="sf-template">Οδηγός εντύπου*</label>
                <Select value={templateId} onValueChange={handleTemplateChange} disabled={phase === 'scanning' || loadingTemplates}>
                  <SelectTrigger id="sf-template" aria-label="Οδηγός εντύπου" className="h-8 w-full">
                    <SelectValue placeholder={loadingTemplates ? 'Φόρτωση…' : 'Επίλεξε οδηγό'} />
                  </SelectTrigger>
                  <SelectContent>
                    {templates.map(t => (
                      <SelectItem key={t.id} value={t.id}>
                        {t.code} — {t.name}{t.year != null ? ` (${t.year})` : ''}
                      </SelectItem>
                    ))}
                    {templates.length === 0 && !loadingTemplates && (
                      <div className="px-2 py-1.5 text-[12px] text-muted-foreground">Δεν υπάρχουν έτοιμοι οδηγοί.</div>
                    )}
                  </SelectContent>
                </Select>
              </div>
              <div className="field !mb-0">
                <label htmlFor="sf-year">Έτος*</label>
                <div className="inwrap">
                  <LuCalendar aria-hidden />
                  <input
                    id="sf-year" inputMode="numeric" value={year}
                    onChange={e => handleYearChange(e.target.value)}
                    disabled={phase === 'scanning'}
                  />
                </div>
              </div>
            </div>

            <div className="field !mb-0">
              <label htmlFor="sf-name">Όνομα*</label>
              <div className="inwrap">
                <LuTag aria-hidden />
                <input
                  id="sf-name" value={name}
                  onChange={e => { setName(e.target.value); setNameTouched(true) }}
                  disabled={phase === 'scanning'}
                />
              </div>
            </div>

            <div className="field !mb-0">
              <label htmlFor="sf-usage">Χρήση (προαιρετικό)</label>
              <div className="inwrap">
                <LuFileText aria-hidden />
                <input
                  id="sf-usage" value={usage} onChange={e => setUsage(e.target.value)}
                  placeholder="π.χ. Δάνειο / Έλεγχος πιστοληπτικής ικανότητας"
                  disabled={phase === 'scanning'}
                />
              </div>
            </div>

            <div className="field !mb-0">
              <label>Αρχείο εντύπου (PDF ή εικόνα)*</label>
              <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleFileChange} />
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={phase === 'scanning'}
                className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-[12.5px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
              >
                {file ? <LuFile className="size-3.5 shrink-0" aria-hidden /> : <LuUpload className="size-3.5 shrink-0" aria-hidden />}
                <span className="truncate">{file ? file.name : 'Επίλεξε ή σύρε το σαρωμένο έντυπο…'}</span>
              </button>
            </div>

            {phase === 'scanning' && (
              <div className="flex flex-col gap-1.5 pt-1">
                <Progress value={progress} />
                <p className="text-center text-[11.5px] text-muted-foreground">{progressLabel || 'Σάρωση…'}</p>
              </div>
            )}

            {error && phase === 'form' && (
              <div className="error">{error}</div>
            )}
          </div>
        )}

        {phase !== 'grid' && (
          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={phase === 'scanning'}>Άκυρο</Button>} />
            <Button type="button" onClick={handleScan} disabled={phase === 'scanning'}>
              <LuScanText className="size-3.5" aria-hidden /> {phase === 'scanning' ? 'Σάρωση…' : 'Σάρωση'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
