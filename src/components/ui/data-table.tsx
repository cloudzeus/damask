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
import { Columns3, WrapText } from 'lucide-react'

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
  className?: string
}

type SortState = { columnId: string; dir: 'asc' | 'desc' } | null

type PersistShape = {
  hidden?: string[]
  widths?: Record<string, number>
  sort?: SortState
  wrap?: boolean
}

const DEFAULT_WIDTH = 160
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
  fillHeight = true,
  pageSize = 80,
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
  /** Ο πίνακας γεμίζει το διαθέσιμο ύψος (viewport) με sticky header + εσωτερικό
   * scroll. Default true — full-height όταν ο πίνακας είναι το τελευταίο pane της
   * σελίδας· πέρασε `fillHeight={false}` σε σελίδες με πάνελ/πίνακες από κάτω. */
  fillHeight?: boolean
  /** Click σε ολόκληρη τη γραμμή. Κελιά με δικές τους ενέργειες (π.χ. actions
   * menu) πρέπει να κάνουν stopPropagation στο δικό τους wrapper. */
  onRowClick?: (row: T) => void
  /** Cap ορατών γραμμών (client-side) για μεγάλο όγκο — αποφυγή βαρύ DOM. Οι
   * υπόλοιπες φορτώνονται με «Δείξε περισσότερα». */
  pageSize?: number
}) {
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

  const sortedRows = React.useMemo(() => {
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
  }, [rows, sort, columns])

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

  return (
    <div className={cn(bare ? 'dt-bare' : 'glass table-card stagger', fillHeight && 'dt-fill', className)}>
      <div className="table-toolbar">
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

      <div className="table-wrap">
        <table className={cn('data-table dt-fixed', wrap && 'dt-wrap')}>
          <colgroup>
            {visibleColumns.map(c => (
              <col key={c.id} style={{ width: widths[c.id] ?? c.width ?? DEFAULT_WIDTH }} />
            ))}
          </colgroup>
          <thead>
            <tr>
              {visibleColumns.map(c => {
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
          <tbody>
            {sortedRows.slice(0, visibleCount).map(row => (
              <tr
                key={rowKey(row)}
                className={cn('dotted-row-bottom', onRowClick && 'cursor-pointer', rowClassName?.(row))}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
              >
                {visibleColumns.map(c => (
                  <td
                    key={c.id}
                    className={cn(c.align === 'center' && 'ctr', c.align === 'right' && 'num', c.nowrap && 'dt-nowrap')}
                  >
                    {c.cell(row)}
                  </td>
                ))}
              </tr>
            ))}
            {sortedRows.length > visibleCount && (
              <tr>
                <td colSpan={visibleColumns.length} className="py-3 text-center">
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
                <td colSpan={visibleColumns.length} className="py-8 text-center text-muted-foreground">
                  {emptyMessage}
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
