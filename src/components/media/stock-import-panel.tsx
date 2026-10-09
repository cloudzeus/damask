'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Play, ExternalLink, CheckCircle2, AlertTriangle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { stockImportStatusAction, startStockImportAction } from '@/app/(app)/media/actions'
import type { StockImportStatus } from '@/lib/stock/bulk-import'

/** Θέματα για premium επιλογές από Envato Elements (χειροκίνητη λήψη με τη συνδρομή). */
const ELEMENTS_PICKS: [string, string][] = [
  ['Επιχειρηματίες σε συνάντηση (hero)', 'diverse business team meeting'],
  ['Μικρομεσαία επιχείρηση', 'small business owner portrait'],
  ['Εργοστάσιο & παραγωγή', 'modern factory workers'],
  ['Τουρισμός & φιλοξενία', 'hotel staff greece'],
  ['Αγροδιατροφή', 'farmer olive grove'],
  ['Ψηφιακός μετασχηματισμός', 'team digital transformation'],
  ['Πράσινη ενέργεια', 'solar panel engineer'],
  ['Ευρωπαϊκή Ένωση', 'european union business'],
]

/**
 * Μαζική εισαγωγή δωρεάν stock φωτογραφιών (Pexels/Pixabay) για τα ευρωπαϊκά προγράμματα — επαγγελματίες,
 * επαγγέλματα, ομάδες — σε φακέλους ανά κλάδο. Τρέχει στο παρασκήνιο· η πρόοδος ανανεώνεται κάθε 3″.
 */
export function StockImportPanel({ onProgress }: { onProgress?: () => void }) {
  const [status, setStatus] = useState<StockImportStatus | null>(null)
  const [providers, setProviders] = useState<string[]>([])
  const [target, setTarget] = useState(500)
  const [starting, setStarting] = useState(false)
  // Σταθερή αναφορά στο callback (ο γονέας το ξαναφτιάχνει σε κάθε render) — αλλιώς ο χρονομετρητής θα ξεκινούσε ξανά.
  const onProgressRef = useRef(onProgress)
  useEffect(() => { onProgressRef.current = onProgress }, [onProgress])

  useEffect(() => {
    let alive = true
    let last = -1
    const tick = async () => {
      const r = await stockImportStatusAction().catch(() => null)
      if (!alive || !r) return
      setStatus(r.status); setProviders(r.providers)
      if (r.status.imported !== last) { if (last >= 0) onProgressRef.current?.(); last = r.status.imported }
    }
    void tick()
    const t = setInterval(() => void tick(), 3000)
    return () => { alive = false; clearInterval(t) }
  }, [])

  async function start() {
    setStarting(true)
    const r = await startStockImportAction(target)
    setStarting(false)
    if (!r.ok) { toast.error(r.error); return }
    toast.success('Η εισαγωγή ξεκίνησε στο παρασκήνιο — μπορείτε να συνεχίσετε τη δουλειά σας.')
  }

  const running = status?.state === 'running'
  const pct = status && status.target ? Math.min(100, Math.round((status.imported / status.target) * 100)) : 0

  return (
    <div className="flex flex-col gap-3">
      <div className="glass p-4">
        <h2 className="text-[length:var(--fs-16)] font-semibold">Δωρεάν φωτογραφίες για τα ευρωπαϊκά προγράμματα</h2>
        <p className="mb-3 text-[length:var(--fs-13)] text-muted-foreground">
          Επαγγελματίες, επαγγέλματα και ομάδες σε 8 κλάδους (γραφείο, βιομηχανία, τουρισμός, αγροτικά, υγεία, λιανική, τεχνολογία, πράσινη ενέργεια) από Pexels/Pixabay — δωρεάν άδεια εμπορικής χρήσης. Κάθε εικόνα γίνεται WebP έως 1920px και μπαίνει στον φάκελο «Επαγγέλματα & Επιχειρήσεις». Μπορεί να ξανατρέξει: συνεχίζει χωρίς διπλότυπα.
        </p>
        {!providers.length ? (
          <p className="rounded-xl bg-amber-500/10 px-3 py-2 text-[length:var(--fs-13)]">
            <AlertTriangle className="mr-1 inline size-4 text-amber-600" aria-hidden />
            Πρόσθεσε δωρεάν κλειδί <b>Pexels</b> (pexels.com/api) ή/και <b>Pixabay</b> (pixabay.com/api/docs) στις <a href="/settings" className="font-semibold text-primary underline">Ρυθμίσεις → Διασυνδέσεις</a>.
          </p>
        ) : (
          <div className="flex flex-wrap items-end gap-3">
            <label className="flex flex-col gap-1 text-[length:var(--fs-12-5)] text-muted-foreground">
              Πόσες εικόνες
              <input type="number" min={10} max={1000} step={10} value={target} onChange={e => setTarget(Number(e.target.value) || 500)} disabled={running}
                className="h-10 w-28 rounded-lg border border-input bg-card px-3 text-[length:var(--fs-14)] text-foreground tabular-nums outline-none focus:border-primary" />
            </label>
            <Button type="button" onClick={() => void start()} disabled={starting || running}>
              {starting || running ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              {running ? 'Εισαγωγή σε εξέλιξη…' : 'Έναρξη εισαγωγής'}
            </Button>
            <span className="text-[length:var(--fs-12)] text-muted-foreground">Πάροχοι: {providers.map(p => (p === 'pexels' ? 'Pexels' : 'Pixabay')).join(' + ')}</span>
          </div>
        )}

        {status && status.state !== 'idle' && (
          <div className="mt-4 space-y-2">
            <div className="flex items-center justify-between text-[length:var(--fs-13)]">
              <span className="flex items-center gap-1.5 font-medium">
                {status.state === 'done' && <CheckCircle2 className="size-4 text-emerald-600" aria-hidden />}
                {status.state === 'error' && <AlertTriangle className="size-4 text-destructive" aria-hidden />}
                {status.state === 'running' ? (status.current ?? 'Ξεκινά…') : status.state === 'done' ? 'Ολοκληρώθηκε' : 'Σφάλμα'}
              </span>
              <span className="tabular-nums text-muted-foreground">{status.imported} / {status.target}</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-primary transition-[width] duration-500" style={{ width: `${pct}%` }} />
            </div>
            <p className="text-[length:var(--fs-12)] text-muted-foreground">
              {status.skipped ? `${status.skipped} υπήρχαν ήδη · ` : ''}{status.failed ? `${status.failed} απέτυχαν · ` : ''}
              {Object.entries(status.byFolder).map(([f, n]) => `${f}: ${n}`).join(' · ')}
            </p>
            {status.error && <p className="text-[length:var(--fs-13)] text-destructive" role="alert">{status.error}</p>}
          </div>
        )}
      </div>

      <div className="glass p-4">
        <h3 className="text-[length:var(--fs-14)] font-semibold">Premium επιλογές από Envato Elements (συνδρομή)</h3>
        <p className="mb-2 text-[length:var(--fs-12-5)] text-muted-foreground">Για τα σημαντικά σημεία (αρχική, banners): ανοίξτε την αναζήτηση, κατεβάστε με τη συνδρομή και ανεβάστε από το «Μεταφόρτωση» — γίνονται αυτόματα WebP.</p>
        <div className="flex flex-wrap gap-2">
          {ELEMENTS_PICKS.map(([label, q]) => (
            <a key={q} href={`https://elements.envato.com/photos/${encodeURIComponent(q.replace(/\s+/g, '-'))}`} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[length:var(--fs-12-5)] hover:border-primary hover:text-primary">
              {label} <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ))}
        </div>
      </div>
    </div>
  )
}
