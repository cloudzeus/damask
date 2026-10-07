'use client'

import * as React from 'react'
import Link from 'next/link'
import { Search, Sparkles, LoaderCircle, Eye, Download, X, Tag, FileText } from 'lucide-react'
import { cn } from '@/lib/utils'
import { FileViewerModal, type ViewerFile } from '@/components/ui/file-viewer-modal'
import { searchDocumentsAction, topTagsAction } from '@/lib/search/actions'
import type { DocumentHit } from '@/lib/search/documents'

/**
 * Έξυπνη αναζήτηση εγγράφων: γράψε ό,τι θυμάσαι («ενημερότητα εφορίας Κιβωτόπουλου»,
 * «κύκλος εργασιών 2024», ΑΦΜ, προϊόν προσφοράς…) — σημασιολογική + κειμένου χωρίς τόνους.
 * Ετικέτες ως φίλτρα με ένα κλικ. Προαιρετικά περιορισμένη σε έναν πελάτη (`trdrId`).
 */
export function DocumentSearch({ trdrId, categoryLabels, autoFocus }: { trdrId?: string; categoryLabels: Record<string, string>; autoFocus?: boolean }) {
  const [q, setQ] = React.useState('')
  const [tag, setTag] = React.useState<string | null>(null)
  const [hits, setHits] = React.useState<DocumentHit[] | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [tags, setTags] = React.useState<{ tag: string; n: number }[]>([])
  const [viewer, setViewer] = React.useState<ViewerFile | null>(null)
  const seq = React.useRef(0)

  React.useEffect(() => {
    if (trdrId) return
    topTagsAction().then(setTags).catch(() => {})
  }, [trdrId])

  // Αναζήτηση με debounce· αγνοεί απαντήσεις παλαιότερων πληκτρολογήσεων.
  React.useEffect(() => {
    const query = q.trim()
    if (!query && !tag) return
    const id = ++seq.current
    const t = setTimeout(() => {
      setLoading(true)
      searchDocumentsAction(query, { trdrId: trdrId ?? null, tag, limit: 40 })
        .then(r => { if (id === seq.current) setHits(r) })
        .catch(() => { if (id === seq.current) setHits([]) })
        .finally(() => { if (id === seq.current) setLoading(false) })
    }, 350)
    return () => clearTimeout(t)
  }, [q, tag, trdrId])

  const dl = (key: string, inline = false) => `/api/files/download?key=${encodeURIComponent(key)}${inline ? '&disp=inline' : ''}`
  const active = q.trim() || tag

  return (
    <section className="glass flex flex-col gap-3 rounded-[22px] p-4">
      <div className="flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 focus-within:border-(--info) focus-within:ring-4 focus-within:ring-(--info-soft)">
        {loading ? <LoaderCircle className="size-4 shrink-0 animate-spin text-primary" /> : <Sparkles className="size-4 shrink-0 text-primary" />}
        <input
          value={q}
          onChange={e => setQ(e.target.value)}
          autoFocus={autoFocus}
          placeholder={trdrId ? 'Αναζήτηση στα έγγραφα του πελάτη…' : 'Γράψε ό,τι θυμάσαι: «ενημερότητα εφορίας Κιβωτόπουλου», «κύκλος εργασιών 2024», ΑΦΜ, προϊόν…'}
          className="min-w-0 flex-1 bg-transparent text-[length:var(--fs-13)] outline-none"
          aria-label="Έξυπνη αναζήτηση εγγράφων"
        />
        {q && <button type="button" onClick={() => setQ('')} aria-label="Καθαρισμός" className="text-muted-foreground hover:text-foreground"><X className="size-4" /></button>}
      </div>

      {(tag || tags.length > 0) && (
        <div className="flex flex-wrap items-center gap-1.5">
          <Tag className="size-3.5 text-muted-foreground" />
          {tag && (
            <button type="button" onClick={() => setTag(null)} className="inline-flex items-center gap-1 rounded-full bg-primary px-2.5 py-0.5 text-[length:var(--fs-11)] font-semibold text-primary-foreground">
              {tag} <X className="size-3" />
            </button>
          )}
          {!tag && tags.slice(0, 18).map(t => (
            <button key={t.tag} type="button" onClick={() => setTag(t.tag)} className="rounded-full border border-border bg-card px-2.5 py-0.5 text-[length:var(--fs-11)] font-semibold text-muted-foreground hover:border-primary hover:text-primary">
              {t.tag} <span className="opacity-60">{t.n}</span>
            </button>
          ))}
        </div>
      )}

      {active && hits && (
        <ul className="flex flex-col divide-y divide-border overflow-hidden rounded-xl border border-border bg-card">
          {hits.map(h => (
            <li key={h.key} className="flex items-start gap-3 px-3 py-2.5">
              <FileText className="mt-0.5 size-4 shrink-0 text-muted-foreground" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                  <span className="text-[length:var(--fs-13)] font-semibold">{h.title}</span>
                  {h.trdrId && !trdrId && (
                    <Link href={`/partners/${h.trdrId}`} className="truncate text-[length:var(--fs-12)] font-medium text-primary hover:underline">{h.trdrName}</Link>
                  )}
                </div>
                <p className="truncate text-[length:var(--fs-11-5)] text-muted-foreground" title={h.snippet}>{h.snippet}</p>
                <div className="mt-1 flex flex-wrap gap-1">
                  <span className="badge-pill muted" style={{ textTransform: 'none' }}>{categoryLabels[h.category] ?? h.category}</span>
                  {h.tags.filter(t => t !== categoryLabels[h.category]).slice(0, 6).map(t => (
                    <button key={t} type="button" onClick={() => setTag(t)} className={cn('badge-pill info cursor-pointer')} style={{ textTransform: 'none' }}>{t}</button>
                  ))}
                </div>
              </div>
              <div className="flex shrink-0 items-center gap-0.5">
                <button type="button" className="rowmenu-btn" title="Προβολή" aria-label={`Προβολή ${h.title}`} onClick={() => setViewer({ name: h.title, url: dl(h.key, true) })}><Eye className="size-3.5" /></button>
                <a className="rowmenu-btn" href={dl(h.key)} title="Λήψη" aria-label={`Λήψη ${h.title}`}><Download className="size-3.5" /></a>
              </div>
            </li>
          ))}
          {hits.length === 0 && !loading && (
            <li className="flex items-center gap-2 px-3 py-6 text-[length:var(--fs-12-5)] text-muted-foreground"><Search className="size-4" /> Δεν βρέθηκε έγγραφο — δοκίμασε άλλες λέξεις ή μια ετικέτα.</li>
          )}
        </ul>
      )}
      <FileViewerModal open={!!viewer} onOpenChange={o => { if (!o) setViewer(null) }} file={viewer} />
    </section>
  )
}
