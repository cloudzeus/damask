'use client'

import * as React from 'react'
import { Search, Loader2, ChevronRight, ChevronDown, ShieldAlert, ClipboardList, History } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  kadChildrenAction,
  kadDecodeAction,
  kadSearchAction,
  type KadChildNode,
  type DecodedKad,
  type KadSearchResultItem,
} from '@/lib/registries/actions'

/**
 * `/kad` client view — self-contained, ίδιο idiom με regions-view.tsx (glass
 * cards, badge-pill, dotted-leader). Τέσσερις ενότητες: header stats, search
 * (debounced ≥2 χαρακτήρες), decoder, lazy δέντρο από τομείς (level 1) — όλα
 * με το badge «Άδεια λειτουργίας» όπου το KadSearchResultItem/KadChildNode
 * σηματοδοτεί requiresLicense (T5 extension στο @/lib/registries/kad.ts).
 */

const LEVEL_LABEL: Record<number, string> = {
  1: 'Τομέας', 2: 'Κλάδος', 3: 'Ομάδα', 4: 'Τάξη NACE',
  5: 'Κατηγορία CPA', 6: 'Υποκατηγορία CPA', 7: 'Εθνική δραστηριότητα',
}

function LevelBadge({ level }: { level: number | null }) {
  if (level == null) return null
  return <span className="badge-pill muted">{LEVEL_LABEL[level] ?? `L${level}`}</span>
}

function LicenseBadge() {
  return (
    <span className="badge-pill warn">
      <ShieldAlert className="size-3" aria-hidden /> Άδεια λειτουργίας
    </span>
  )
}

export function KadView({
  total,
  lastImport,
}: {
  total: number
  lastImport: { importedAt: string; totalCodes: number; sourceVersion: string } | null
}) {
  const [roots, setRoots] = React.useState<KadChildNode[] | null>(null)
  const [rootsError, setRootsError] = React.useState<string | null>(null)

  React.useEffect(() => {
    let cancelled = false
    kadChildrenAction(null)
      .then(nodes => { if (!cancelled) setRoots(nodes) })
      .catch(err => { if (!cancelled) setRootsError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης δέντρου') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="glass flex items-center gap-3 rounded-[22px] p-4">
          <span className="icon-pill"><ClipboardList className="size-4" aria-hidden /></span>
          <div>
            <div className="text-[19px] font-semibold tabular-nums">{total.toLocaleString('el-GR')}</div>
            <div className="text-[11.5px] text-muted-foreground">Σύνολο κωδικών ΚΑΔ</div>
          </div>
        </div>
        <div className="glass flex items-center gap-3 rounded-[22px] p-4">
          <span className="icon-pill"><History className="size-4" aria-hidden /></span>
          <div>
            {lastImport ? (
              <>
                <div className="text-[13px] font-semibold">
                  {new Date(lastImport.importedAt).toLocaleDateString('el-GR')} · v{lastImport.sourceVersion}
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Τελευταία εισαγωγή — {lastImport.totalCodes.toLocaleString('el-GR')} κωδικοί
                </div>
              </>
            ) : (
              <div className="text-[12.5px] text-muted-foreground">Δεν έχει καταγραφεί εισαγωγή</div>
            )}
          </div>
        </div>
      </section>

      <KadSearch />
      <KadDecoder />

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
          <p className="py-8 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν δεδομένα.</p>
        )}

        {roots !== null && roots.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {roots.map(r => <KadNode key={r.code} node={r} depth={0} />)}
          </ul>
        )}
      </section>
    </div>
  )
}

