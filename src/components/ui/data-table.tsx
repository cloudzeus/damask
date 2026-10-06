'use client'

/**
 * DataTable engine (Φάση 2) — κοινό component για ΟΛΟΥΣ τους πίνακες της
 * εφαρμογής. Παρέχει, πάνω από το υπάρχον `.data-table` styling:
 *   • Sorting σε κάθε στήλη με sortValue (click στην κεφαλίδα, asc→desc→off).
 *   • Επιλογή ορατών στηλών («Στήλες ▾» chooser).
 *   • Resize στηλών με drag + toggle «Αναδίπλωση» (wrap κειμένου).
 *   • Persistence προτιμήσεων ανά χρήστη/πίνακα σε localStorage (key `dt:<tableId>`).
 *
 * Κάθε πίνακας «μεταφράζεται» σε columns: DataTableColumn<T>[] + rows: T[]. Τα
 * κελιά μένουν πλήρως custom μέσω `cell(row)` — δεν χάνεται κανένα avatar/link/
 * badge/action. Καθαρά client-side (καμία εξάρτηση από server data-fetching).
 */

import * as React from 'react'
import { cn } from '@/lib/utils'
import { Columns3, WrapText, ChevronRight, Search, X } from 'lucide-react'

export type DataTableColumn<T> = {
  /** Σταθερό key — χρησιμοποιείται για persistence ορατότητας/πλάτους. */
  id: string
  header: React.ReactNode
  cell: (row: T) => React.ReactNode
  /** Αν οριστεί, η στήλη γίνεται sortable με βάση αυτή την τιμή. */
  sortValue?: (row: T) => string | number | boolean | null | undefined
  align?: 'left' | 'center' | 'right'
  /** Αρχικό πλάτος σε px (default 160). */
  width?: number
  minWidth?: number
  /** false = πάντα ορατή (δεν εμφανίζεται στον chooser). Default true. */
  enableHide?: boolean
  /** false = χωρίς λαβή resize. Default true. */
  enableResize?: boolean
  /** Καθαρό κείμενο για τον chooser όταν το `header` είναι JSX. */
  headerLabel?: string
  /** Κρατά nowrap ακόμη και σε wrap mode (π.χ. αριθμητικοί κωδικοί). */
  nowrap?: boolean
  /** Κείμενο για την ενσωματωμένη αναζήτηση. Default: η τιμή του `sortValue`. */
  searchValue?: (row: T) => string | number | null | undefined
  className?: string
}

/** Πεζά + χωρίς τόνους — «Αθήνα» ταιριάζει με «αθηνα». */
function fold(v: unknown): string {
  return String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
}

type SortState = { columnId: string; dir: 'asc' | 'desc' } | null

type PersistShape = {
  hidden?: string[]
  widths?: Record<string, number>
  sort?: SortState
  wrap?: boolean
}

const DEFAULT_WIDTH = 160
const EXPAND_COL = 40
const MIN_WIDTH = 60

