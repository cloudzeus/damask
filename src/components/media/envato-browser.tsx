'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Search, Loader2, Image as ImageIcon, Film, ExternalLink, Download, BadgeCheck, X } from 'lucide-react'
import { cn } from '@/lib/utils'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { envatoSearchAction, envatoImportAction } from '@/app/(app)/media/actions'
import type { EnvatoItem } from '@/lib/envato'
import type { MediaKind, PickedAsset } from './media-types'

/**
 * Tab «Envato» (Media Gallery & MediaPicker): αναζήτηση φωτογραφιών (PhotoDune) και βίντεο (VideoHive) με
 * προεπισκόπηση. Εισαγωγή στον τρέχοντα φάκελο ΜΟΝΟ για αγορασμένα items (άδεια χρήσης)· τα υπόλοιπα ανοίγουν
 * στο Envato για αγορά — οι προεπισκοπήσεις έχουν υδατογράφημα.
 */
/** Αναζήτηση στο Envato Elements (συνδρομή) — το Elements δεν έχει δημόσιο API, άρα άνοιγμα της σελίδας του. */
function elementsUrl(kind: 'photo' | 'video', term: string): string {
  const slug = term.trim().toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  const base = kind === 'video' ? 'https://elements.envato.com/stock-video' : 'https://elements.envato.com/photos'
  return slug ? `${base}/${encodeURIComponent(slug)}` : base
}

