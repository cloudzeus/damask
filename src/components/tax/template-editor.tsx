'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuTag, LuCalendar, LuUpload } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { RegionEditor } from './region-editor'
import { FieldList } from './field-list'
import { updateTemplateMeta, uploadSample, saveFields } from '@/lib/tax/actions'
import { regionKeyOf, type TemplateField, type Bbox } from '@/lib/tax/template'
import { isPdfFile, imageFileToPage, rasterizePdf, type RasterizedPage } from '@/lib/ocr/rasterize'

export type TemplateMeta = {
  id: string
  code: string
  name: string
  year: number | null
  description: string | null
  status: 'DRAFT' | 'READY'
  sampleStorageKey: string | null
  samplePageCount: number | null
}

const STATUS_LABELS: Record<TemplateMeta['status'], string> = { DRAFT: 'Πρόχειρο', READY: 'Έτοιμο' }

/** File (PDF ή εικόνα) → rasterized σελίδες — ίδιο idiom με τον OCR uploader
 * (src/components/ocr/ocr-uploader.tsx): PDF περνάει από pdfjs, εικόνα απλά
 * base64-encode-άρεται σε μία «σελίδα». */
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

/**
 * Ο orchestrator του workbench: κρατάει τα fields + τις rasterized σελίδες
 * του δείγματος στο client state, περνάει και τα δύο στον RegionEditor
 * (Task 12) και στο FieldList, και συνδέει τη σχεδίαση περιοχής (drag στον
 * καμβά) με το επιλεγμένο πεδίο μέσω `regionKeyOf` (lib/tax/template.ts) —
 * το ίδιο κλειδί που χρησιμοποιεί ο RegionEditor για το highlight.
 */
