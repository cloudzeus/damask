'use client'

import * as React from 'react'
import { Eye, Download, LoaderCircle, FileWarning, ExternalLink } from 'lucide-react'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { cn } from '@/lib/utils'

/**
 * Καθολικό preview εγγράφου (PDF/εικόνα/Excel/Word/κείμενο) — drop-in παντού όπου
 * εμφανίζεται έγγραφο. Κατεβάζει τα bytes από το gated route (`url`) client-side
 * (το Content-Disposition:attachment ΔΕΝ εμποδίζει το fetch) και τα αποδίδει:
 *  • PDF → native iframe (blob URL)
 *  • εικόνα → <img>
 *  • xlsx/xls/csv → SheetJS → HTML πίνακες (tabs ανά φύλλο)
 *  • docx → mammoth (browser bundle) → HTML
 *  • txt/md/json → <pre>
 *  • αλλιώς → μήνυμα + λήψη. Πάντα διαθέσιμο κουμπί λήψης.
 * Οι βαριές βιβλιοθήκες (xlsx/mammoth) φορτώνονται με dynamic import μόνο όταν χρειάζονται.
 */

type Kind = 'pdf' | 'image' | 'sheet' | 'docx' | 'text' | 'unsupported'

const IMAGE_EXT = new Set(['png', 'jpg', 'jpeg', 'webp', 'gif', 'bmp', 'svg', 'avif'])
const SHEET_EXT = new Set(['xlsx', 'xls', 'xlsm', 'csv', 'ods'])
const TEXT_EXT = new Set(['txt', 'md', 'json', 'csv', 'log', 'xml', 'html'])

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

function kindOf(name: string, mimeType?: string | null): Kind {
  const ext = extOf(name)
  const mt = (mimeType ?? '').toLowerCase()
  if (ext === 'pdf' || mt === 'application/pdf') return 'pdf'
  if (IMAGE_EXT.has(ext) || mt.startsWith('image/')) return 'image'
  if (SHEET_EXT.has(ext) || mt.includes('spreadsheet') || mt.includes('excel')) return 'sheet'
  if (ext === 'docx' || mt.includes('officedocument.wordprocessing')) return 'docx'
  if (TEXT_EXT.has(ext) || mt.startsWith('text/')) return 'text'
  return 'unsupported'
}

type Loaded =
  | { kind: 'pdf' | 'image'; blobUrl: string }
  | { kind: 'sheet'; sheets: { name: string; html: string }[] }
  | { kind: 'docx'; html: string }
  | { kind: 'text'; text: string }
  | { kind: 'unsupported' }

