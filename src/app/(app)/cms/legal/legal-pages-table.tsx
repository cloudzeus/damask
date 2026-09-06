'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, CircleDashed, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { SeedLegalButton } from './seed-legal-button'
import { LegalPageRowActions } from './legal-page-row-actions'

export type LegalPageRow = {
  id: string
  slug: string
  published: boolean
  titleEl: string
  hasEn: boolean
  updatedLabel: string
}

export function LegalPagesTable({ pages, canEdit }: { pages: LegalPageRow[]; canEdit: boolean }) {
  const [query, setQuery] = useState('')

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return pages
    return pages.filter(p => p.titleEl.toLowerCase().includes(q) || p.slug.toLowerCase().includes(q))
  }, [pages, query])

  const columns: DataTableColumn<LegalPageRow>[] = [
    {
      id: 'title',
      header: 'Τίτλος',
      width: 280,
      enableHide: false,
      sortValue: p => p.titleEl,
      cell: p => (
        <div className="flex flex-wrap items-center gap-1.5">
          <span className="font-semibold">{p.titleEl}</span>
          <span className={cn('badge-pill', p.hasEn ? 'ok' : 'muted')} title={p.hasEn ? 'Υπάρχει αγγλική μετάφραση' : 'Δεν υπάρχει αγγλική μετάφραση'}>
            EN {p.hasEn ? '✓' : '—'}
          </span>
        </div>
      ),
    },
    {
      id: 'slug',
      header: 'Slug',
      width: 200,
      sortValue: p => p.slug,
      cell: p => <span className="text-muted-foreground">/legal/{p.slug}</span>,
    },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 160,
      sortValue: p => (p.published ? 1 : 0),
      cell: p => (
        p.published ? (
          <span className="badge-pill ok">
            <CheckCircle2 className="size-3" strokeWidth={2.2} aria-hidden /> Δημοσιευμένο
          </span>
        ) : (
          <span className="badge-pill muted">
            <CircleDashed className="size-3" strokeWidth={2.2} aria-hidden /> Πρόχειρο
          </span>
        )
      ),
    },
    {
      id: 'updated',
      header: 'Ενημερώθηκε',
      width: 150,
      sortValue: p => p.updatedLabel,
      cell: p => p.updatedLabel,
    },
    ...(canEdit
      ? ([
          {
            id: 'actions',
            header: '⋯',
            headerLabel: 'Ενέργειες',
            align: 'center',
            width: 48,
            enableHide: false,
            enableResize: false,
            cell: p => <LegalPageRowActions page={p} />,
          },
        ] as DataTableColumn<LegalPageRow>[])
      : []),
  ]

  return (
    <DataTable
      tableId="cms-legal"
      columns={columns}
      rows={filtered}
      rowKey={p => p.id}
      emptyMessage={pages.length === 0 ? 'Δεν υπάρχουν σελίδες ακόμα — πάτησε «Δημιουργία βασικών» για να ξεκινήσεις.' : 'Δεν βρέθηκαν σελίδες.'}
      footer={<span>{filtered.length} {filtered.length === 1 ? 'σελίδα' : 'σελίδες'}</span>}
      toolbarExtras={
        <>
          <label className="search">
            <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            <input
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Αναζήτηση με τίτλο ή slug…"
              aria-label="Αναζήτηση σελίδων"
            />
          </label>
          {canEdit && (
            <>
              <SeedLegalButton />
              <Link href="/cms/legal/new" className="btn-pill btn-navy h-9 px-4 text-[0.78125rem]">
                <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέα σελίδα
              </Link>
            </>
          )}
        </>
      }
    />
  )
}