export function DataTable<T>({
  tableId,
  columns,
  rows,
  rowKey,
  initialSort = null,
  emptyMessage = 'Δεν βρέθηκαν εγγραφές.',
  toolbarExtras,
  footer,
  className,
  rowClassName,
  onRowClick,
  bare = false,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars -- deprecated no-op (βλ. τύπο)
  fillHeight: _fillHeight,
  pageSize = 80,
  renderExpanded,
  searchable = true,
  searchPlaceholder = 'Αναζήτηση…',
}: {
  tableId: string
  columns: DataTableColumn<T>[]
  rows: T[]
  rowKey: (row: T) => string
  initialSort?: SortState
  emptyMessage?: React.ReactNode
  toolbarExtras?: React.ReactNode
  footer?: React.ReactNode
  className?: string
  rowClassName?: (row: T) => string
  /** Χωρίς το glass-card wrapper — για ενσωμάτωση μέσα σε υπάρχον section. */
  bare?: boolean
  /** @deprecated No-op. Οι πίνακες ΔΕΝ έχουν πλέον δικό τους κάθετο scroll — απλώνονται
   * σε όλο τους το ύψος και ο μόνος κάθετος scroller είναι της σελίδας (απαίτηση
   * χρήστη). Κρατιέται μόνο για συμβατότητα με τις υπάρχουσες κλήσεις. */
  fillHeight?: boolean
  /** Click σε ολόκληρη τη γραμμή. Κελιά με δικές τους ενέργειες (π.χ. actions
   * menu) πρέπει να κάνουν stopPropagation στο δικό τους wrapper. */
  onRowClick?: (row: T) => void
  /** Cap ορατών γραμμών (client-side) για μεγάλο όγκο — αποφυγή βαρύ DOM. Οι
   * υπόλοιπες φορτώνονται με «Δείξε περισσότερα». */
  pageSize?: number
  /** Αν οριστεί, κάθε γραμμή αποκτά λαβή ▸ που ανοίγει expanded panel από κάτω
   * (π.χ. υπο-λίστα). Το περιεχόμενο αποδίδεται lazy μόνο όταν ανοίγει. */
  renderExpanded?: (row: T) => React.ReactNode
  /** Ενσωματωμένη αναζήτηση στη γραμμή εργαλείων (πάνω στα searchValue/sortValue
   * των στηλών). false όταν η σελίδα έχει ήδη δική της αναζήτηση. */
  searchable?: boolean
  searchPlaceholder?: string
}) {
  const [query, setQuery] = React.useState('')
  const [expanded, setExpanded] = React.useState<Set<string>>(new Set())
  const hasExpand = !!renderExpanded
  const [hidden, setHidden] = React.useState<Set<string>>(new Set())
  const [widths, setWidths] = React.useState<Record<string, number>>({})
  const [sort, setSort] = React.useState<SortState>(initialSort)
  const [wrap, setWrap] = React.useState(false)
  const [visibleCount, setVisibleCount] = React.useState(pageSize)
  const [colsOpen, setColsOpen] = React.useState(false)
  const hydrated = React.useRef(false)

  // ── Persistence: load once on mount, then save on every change ────────────
  // Το read γίνεται σε effect (όχι lazy initializer) ώστε το SSR HTML να μένει
  // στα defaults και να μη σπάει η hydration· οι setState μπαίνουν σε nested
  // function (όχι απευθείας στο effect body) — αλλιώς σκάει το react-hooks lint.
  React.useEffect(() => {
    const hydrateFromStorage = () => {
      try {
        const raw = localStorage.getItem(`dt:${tableId}`)
        if (raw) {
          const p = JSON.parse(raw) as PersistShape
          if (Array.isArray(p.hidden)) setHidden(new Set(p.hidden))
          if (p.widths && typeof p.widths === 'object') setWidths(p.widths)
          if (p.sort !== undefined) setSort(p.sort)
          if (typeof p.wrap === 'boolean') setWrap(p.wrap)
        }
      } catch {
        /* private mode / corrupt value — αγνόησε, μένουμε στα defaults */
      }
      hydrated.current = true
    }
    hydrateFromStorage()
  }, [tableId])

  React.useEffect(() => {
    if (!hydrated.current) return
    try {
      localStorage.setItem(`dt:${tableId}`, JSON.stringify({ hidden: [...hidden], widths, sort, wrap }))
    } catch {
      /* quota / private mode — αγνόησε */
    }
  }, [tableId, hidden, widths, sort, wrap])

  const visibleColumns = columns.filter(c => !hidden.has(c.id))
  const hideableColumns = columns.filter(c => c.enableHide !== false)

  const searchCols = columns.filter(c => c.searchValue || c.sortValue)
  const showSearch = searchable && searchCols.length > 0
  const filteredRows = React.useMemo(() => {
    const q = fold(query.trim())
    if (!showSearch || !q) return rows
    const terms = q.split(/\s+/)
    return rows.filter(r => {
      const hay = searchCols.map(c => fold((c.searchValue ?? c.sortValue)!(r))).join(' ')
      return terms.every(t => hay.includes(t))
    })
    // searchCols παράγεται από columns — αρκεί αυτό ως dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, query, showSearch, columns])

  const sortedRows = React.useMemo(() => {
    const rows = filteredRows
    if (!sort) return rows
    const col = columns.find(c => c.id === sort.columnId)
    if (!col?.sortValue) return rows
    const getv = col.sortValue
    const dir = sort.dir === 'asc' ? 1 : -1
    return [...rows].sort((a, b) => {
      const va = getv(a)
      const vb = getv(b)
      if (va == null && vb == null) return 0
      if (va == null) return 1
      if (vb == null) return -1
      if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * dir
      if (typeof va === 'boolean' && typeof vb === 'boolean') return (Number(va) - Number(vb)) * dir
      return String(va).localeCompare(String(vb), 'el') * dir
    })
  }, [filteredRows, sort, columns])

  function toggleSort(col: DataTableColumn<T>) {
    if (!col.sortValue) return
    setSort(prev => {
      if (!prev || prev.columnId !== col.id) return { columnId: col.id, dir: 'asc' }
      if (prev.dir === 'asc') return { columnId: col.id, dir: 'desc' }
      return null
    })
  }

  // ── Column resize (drag on the th right edge) ─────────────────────────────
  const resizing = React.useRef<{ id: string; startX: number; startW: number } | null>(null)
  React.useEffect(() => {
    function onMove(e: MouseEvent) {
      const r = resizing.current
      if (!r) return
      const col = columns.find(c => c.id === r.id)
      const min = col?.minWidth ?? MIN_WIDTH
      setWidths(prev => ({ ...prev, [r.id]: Math.max(min, r.startW + (e.clientX - r.startX)) }))
    }
    function onUp() {
      if (resizing.current) {
        resizing.current = null
        document.body.style.userSelect = ''
      }
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [columns])

  function startResize(e: React.MouseEvent, col: DataTableColumn<T>) {
    e.preventDefault()
    e.stopPropagation()
    resizing.current = { id: col.id, startX: e.clientX, startW: widths[col.id] ?? col.width ?? DEFAULT_WIDTH }
    // eslint-disable-next-line react-hooks/immutability -- σκόπιμη DOM side-effect κατά το drag
    document.body.style.userSelect = 'none'
  }

  function labelFor(c: DataTableColumn<T>): string {
    return c.headerLabel ?? (typeof c.header === 'string' ? c.header : c.id)
  }

  // ── Χωρίς οριζόντιο scroll: ό,τι δεν χωράει πάει στο expandable panel ──────
  // Μετράμε το διαθέσιμο πλάτος· η 1η στήλη, οι ενέργειες και όσες έχουν
  // enableHide:false μένουν πάντα ορατές. Οι υπόλοιπες μπαίνουν με τη σειρά τους
  // όσο χωράνε· από την πρώτη που δεν χωρά και μετά εμφανίζονται στο ▸ panel.
  const measureRef = React.useRef<HTMLDivElement>(null)
  const [avail, setAvail] = React.useState<number | null>(null)
  React.useEffect(() => {
    const el = measureRef.current
    if (!el) return
    const ro = new ResizeObserver(entries => setAvail(Math.floor(entries[0].contentRect.width)))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])
  const widthOf = React.useCallback((c: DataTableColumn<T>) => widths[c.id] ?? c.width ?? DEFAULT_WIDTH, [widths])
  const { shownColumns, collapsedColumns } = React.useMemo(() => {
    const total = visibleColumns.reduce((n, c) => n + widthOf(c), 0) + (hasExpand ? EXPAND_COL : 0)
    if (avail == null || total <= avail) return { shownColumns: visibleColumns, collapsedColumns: [] as DataTableColumn<T>[] }
    const pinned = (c: DataTableColumn<T>, i: number) => i === 0 || c.enableHide === false || c.id === 'actions' || c.id === 'select'
    let budget = avail - EXPAND_COL - visibleColumns.reduce((n, c, i) => n + (pinned(c, i) ? widthOf(c) : 0), 0)
    let overflowing = false
    const keep = new Set<string>()
    visibleColumns.forEach((c, i) => {
      if (pinned(c, i)) { keep.add(c.id); return }
      if (!overflowing && widthOf(c) <= budget) { budget -= widthOf(c); keep.add(c.id); return }
      overflowing = true
    })
    return {
      shownColumns: visibleColumns.filter(c => keep.has(c.id)),
      collapsedColumns: visibleColumns.filter(c => !keep.has(c.id)),
    }
  }, [visibleColumns, avail, widthOf, hasExpand])
  const showExpand = hasExpand || collapsedColumns.length > 0

  // Κοινό colgroup για τον sticky πίνακα-επικεφαλίδα ΚΑΙ τον πίνακα-σώμα.
  const colgroup = (
    <colgroup>
      {showExpand && <col style={{ width: EXPAND_COL }} />}
      {shownColumns.map(c => (
        <col key={c.id} style={{ width: widths[c.id] ?? c.width ?? DEFAULT_WIDTH }} />
      ))}
    </colgroup>
  )

  const headWrapRef = React.useRef<HTMLDivElement>(null)
  const bodyWrapRef = React.useRef<HTMLDivElement>(null)
  function syncHeadScroll() {
    if (headWrapRef.current && bodyWrapRef.current) headWrapRef.current.scrollLeft = bodyWrapRef.current.scrollLeft
  }

  return (
    <div className={cn(bare ? 'dt-bare' : 'glass table-card stagger', className)}>
      <div ref={measureRef} className="dt-measure" aria-hidden />
      <div className="table-toolbar">
        {showSearch && (
          <label className="search dt-search">
            <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            <input
              type="search"
              value={query}
              onChange={e => { setQuery(e.target.value); setVisibleCount(pageSize) }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
            />
            {query && (
              <button type="button" onClick={() => setQuery('')} aria-label="Καθαρισμός αναζήτησης" className="shrink-0 text-muted-foreground hover:text-foreground">
                <X className="size-3.5" aria-hidden />
              </button>
            )}
          </label>
        )}
        {toolbarExtras}
        <div className="flex-1" />
        <button
          type="button"
          className={cn('pill', wrap && 'on')}
          onClick={() => setWrap(w => !w)}
          aria-pressed={wrap}
          title="Αναδίπλωση κειμένου στα κελιά"
        >
          <WrapText className="size-3.5" strokeWidth={1.8} aria-hidden /> Αναδίπλωση
        </button>
        <div className="dt-cols">
          <button type="button" className="pill" onClick={() => setColsOpen(o => !o)} aria-expanded={colsOpen}>
            <Columns3 className="size-3.5" strokeWidth={1.8} aria-hidden /> Στήλες ▾
          </button>
          {colsOpen && (
            <>
              <div className="dt-cols-backdrop" onClick={() => setColsOpen(false)} aria-hidden />
              <div className="dt-cols-panel" role="menu">
                {hideableColumns.map(c => (
                  <label key={c.id} className="dt-cols-item">
                    <input
                      type="checkbox"
                      checked={!hidden.has(c.id)}
                      onChange={() =>
                        setHidden(prev => {
                          const next = new Set(prev)
                          if (next.has(c.id)) next.delete(c.id)
                          else next.add(c.id)
                          return next
                        })
                      }
                    />
                    <span>{labelFor(c)}</span>
                  </label>
                ))}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Sticky επικεφαλίδα σε ΞΕΧΩΡΙΣΤΟ πίνακα: το .table-wrap έχει overflow-x
          (για φαρδιούς πίνακες), που το κάνει scroll container — ένα sticky thead
          μέσα του θα κολλούσε σε αυτό, όχι στη σελίδα. Ίδιο colgroup + fixed
          layout ⇒ οι στήλες στοιχίζονται ακριβώς· το οριζόντιο scroll συγχρονίζεται. */}
      <div className="dt-sticky-head" ref={headWrapRef}>
        <table className={cn('data-table dt-fixed', wrap && 'dt-wrap')}>
          {colgroup}
          <thead>
            <tr>
              {showExpand && <th className="ctr" aria-hidden />}
              {shownColumns.map(c => {
                const sortable = !!c.sortValue
                const sortedHere = sort?.columnId === c.id
                return (
                  <th
                    key={c.id}
                    className={cn(
                      c.align === 'center' && 'ctr',
                      c.align === 'right' && 'num',
                      sortable && 'sortable',
                      sortedHere && 'sorted',
                      c.className,
                    )}
                    onClick={sortable ? () => toggleSort(c) : undefined}
                  >
                    {c.header}
                    {sortedHere && <span className="sarr">{sort!.dir === 'asc' ? '▲' : '▼'}</span>}
                    {c.enableResize !== false && (
                      <span
                        className="dt-resizer"
                        onMouseDown={e => startResize(e, c)}
                        onClick={e => e.stopPropagation()}
                        aria-hidden
                      />
                    )}
                  </th>
                )
              })}
            </tr>
          </thead>
        </table>
      </div>

      <div className="table-wrap" ref={bodyWrapRef} onScroll={syncHeadScroll}>
        <table className={cn('data-table dt-fixed', wrap && 'dt-wrap')}>
          {colgroup}
          <tbody>
            {sortedRows.slice(0, visibleCount).map(row => {
              const key = rowKey(row)
              const isOpen = showExpand && expanded.has(key)
              return (
                <React.Fragment key={key}>
                  <tr
                    className={cn('dotted-row-bottom', onRowClick && 'cursor-pointer', rowClassName?.(row))}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                  >
                    {showExpand && (
                      <td className="ctr">
                        <button
                          type="button"
                          aria-expanded={isOpen}
                          aria-label={isOpen ? 'Σύμπτυξη' : 'Ανάπτυξη'}
                          className="inline-flex size-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                          onClick={e => {
                            e.stopPropagation()
                            setExpanded(prev => {
                              const next = new Set(prev)
                              if (next.has(key)) next.delete(key)
                              else next.add(key)
                              return next
                            })
                          }}
                        >
                          <ChevronRight className={cn('size-4 transition-transform', isOpen && 'rotate-90')} aria-hidden />
                        </button>
                      </td>
                    )}
                    {shownColumns.map(c => (
                      <td
                        key={c.id}
                        className={cn(c.align === 'center' && 'ctr', c.align === 'right' && 'num', c.nowrap && 'dt-nowrap')}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                  </tr>
                  {isOpen && (
                    <tr className="dt-expanded">
                      <td colSpan={shownColumns.length + 1} className="p-0">
                        {collapsedColumns.length > 0 && (
                          <dl className="dt-overflow">
                            {collapsedColumns.map(c => (
                              <div key={c.id} className="dt-overflow-item">
                                <dt>{labelFor(c)}</dt>
                                <dd>{c.cell(row)}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                        {renderExpanded?.(row)}
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              )
            })}
            {sortedRows.length > visibleCount && (
              <tr>
                <td colSpan={shownColumns.length + (showExpand ? 1 : 0)} className="py-3 text-center">
                  <button
                    type="button"
                    onClick={() => setVisibleCount(c => c + pageSize)}
                    className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-1.5 text-[0.78125rem] font-semibold text-foreground transition-colors hover:bg-muted"
                  >
                    Δείξε περισσότερα ({sortedRows.length - visibleCount})
                  </button>
                </td>
              </tr>
            )}
            {sortedRows.length === 0 && (
              <tr>
                <td colSpan={shownColumns.length + (showExpand ? 1 : 0)} className="py-8 text-center text-muted-foreground">
                  {query.trim() && rows.length > 0 ? `Κανένα αποτέλεσμα για «${query.trim()}».` : emptyMessage}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {footer && <div className="table-foot dotted-row-top">{footer}</div>}
    </div>
  )
}