export function TemplateEditor({ template, fields: initialFields }: { template: TemplateMeta; fields: TemplateField[] }) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)

  const [fields, setFields] = React.useState<TemplateField[]>(initialFields)
  const [pages, setPages] = React.useState<RasterizedPage[]>([])
  const [pagesLoading, setPagesLoading] = React.useState(!!template.sampleStorageKey)
  const [selectedFieldKey, setSelectedFieldKey] = React.useState<string | null>(null)

  const [name, setName] = React.useState(template.name)
  const [year, setYear] = React.useState(template.year != null ? String(template.year) : '')
  const [status, setStatus] = React.useState<TemplateMeta['status']>(template.status)
  const [uploading, setUploading] = React.useState(false)
  const [savingMeta, startSaveMeta] = React.useTransition()
  const [savingFields, startSaveFields] = React.useTransition()

  // Αρχικό φόρτωμα του δείγματος (αν υπάρχει ήδη) από το gated /page-image
  // route — το κατεβάζουμε ως blob και το rasterize-άρουμε στον browser (ίδια
  // τεχνική με το upload path, βλ. fileToPages).
  React.useEffect(() => {
    let cancelled = false
    if (!template.sampleStorageKey) {
      setPagesLoading(false)
      return
    }
    setPagesLoading(true)
    ;(async () => {
      try {
        const res = await fetch(`/tax-templates/${template.id}/page-image`, { cache: 'no-store' })
        if (!res.ok) throw new Error('Αποτυχία λήψης δείγματος.')
        const blob = await res.blob()
        const file = new File([blob], 'sample', { type: blob.type })
        const rasterized = await fileToPages(file)
        if (!cancelled) setPages(rasterized)
      } catch {
        if (!cancelled) toast.error('Αποτυχία φόρτωσης δείγματος εντύπου.')
      } finally {
        if (!cancelled) setPagesLoading(false)
      }
    })()
    return () => { cancelled = true }
  }, [template.id, template.sampleStorageKey])

  function handleDrawRegion(page: number, bbox: Bbox) {
    if (!selectedFieldKey) {
      toast.error('Επίλεξε πρώτα ένα πεδίο από τη λίστα για να του αναθέσεις περιοχή.')
      return
    }
    setFields(prev => prev.map((f, i) => (regionKeyOf(f, i) === selectedFieldKey ? { ...f, regionHint: { page, bbox } } : f)))
  }

  function handleSaveMeta() {
    const yearTrimmed = year.trim()
    const yearNum = yearTrimmed ? Number(yearTrimmed) : null
    if (yearTrimmed && (!Number.isInteger(yearNum) || (yearNum as number) < 2000 || (yearNum as number) > 2100)) {
      toast.error('Το έτος πρέπει να είναι έγκυρος 4ψήφιος αριθμός.')
      return
    }
    if (!name.trim()) {
      toast.error('Το όνομα είναι υποχρεωτικό.')
      return
    }
    startSaveMeta(async () => {
      try {
        await updateTemplateMeta(template.id, { name: name.trim(), year: yearNum, status })
        toast.success('Τα στοιχεία αποθηκεύτηκαν.')
        router.refresh()
      } catch {
        toast.error('Η αποθήκευση απέτυχε.')
      }
    })
  }

  async function handleSampleChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const rasterized = await fileToPages(file)
      if (rasterized.length === 0) throw new Error('Δεν βρέθηκαν σελίδες στο αρχείο.')
      const base64 = await fileToBase64(file)
      const isPdf = isPdfFile(file)
      const ext = extOf(file.name, isPdf)
      const mimeType = file.type || (isPdf ? 'application/pdf' : 'image/png')
      await uploadSample(template.id, {
        base64,
        mimeType,
        ext,
        pageCount: rasterized.length,
        thumbUrl: `data:${rasterized[0].mimeType};base64,${rasterized[0].base64}`,
      })
      setPages(rasterized)
      toast.success('Το δείγμα ανέβηκε.')
      router.refresh()
    } catch {
      toast.error('Η μεταφόρτωση δείγματος απέτυχε.')
    } finally {
      setUploading(false)
    }
  }

  function handleSaveFields() {
    startSaveFields(async () => {
      try {
        await saveFields(template.id, fields)
        toast.success('Τα πεδία αποθηκεύτηκαν.')
        router.refresh()
      } catch {
        toast.error('Η αποθήκευση πεδίων απέτυχε.')
      }
    })
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Στοιχεία εντύπου + ανέβασμα δείγματος */}
      <div className="glass rounded-[22px] p-4">
        <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-[2fr_130px_170px_auto]">
          <div className="field !mb-0">
            <label htmlFor="tm-name">Όνομα</label>
            <div className="inwrap">
              <LuTag aria-hidden />
              <input id="tm-name" value={name} onChange={e => setName(e.target.value)} disabled={savingMeta} />
            </div>
          </div>
          <div className="field !mb-0">
            <label htmlFor="tm-year">Έτος</label>
            <div className="inwrap">
              <LuCalendar aria-hidden />
              <input id="tm-year" inputMode="numeric" value={year} onChange={e => setYear(e.target.value)} disabled={savingMeta} />
            </div>
          </div>
          <div className="field !mb-0">
            <label htmlFor="tm-status">Κατάσταση</label>
            <Select value={status} onValueChange={v => setStatus(v as TemplateMeta['status'])}>
              <SelectTrigger id="tm-status" aria-label="Κατάσταση" className="h-11 w-full rounded-full border-border bg-card px-4" disabled={savingMeta}>
                <SelectValue>{(v: string) => STATUS_LABELS[v as TemplateMeta['status']]}</SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DRAFT">Πρόχειρο</SelectItem>
                <SelectItem value="READY">Έτοιμο</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="field !mb-0 flex items-end">
            <Button type="button" onClick={handleSaveMeta} disabled={savingMeta} className="h-11 w-full sm:w-auto">
              {savingMeta ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </Button>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <input ref={fileInputRef} type="file" accept=".pdf,image/*" className="hidden" onChange={handleSampleChange} />
          <Button type="button" variant="outline" onClick={() => fileInputRef.current?.click()} disabled={uploading}>
            <LuUpload className="size-3.5" aria-hidden /> {uploading ? 'Μεταφόρτωση…' : 'Ανέβασμα δείγματος'}
          </Button>
          <span className="text-[12px] text-muted-foreground">
            {pagesLoading
              ? 'Φόρτωση δείγματος…'
              : pages.length > 0
                ? `${pages.length} ${pages.length === 1 ? 'σελίδα' : 'σελίδες'} δείγματος`
                : 'Δεν έχει ανέβει δείγμα ακόμη.'}
          </span>
        </div>
      </div>

      {/* Καμβάς + λίστα πεδίων */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[minmax(0,1.35fr)_400px]">
        <div>
          {pagesLoading ? (
            <div className="glass flex min-h-[360px] items-center justify-center rounded-[22px] p-10 text-center text-[13px] text-muted-foreground">
              Φόρτωση δείγματος…
            </div>
          ) : (
            <RegionEditor
              pages={pages}
              fields={fields}
              activeFieldLocalId={selectedFieldKey}
              selectedRegionKey={selectedFieldKey}
              onDrawRegion={handleDrawRegion}
              onSelectRegion={setSelectedFieldKey}
            />
          )}
        </div>

        <div className="flex flex-col gap-3">
          <div className="max-h-[560px] overflow-auto pr-1">
            <FieldList
              fields={fields}
              selectedFieldKey={selectedFieldKey}
              pages={pages}
              templateId={template.id}
              onSelect={setSelectedFieldKey}
              onChange={setFields}
            />
          </div>
          <Button type="button" onClick={handleSaveFields} disabled={savingFields} className="self-end">
            {savingFields ? 'Αποθήκευση…' : 'Αποθήκευση πεδίων'}
          </Button>
        </div>
      </div>
    </div>
  )
}