export function DocumentPreviewDialog({
  url, name, mimeType, open, onOpenChange,
}: {
  url: string
  name: string
  mimeType?: string | null
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [status, setStatus] = React.useState<'idle' | 'loading' | 'ready' | 'error'>('idle')
  const [loaded, setLoaded] = React.useState<Loaded | null>(null)
  const blobUrlRef = React.useRef<string | null>(null)

  React.useEffect(() => {
    if (!open) return
    let alive = true
    const revoke = () => { if (blobUrlRef.current) { URL.revokeObjectURL(blobUrlRef.current); blobUrlRef.current = null } }
    const run = setTimeout(async () => {
      setStatus('loading')
      setLoaded(null)
      revoke()
      try {
        const kind = kindOf(name, mimeType)
        const res = await fetch(url, { cache: 'no-store' })
        if (!res.ok) throw new Error(`HTTP ${res.status}`)
        const buf = await res.arrayBuffer()
        if (!alive) return
        if (kind === 'pdf' || kind === 'image') {
          const blob = new Blob([buf], { type: mimeType ?? (kind === 'pdf' ? 'application/pdf' : 'application/octet-stream') })
          const blobUrl = URL.createObjectURL(blob)
          blobUrlRef.current = blobUrl
          setLoaded({ kind, blobUrl })
        } else if (kind === 'sheet') {
          const XLSX = await import('xlsx')
          const wb = XLSX.read(buf, { type: 'array' })
          const sheets = wb.SheetNames.map(n => ({ name: n, html: XLSX.utils.sheet_to_html(wb.Sheets[n]) }))
          if (!alive) return
          setLoaded({ kind: 'sheet', sheets })
        } else if (kind === 'docx') {
          // @ts-expect-error — το browser bundle του mammoth δεν έχει types
          const mod = await import('mammoth/mammoth.browser')
          const mammoth = mod.default ?? mod
          const out = await mammoth.convertToHtml({ arrayBuffer: buf })
          if (!alive) return
          setLoaded({ kind: 'docx', html: out.value as string })
        } else if (kind === 'text') {
          const text = new TextDecoder().decode(buf)
          if (!alive) return
          setLoaded({ kind: 'text', text })
        } else {
          setLoaded({ kind: 'unsupported' })
        }
        if (alive) setStatus('ready')
      } catch {
        if (alive) setStatus('error')
      }
    }, 0)
    return () => { alive = false; clearTimeout(run); revoke() }
  }, [open, url, name, mimeType])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass flex max-h-[92vh] w-[min(1100px,96vw)] flex-col sm:max-w-[1100px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 truncate pr-8">
            <Eye className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <span className="truncate">{name}</span>
          </DialogTitle>
        </DialogHeader>

        <div className="min-h-[300px] flex-1 overflow-auto rounded-xl border border-border bg-card">
          {status === 'loading' || status === 'idle' ? (
            <div className="flex h-full min-h-[300px] items-center justify-center gap-2 text-[0.8125rem] text-muted-foreground">
              <LoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση προεπισκόπησης…
            </div>
          ) : status === 'error' ? (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center text-[0.8125rem] text-muted-foreground">
              <FileWarning className="size-6 text-amber-600" aria-hidden />
              Η προεπισκόπηση απέτυχε. Κατέβασε το αρχείο για να το ανοίξεις.
            </div>
          ) : loaded?.kind === 'pdf' ? (
            <iframe src={loaded.blobUrl} title={name} className="h-[74vh] w-full" />
          ) : loaded?.kind === 'image' ? (
            <div className="flex items-center justify-center p-3">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={loaded.blobUrl} alt={name} className="max-h-[74vh] max-w-full object-contain" />
            </div>
          ) : loaded?.kind === 'sheet' ? (
            <SheetView sheets={loaded.sheets} />
          ) : loaded?.kind === 'docx' ? (
            <div className="docx-preview px-5 py-4 text-[0.8125rem] leading-relaxed" dangerouslySetInnerHTML={{ __html: loaded.html }} />
          ) : loaded?.kind === 'text' ? (
            <pre className="overflow-auto p-4 text-[0.75rem] leading-relaxed whitespace-pre-wrap">{loaded.text}</pre>
          ) : (
            <div className="flex h-full min-h-[300px] flex-col items-center justify-center gap-2 text-center text-[0.8125rem] text-muted-foreground">
              <FileWarning className="size-6" aria-hidden />
              Δεν υποστηρίζεται προεπισκόπηση για αυτόν τον τύπο αρχείου.
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2">
          <Button type="button" variant="outline" size="sm" nativeButton={false} render={<a href={url} target="_blank" rel="noopener" />}>
            <ExternalLink className="size-3.5" aria-hidden /> Νέα καρτέλα
          </Button>
          <Button type="button" size="sm" nativeButton={false} render={<a href={url} download={name} />}>
            <Download className="size-3.5" aria-hidden /> Λήψη
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  )
}

function SheetView({ sheets }: { sheets: { name: string; html: string }[] }) {
  const [active, setActive] = React.useState(0)
  const cur = sheets[Math.min(active, sheets.length - 1)]
  return (
    <div className="flex h-full flex-col">
      {sheets.length > 1 && (
        <div className="flex flex-wrap gap-1 border-b border-border bg-muted/40 p-2">
          {sheets.map((s, i) => (
            <button
              key={s.name + i}
              type="button"
              onClick={() => setActive(i)}
              className={cn('rounded-full px-3 py-1 text-[0.6875rem] font-semibold transition-colors',
                i === active ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-muted')}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
      <div className="sheet-preview flex-1 overflow-auto p-2" dangerouslySetInnerHTML={{ __html: cur?.html ?? '' }} />
    </div>
  )
}

/** Μικρό κουμπί «μάτι» που ανοίγει το preview — drop-in σε κάθε λίστα εγγράφων. */
export function DocumentPreviewButton({
  url, name, mimeType, className, label,
}: {
  url: string
  name: string
  mimeType?: string | null
  className?: string
  label?: string
}) {
  const [open, setOpen] = React.useState(false)
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn('inline-flex items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground', label ? 'gap-1.5 px-2.5 py-1 text-[0.6875rem] font-semibold' : 'size-7', className)}
        title="Προεπισκόπηση"
        aria-label={`Προεπισκόπηση — ${name}`}
      >
        <Eye className="size-3.5" aria-hidden />{label}
      </button>
      {open && <DocumentPreviewDialog url={url} name={name} mimeType={mimeType} open={open} onOpenChange={setOpen} />}
    </>
  )
}