function KadSearch() {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<KadSearchResultItem[] | null>(null)
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const trimmed = query.trim()
  const tooShort = trimmed.length < 2

  // Debounced search — all setState calls live inside the timer/promise callbacks
  // (never synchronously in the effect body), so an early "query too short" pass
  // simply skips scheduling anything; the stale `results` from a previous longer
  // query is masked at render time via `tooShort` rather than reset here.
  React.useEffect(() => {
    if (tooShort) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      kadSearchAction(trimmed, 50)
        .then(res => { if (!cancelled) { setResults(res.codes); setTotal(res.total) } })
        .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Σφάλμα αναζήτησης') })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [trimmed, tooShort])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αναζήτηση ΚΑΔ
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          placeholder="Αναζήτηση με κωδικό ή τίτλο (τουλάχιστον 2 χαρακτήρες)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {!tooShort && loading && (
        <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Αναζήτηση…
        </div>
      )}
      {!tooShort && error && <p className="py-4 text-[12.5px] text-destructive">{error}</p>}

      {!tooShort && !loading && !error && results !== null && (
        results.length === 0 ? (
          <p className="py-4 text-[12.5px] text-muted-foreground">Δεν βρέθηκαν αποτελέσματα.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Κωδικός</TableHead>
                  <TableHead>Τίτλος</TableHead>
                  <TableHead>Επίπεδο</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(r => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-[11.5px]">{r.code}</TableCell>
                    <TableCell className="text-[12.5px]">{r.title ?? r.description}</TableCell>
                    <TableCell><LevelBadge level={r.level} /></TableCell>
                    <TableCell>{r.requiresLicense && <LicenseBadge />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {total > results.length && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">Εμφανίζονται {results.length} από {total.toLocaleString('el-GR')} αποτελέσματα.</p>
            )}
          </div>
        )
      )}
    </section>
  )
}

function KadDecoder() {
  const [input, setInput] = React.useState('')
  const [result, setResult] = React.useState<DecodedKad | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searched, setSearched] = React.useState(false)

  const decode = React.useCallback(async () => {
    const q = input.trim()
    if (!q) { setError('Εισάγετε έναν κωδικό ΚΑΔ'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await kadDecodeAction(q)
      setResult(res)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα αναζήτησης')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [input])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αποκωδικοποίηση ΚΑΔ
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="π.χ. 43210000 ή 43.21.00"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') decode() }}
          disabled={loading}
          className="font-mono"
        />
        <Button type="button" onClick={decode} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Αναζήτηση
        </Button>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
      {searched && !error && !result && <p className="mt-3 text-[12.5px] text-muted-foreground">Δεν βρέθηκε ΚΑΔ με αυτόν τον κωδικό.</p>}

      {result && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold">{result.code}</span>
            <span className="text-[13px]">{result.title}</span>
            <LevelBadge level={result.level} />
            {result.sector && <span className="badge-pill info">Τομέας {result.sector}</span>}
          </div>

          {result.hierarchy.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              {result.hierarchy.map((it, i) => (
                <React.Fragment key={it.code}>
                  {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                  <span>{it.title ?? it.code}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {result.children.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Παιδιά ({result.children.length})</div>
              <ul className="flex max-h-56 flex-col overflow-auto">
                {result.children.map(c => (
                  <li key={c.code} className="dotted-row-bottom flex items-center gap-2 py-1.5 text-[12.5px]">
                    <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{c.code}</span>
                    <span>{c.title}</span>
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

function KadNode({ node, depth }: { node: KadChildNode; depth: number }) {
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [children, setChildren] = React.useState<KadChildNode[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)

  const toggle = React.useCallback(async () => {
    if (!node.hasChildren) return
    if (!expanded && children === null) {
      setLoading(true)
      setError(null)
      try {
        const kids = await kadChildrenAction(node.code)
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
        <span className="truncate text-[12.5px] font-medium">{node.title}</span>

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {node.requiresLicense && <LicenseBadge />}
          {node.descendants > 0 && (
            <span className="badge-pill muted">{node.directChildren.toLocaleString('el-GR')} άμεσα · {node.descendants.toLocaleString('el-GR')} συνολικά</span>
          )}
          <LevelBadge level={node.level} />
        </div>
      </div>

      {error && <p className="mt-1 ml-7 text-[11.5px] text-destructive">{error}</p>}

      {expanded && children && children.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5" style={{ paddingLeft: (depth + 1) * 20 }}>
          {children.map(c => <KadNode key={c.code} node={c} depth={depth + 1} />)}
        </ul>
      )}
    </li>
  )
}
