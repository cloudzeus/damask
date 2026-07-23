'use client'

import * as React from 'react'
import { Search, Loader2, ChevronRight, ChevronDown, MapPin } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  regionChildrenAction,
  regionDecodeAction,
  type RegionChildNode,
  type DecodedRegion,
} from '@/lib/registries/actions'

/**
 * `/regions` client view — self-contained, ίδιο idiom με deadlines-view.tsx /
 * pm-workspace.tsx (glass cards, badge-pill, dotted-leader — όχι raw Tailwind
 * χρώματα σαν το reference PIM). Δύο ενότητες: (a) Decoder — κωδικός/όνομα →
 * ιεραρχία + παιδιά· (b) Lazy δέντρο από τα level-3 (Περιφέρειες), κάθε
 * expand φορτώνει παιδιά μέσω server action και τα cache-άρει τοπικά.
 */

const LEVEL_LABEL: Record<number, string> = { 3: 'Περιφέρεια', 4: 'Π.Ε. / Νομός', 5: 'Δήμος' }

function LevelBadge({ level }: { level: number }) {
  return <span className={level === 3 ? 'badge-pill info' : 'badge-pill muted'}>{LEVEL_LABEL[level] ?? `L${level}`}</span>
}

function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export function RegionsView({ total }: { total: number }) {
  const [roots, setRoots] = React.useState<RegionChildNode[] | null>(null)
  const [rootsError, setRootsError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    regionChildrenAction(null)
      .then(nodes => { if (!cancelled) setRoots(nodes) })
      .catch(err => { if (!cancelled) setRootsError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης δέντρου') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <RegionDecoder />

      <section className="glass rounded-[22px] p-4">
        <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Ιεραρχικό δέντρο
        </div>

        {rootsError && <p className="py-4 text-center text-[12.5px] text-destructive">{rootsError}</p>}

        {!rootsError && roots === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Φόρτωση…
          </div>
        )}

        {!rootsError && roots !== null && roots.length === 0 && (
          <p className="py-8 text-center text-[12.5px] text-muted-foreground">
            Δεν υπάρχουν δεδομένα ({total.toLocaleString('el-GR')} εγγραφές συνολικά).
          </p>
        )}

        {roots !== null && roots.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {roots.map(r => <RegionNode key={r.code} node={r} depth={0} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

function RegionDecoder() {
  const [input, setInput] = React.useState('')
  const [result, setResult] = React.useState<DecodedRegion | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searched, setSearched] = React.useState(false)

  const decode = React.useCallback(async () => {
    const q = input.trim()
    if (!q) { setError('Εισάγετε κωδικό ή όνομα'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await regionDecodeAction(q)
      setResult(res)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα αναζήτησης')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [input])

  const chain = result
    ? ([result.breadcrumb.region, result.breadcrumb.regionalUnit, result.breadcrumb.municipality].filter(Boolean) as { code: string; nameEL: string }[])
    : []

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αναζήτηση περιοχής
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="π.χ. 1110202 ή «Δοξάτου»"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') decode() }}
          disabled={loading}
        />
        <Button type="button" onClick={decode} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Αναζήτηση
        </Button>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
      {searched && !error && !result && <p className="mt-3 text-[12.5px] text-muted-foreground">Δεν βρέθηκε περιοχή με αυτόν τον κωδικό/όνομα.</p>}

      {result && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-mono text-[13px] font-semibold">{result.code}</span>
            <span className="text-[13px]">{result.nameEL}</span>
            <LevelBadge level={result.level} />
            {formatCoords(result.latitude, result.longitude) && (
              <span className="text-[11px] text-muted-foreground">{formatCoords(result.latitude, result.longitude)}</span>
            )}
          </div>

          {chain.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              {chain.map((c, i) => (
                <React.Fragment key={c.code}>
                  {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                  <span>{c.nameEL}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {result.children.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Υποδιαιρέσεις ({result.children.length})</div>
              <ul className="flex max-h-56 flex-col overflow-auto">
                {result.children.map(c => (
                  <li key={c.code} className="dotted-row-bottom flex items-center gap-2 py-1.5 text-[12.5px]">
                    <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{c.code}</span>
                    <span>{c.nameEL}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function RegionNode({ node, depth }: { node: RegionChildNode; depth: number }) {
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [children, setChildren] = React.useState<RegionChildNode[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const coords = formatCoords(node.latitude, node.longitude)

  const toggle = React.useCallback(async () => {
    if (!node.hasChildren) return
    if (!expanded && children === null) {
      setLoading(true)
      setError(null)
      try {
        const kids = await regionChildrenAction(node.code)
        setChildren(kids)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης')
      } finally {
        setLoading(false)
      }
    }
    setExpanded(v => !v)
  }, [node.hasChildren, node.code, expanded, children])

  return (
    <li>
      <div className="flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-1.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!node.hasChildren}
          aria-label={node.hasChildren ? (expanded ? 'Σύμπτυξη' : 'Ανάπτυξη') : undefined}
          className="flex size-5 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : node.hasChildren ? (
            expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
          ) : (
            <span className="size-1.5 rounded-full bg-border" />
          )}
        </button>

        <span className="w-24 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{node.code}</span>
        <span className="truncate text-[12.5px] font-medium">{node.nameEL}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {coords && <span className="text-[10.5px] text-muted-foreground">{coords}</span>}
          {node.descendants > 0 && (
            <span className="badge-pill muted">{node.directChildren.toLocaleString('el-GR')} άμεσα · {node.descendants.toLocaleString('el-GR')} συνολικά</span>
          )}
          <LevelBadge level={node.level} />
        </div>
      </div>

      {error && <p className="mt-1 ml-7 text-[11.5px] text-destructive">{error}</p>}

      {expanded && children && children.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5" style={{ paddingLeft: (depth + 1) * 20 }}>
          {children.map(c => <RegionNode key={c.code} node={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  )
}