export function EnvatoBrowser({ folderId, folderName, accept, onImported, compact = false }: {
  folderId: string | null
  folderName?: string | null
  accept?: MediaKind[]
  onImported?: (asset: PickedAsset) => void
  compact?: boolean
}) {
  const allowPhoto = !accept || accept.includes('IMAGE')
  const allowVideo = !accept || accept.includes('VIDEO')
  const [kind, setKind] = useState<'photo' | 'video'>(allowPhoto ? 'photo' : 'video')
  const [term, setTerm] = useState('')
  const [lastTerm, setLastTerm] = useState('')
  const [items, setItems] = useState<EnvatoItem[]>([])
  const [total, setTotal] = useState<number | null>(null)
  const [page, setPage] = useState(1)
  const [pages, setPages] = useState(0)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [preview, setPreview] = useState<EnvatoItem | null>(null)
  const [importing, setImporting] = useState<number | null>(null)

  async function search(nextPage = 1, k = kind, q = term) {
    const t = q.trim()
    if (!t) return
    setLoading(true); setError(null)
    const r = await envatoSearchAction(t, k, nextPage)
    setLoading(false)
    if (!r.ok) { setError(r.error); return }
    setLastTerm(t)
    setItems(prev => (nextPage === 1 ? r.items : [...prev, ...r.items]))
    setTotal(r.total); setPages(r.pages); setPage(nextPage)
  }

  function switchKind(k: 'photo' | 'video') {
    setKind(k)
    if (lastTerm) void search(1, k, lastTerm)
  }

  async function importItem(item: EnvatoItem) {
    setImporting(item.id)
    const r = await envatoImportAction({ itemId: item.id, kind, name: item.name, url: item.url, author: item.author, folderId })
    setImporting(null)
    if (!r.ok) { toast.error(r.error); return }
    toast.success(`Εισήχθη στο Gallery${folderName ? ` («${folderName}»)` : ''}.`)
    setPreview(null)
    onImported?.({ id: r.asset.id, url: r.asset.url, name: r.asset.name, type: r.asset.type })
  }

  const price = (c: number | null) => (c == null ? '' : `$${(c / 100).toLocaleString('el-GR', { maximumFractionDigits: 2 })}`)

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3">
      <form className="flex flex-wrap items-center gap-2" onSubmit={e => { e.preventDefault(); void search(1) }}>
        <div className="flex gap-1.5">
          {allowPhoto && (
            <button type="button" className={cn('pill', kind === 'photo' && 'on')} onClick={() => switchKind('photo')}>
              <ImageIcon className="size-3.5" aria-hidden /> Φωτογραφίες
            </button>
          )}
          {allowVideo && (
            <button type="button" className={cn('pill', kind === 'video' && 'on')} onClick={() => switchKind('video')}>
              <Film className="size-3.5" aria-hidden /> Βίντεο
            </button>
          )}
        </div>
        <label className="relative min-w-[12rem] flex-1">
          <span className="sr-only">Αναζήτηση στο Envato</span>
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input value={term} onChange={e => setTerm(e.target.value)} placeholder={kind === 'video' ? 'π.χ. office teamwork, athens aerial…' : 'π.χ. business meeting, factory, greek island…'}
            className="h-10 w-full rounded-full border border-input bg-card pl-9 pr-3 text-[length:var(--fs-13-5)] outline-none focus:border-primary" />
        </label>
        <Button type="submit" disabled={loading || !term.trim()}>{loading && page === 1 ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}Αναζήτηση</Button>
        <a href={elementsUrl(kind, term)} target="_blank" rel="noopener noreferrer" className="btn-pill btn-glass h-10 px-4" title="Με τη συνδρομή Elements: κατεβάστε από εκεί και ανεβάστε από το «Μεταφόρτωση»">
          <ExternalLink className="size-4" aria-hidden /> Στο Envato Elements
        </a>
      </form>

      <p className="text-[length:var(--fs-12)] text-muted-foreground">
        <b>Συνδρομή Elements:</b> το «Στο Envato Elements» ανοίγει την ίδια αναζήτηση εκεί — κατεβάστε με τη συνδρομή και ανεβάστε το αρχείο από το «Μεταφόρτωση». Παρακάτω: αποτελέσματα Envato Market (με υδατογράφημα). Εισαγωγή στο Gallery{folderName ? ` (φάκελος «${folderName}»)` : ''} γίνεται για όσα έχετε <b>αγοράσει</b>· για τα υπόλοιπα ανοίγει η σελίδα αγοράς.
        {total != null && <> · <span className="tabular-nums">{total.toLocaleString('el-GR')}</span> αποτελέσματα για «{lastTerm}»</>}
      </p>

      <div className={cn('min-h-0 flex-1 overflow-y-auto pr-1', compact ? '' : 'max-h-[70vh]')}>
        {error && <p className="rounded-xl bg-destructive/10 px-3 py-2 text-[length:var(--fs-13)] text-destructive" role="alert">{error}</p>}
        {!error && total === null && !loading && (
          <p className="py-10 text-center text-[length:var(--fs-13)] text-muted-foreground">Γράψτε τι ψάχνετε (καλύτερα στα αγγλικά) και πατήστε «Αναζήτηση».</p>
        )}
        {total === 0 && <p className="py-10 text-center text-[length:var(--fs-13)] text-muted-foreground">Δεν βρέθηκαν αποτελέσματα — δοκιμάστε άλλη λέξη.</p>}
        <ul className={cn('grid gap-2.5', compact ? 'grid-cols-2 sm:grid-cols-3' : 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4')}>
          {items.map(item => (
            <li key={item.id}>
              <button type="button" onClick={() => setPreview(item)}
                className="group block w-full overflow-hidden rounded-xl border border-border bg-card text-left transition hover:border-primary focus-visible:outline-2 focus-visible:outline-primary">
                <div className="relative aspect-video bg-muted">
                  {item.thumb && (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.thumb} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
                  )}
                  {item.videoUrl && (
                    <video src={item.videoUrl} muted loop playsInline preload="none" aria-hidden
                      className="absolute inset-0 size-full object-cover opacity-0 transition group-hover:opacity-100"
                      onMouseEnter={e => void e.currentTarget.play().catch(() => {})} onMouseLeave={e => e.currentTarget.pause()} />
                  )}
                  <span className={cn('absolute right-1.5 top-1.5 rounded-full px-2 py-0.5 text-[length:var(--fs-11)] font-semibold',
                    item.purchased ? 'bg-emerald-600 text-white' : 'bg-black/60 text-white')}>
                    {item.purchased ? 'Αγορασμένο' : price(item.priceCents)}
                  </span>
                </div>
                <div className="px-2.5 py-2">
                  <p className="line-clamp-2 text-[length:var(--fs-12-5)] font-medium leading-snug">{item.name}</p>
                  <p className="truncate text-[length:var(--fs-11-5)] text-muted-foreground">{item.author}</p>
                </div>
              </button>
            </li>
          ))}
        </ul>
        {items.length > 0 && page < pages && (
          <div className="flex justify-center py-3">
            <Button type="button" variant="outline" onClick={() => void search(page + 1)} disabled={loading}>
              {loading ? <Loader2 className="size-4 animate-spin" /> : null}Περισσότερα
            </Button>
          </div>
        )}
      </div>

      <Dialog open={!!preview} onOpenChange={o => { if (!o) setPreview(null) }}>
        <DialogContent className="glass w-[calc(100%-2rem)] max-w-[calc(100%-2rem)] sm:max-w-[56rem]">
          {preview && (
            <>
              <DialogHeader>
                <DialogTitle className="pr-8">{preview.name}</DialogTitle>
                <DialogDescription>από {preview.author} · Envato {kind === 'video' ? 'VideoHive' : 'PhotoDune'}{preview.purchased ? ' · έχει αγοραστεί' : ` · ${price(preview.priceCents)}`}</DialogDescription>
              </DialogHeader>
              <div className="overflow-hidden rounded-xl bg-black/90">
                {preview.videoUrl ? (
                  <video src={preview.videoUrl} controls autoPlay muted loop playsInline className="max-h-[60vh] w-full" />
                ) : (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={preview.preview ?? preview.thumb ?? ''} alt={preview.name} className="mx-auto max-h-[60vh] object-contain" />
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                {preview.purchased ? (
                  <Button type="button" onClick={() => void importItem(preview)} disabled={importing === preview.id}>
                    {importing === preview.id ? <Loader2 className="size-4 animate-spin" /> : <Download className="size-4" />}
                    {importing === preview.id ? 'Λήψη & εισαγωγή…' : `Εισαγωγή στο Gallery${folderName ? ` («${folderName}»)` : ''}`}
                  </Button>
                ) : (
                  <a href={preview.url} target="_blank" rel="noopener noreferrer" className="btn-pill btn-navy h-10 px-4">
                    <ExternalLink className="size-4" aria-hidden /> Αγορά στο Envato ({price(preview.priceCents)})
                  </a>
                )}
                <a href={preview.url} target="_blank" rel="noopener noreferrer" className="btn-pill btn-glass h-10 px-4">
                  <ExternalLink className="size-4" aria-hidden /> Σελίδα στο Envato
                </a>
                <span className="ml-auto flex items-center gap-1.5 text-[length:var(--fs-12)] text-muted-foreground">
                  {preview.purchased
                    ? <><BadgeCheck className="size-4 text-emerald-600" aria-hidden /> Έχετε άδεια χρήσης</>
                    : <><X className="size-4" aria-hidden /> Η προεπισκόπηση έχει υδατογράφημα — δεν εισάγεται</>}
                </span>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
