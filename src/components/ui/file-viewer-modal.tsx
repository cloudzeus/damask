'use client'

import { useEffect, useState } from 'react'
import * as XLSX from 'xlsx'
import { Download, ExternalLink, LoaderCircle, FileQuestion } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'

/**
 * Reusable προβολή αρχείου σε modal (χωρίς λήψη). Δουλεύει με ΙΔΙΩΤΙΚΑ αρχεία μέσω
 * του gated route (same-origin, cookies): image=<img>, pdf=<iframe>, docx=mammoth,
 * xlsx/xls/csv=SheetJS, txt=κείμενο. Άλλα (π.χ. παλιό .doc) → fallback λήψη.
 * `url` = ο gated inline σύνδεσμος (χρησιμοποίησε ?disp=inline).
 */

export type ViewerFile = { name: string; url: string }

type Kind = 'image' | 'pdf' | 'docx' | 'sheet' | 'text' | 'other'

function kindOf(name: string): Kind {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase()
  if (!ext) return 'other'
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg', 'bmp', 'avif'].includes(ext)) return 'image'
  if (ext === 'pdf') return 'pdf'
  if (ext === 'docx') return 'docx'
  if (['xlsx', 'xls', 'csv'].includes(ext)) return 'sheet'
  if (['txt', 'md', 'json', 'log'].includes(ext)) return 'text'
  return 'other'
}

export function FileViewerModal({ open, onOpenChange, file }: { open: boolean; onOpenChange: (o: boolean) => void; file: ViewerFile | null }) {
  const kind = file ? kindOf(file.name) : 'other'
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [html, setHtml] = useState<string | null>(null) // docx/sheet rendered html
  const [text, setText] = useState<string | null>(null)
  const [sheets, setSheets] = useState<string[]>([])
  const [activeSheet, setActiveSheet] = useState(0)
  const [wb, setWb] = useState<XLSX.WorkBook | null>(null)

  // Φόρτωση περιεχομένου για docx/sheet/text (image/pdf φορτώνουν μόνα τους).
  useEffect(() => {
    if (!open || !file) return
    let cancelled = false

    const load = async () => {
      // reset (μέσα σε nested fn — όχι synchronous setState στο effect body)
      setHtml(null); setText(null); setSheets([]); setActiveSheet(0); setWb(null); setError(null)
      if (kind === 'image' || kind === 'pdf' || kind === 'other') { setLoading(false); return }
      setLoading(true)
      try {
        const res = await fetch(file.url, { credentials: 'include' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        if (kind === 'text') {
          const t = await res.text()
          if (!cancelled) setText(t)
        } else if (kind === 'docx') {
          const buf = await res.arrayBuffer()
          // @ts-expect-error — browser build χωρίς types
          const mammothMod = await import('mammoth/mammoth.browser')
          const mammoth = (mammothMod.default ?? mammothMod) as { convertToHtml: (i: { arrayBuffer: ArrayBuffer }) => Promise<{ value: string }> }
          const out = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (!cancelled) setHtml(out.value)
        } else if (kind === 'sheet') {
          const ext = /\.([a-z0-9]+)$/i.exec(file.name)?.[1]?.toLowerCase()
          const book = ext === 'csv'
            ? XLSX.read(await res.text(), { type: 'string' })
            : XLSX.read(await res.arrayBuffer(), { type: 'array' })
          if (!cancelled) { setWb(book); setSheets(book.SheetNames); setActiveSheet(0) }
        }
      } catch {
        if (!cancelled) setError('Αδυναμία προεπισκόπησης του αρχείου.')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => { cancelled = true }
  }, [open, file, kind])

  const sheetHtml = wb && sheets[activeSheet] ? XLSX.utils.sheet_to_html(wb.Sheets[sheets[activeSheet]]) : null

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass flex h-[88vh] w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] flex-col overflow-hidden sm:max-w-[72rem]">
        <DialogHeader className="flex-row items-center justify-between gap-2">
          <DialogTitle className="truncate">{file?.name ?? 'Προβολή αρχείου'}</DialogTitle>
          {file && (
            <div className="flex shrink-0 items-center gap-1.5">
              <a href={file.url} target="_blank" rel="noopener noreferrer" className="icon-pill size-9" title="Άνοιγμα σε νέα καρτέλα" aria-label="Άνοιγμα σε νέα καρτέλα">
                <ExternalLink className="size-4" aria-hidden />
              </a>
              <a href={file.url.replace(/([?&])disp=inline/, '$1disp=attachment')} download className="icon-pill size-9" title="Λήψη" aria-label="Λήψη">
                <Download className="size-4" aria-hidden />
              </a>
            </div>
          )}
        </DialogHeader>

        <div className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-card">
          {!file ? null : loading ? (
            <div className="flex h-full items-center justify-center gap-2 text-sm text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση προεπισκόπησης…
            </div>
          ) : error ? (
            <Fallback file={file} message={error} />
          ) : kind === 'image' ? (
            // eslint-disable-next-line @next/next/no-img-element
            <div className="flex h-full items-center justify-center p-3"><img src={file.url} alt={file.name} className="max-h-full max-w-full object-contain" /></div>
          ) : kind === 'pdf' ? (
            <iframe src={file.url} title={file.name} className="h-full w-full" />
          ) : kind === 'text' ? (
            <pre className="h-full w-full overflow-auto p-4 text-[0.8125rem] whitespace-pre-wrap">{text}</pre>
          ) : kind === 'docx' && html !== null ? (
            <div className="docx-preview mx-auto max-w-[46rem] p-6 text-[0.875rem] leading-relaxed" dangerouslySetInnerHTML={{ __html: html }} />
          ) : kind === 'sheet' && sheetHtml !== null ? (
            <div className="flex h-full flex-col">
              {sheets.length > 1 && (
                <div className="flex flex-wrap gap-1 border-b border-border p-2">
                  {sheets.map((s, i) => (
                    <button key={s} type="button" onClick={() => setActiveSheet(i)}
                      className={`rounded-md px-2.5 py-1 text-[0.75rem] font-semibold ${i === activeSheet ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted'}`}>
                      {s}
                    </button>
                  ))}
                </div>
              )}
              <div className="sheet-preview min-h-0 flex-1 overflow-auto p-2 text-[0.8125rem]" dangerouslySetInnerHTML={{ __html: sheetHtml }} />
            </div>
          ) : (
            <Fallback file={file} message="Δεν υποστηρίζεται προεπισκόπηση για αυτόν τον τύπο." />
          )}
        </div>
      </DialogContent>
    </Dialog>
  )
}

function Fallback({ file, message }: { file: ViewerFile; message: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center">
      <FileQuestion className="size-8 text-muted-foreground" strokeWidth={1.5} aria-hidden />
      <p className="text-sm text-muted-foreground">{message}</p>
      <a href={file.url.replace(/([?&])disp=inline/, '$1disp=attachment')} download className="btn-pill btn-navy h-10 px-4 text-[0.8125rem]">
        <Download className="size-4" aria-hidden /> Λήψη
      </a>
    </div>
  )
}
