'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import { Loader2, Play, ExternalLink, CheckCircle2, AlertTriangle, Sparkles } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { stockImportStatusAction, startStockImportAction, elementsStatusAction, tagElementsNowAction, type ElementsPick } from '@/app/(app)/media/actions'
import type { StockImportStatus } from '@/lib/stock/bulk-import'


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
            <span className="text-[length:var(--fs-12)] text-muted-foreground">Πάροχοι: {providers.map(p => (p === 'pexels' ? 'Pexels' : p === 'pixabay' ? 'Pixabay' : 'Openverse (κοινό κτήμα)')).join(' + ')}</span>
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

      <ElementsPanel />
    </div>
  )
}

const elementsSearch = (q: string) => `https://elements.envato.com/photos/${encodeURIComponent(q.trim().toLowerCase().replace(/\s+/g, '-'))}`

/**
 * Envato Elements (συνδρομή): ο χρήστης κατεβάζει από το Elements και ανεβάζει στον φάκελο «Envato Elements» →
 * η AI τις περιγράφει και τα άρθρα τις παίρνουν ΠΡΩΤΕΣ. Εδώ: τι να κατεβάσει ανά άρθρο + κατάσταση.
 */
function ElementsPanel() {
  const [st, setSt] = useState<{ total: number; tagged: number; picks: ElementsPick[] } | null>(null)
  const [busy, setBusy] = useState(false)
  const load = () => void elementsStatusAction().then(setSt).catch(() => {})
  useEffect(() => { let alive = true; void elementsStatusAction().then(r => { if (alive) setSt(r) }).catch(() => {}); return () => { alive = false } }, [])
  async function tagNow() {
    setBusy(true)
    const r = await tagElementsNowAction()
    setBusy(false)
    if (r.ok) toast.success(r.message); else toast.error(r.error)
    load()
  }
  const missing = st?.picks.filter(p => !p.hasElements) ?? []
  return (
    <div className="glass p-4">
      <h3 className="text-[length:var(--fs-14)] font-semibold">Envato Elements (συνδρομή) — φωτογραφίες για τα άρθρα</h3>
      <ol className="my-2 list-decimal space-y-1 pl-5 text-[length:var(--fs-13)] text-muted-foreground">
        <li>Ανοίξτε την αναζήτηση για κάθε άρθρο (παρακάτω) και κατεβάστε 1-2 φωτογραφίες με τη συνδρομή σας.</li>
        <li>Ρίξτε τα αρχεία στον φάκελο <b>«Envato Elements»</b> του Gallery (καρτέλα «Αρχεία») — κρατούν τις αναλογίες τους.</li>
        <li>Η AI τις περιγράφει αυτόματα και τα άρθρα τις παίρνουν πρώτες (πατήστε «Αντιστοίχιση» για όσα υπάρχουν ήδη).</li>
      </ol>
      <div className="mb-3 flex flex-wrap items-center gap-3 text-[length:var(--fs-13)]">
        <span>Στον φάκελο: <b className="tabular-nums">{st?.total ?? '…'}</b> φωτογραφίες · με περιγραφή: <b className="tabular-nums">{st?.tagged ?? '…'}</b></span>
        <Button type="button" size="sm" variant="outline" disabled={busy} onClick={() => void tagNow()}>
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}Περιγραφή & αντιστοίχιση σε άρθρα
        </Button>
      </div>
      {missing.length > 0 && (
        <>
          <p className="mb-1.5 text-[length:var(--fs-12-5)] font-semibold">Άρθρα χωρίς φωτογραφία Elements ({missing.length})</p>
          <ul className="max-h-80 space-y-1 overflow-y-auto pr-1">
            {missing.map(p => (
              <li key={p.slug} className="flex items-center gap-2 text-[length:var(--fs-12-5)]">
                <span className="min-w-0 flex-1 truncate" title={p.postTitle}>{p.postTitle}</span>
                <a href={elementsSearch(p.query)} target="_blank" rel="noopener noreferrer" className="inline-flex shrink-0 items-center gap-1 rounded-full border border-border px-2.5 py-1 hover:border-primary hover:text-primary">
                  «{p.query}» <ExternalLink className="size-3" aria-hidden />
                </a>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  )
}
