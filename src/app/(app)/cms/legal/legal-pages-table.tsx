'use client'

import { useMemo, useState } from 'react'
import { Search, Plus, CircleDashed, CheckCircle2 } from 'lucide-react'
import Link from 'next/link'
import { cn } from '@/lib/utils'
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

  const colCount = canEdit ? 5 : 4

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
        <label className="search">
          <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
          <input
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Αναζήτηση με τίτλο ή slug…"
            aria-label="Αναζήτηση σελίδων"
          />
        </label>
        <div className="flex-1" />
        {canEdit && (
          <>
            <SeedLegalButton />
            <Link href="/cms/legal/new" className="btn-pill btn-navy h-9 px-4 text-[12.5px]">
              <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέα σελίδα
            </Link>
          </>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Τίτλος</th>
              <th>Slug</th>
              <th>Κατάσταση</th>
              <th>Ενημερώθηκε</th>
              {canEdit && <th className="ctr" style={{ width: 40 }}>⋯</th>}
            </tr>
          </thead>
          <tbody>
            {filtered.map(page => (
              <tr key={page.id} className="dotted-row-bottom">
                <td>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-semibold">{page.titleEl}</span>
                    <span className={cn('badge-pill', page.hasEn ? 'ok' : 'muted')} title={page.hasEn ? 'Υπάρχει αγγλική μετάφραση' : 'Δεν υπάρχει αγγλική μετάφραση'}>
                      EN {page.hasEn ? '✓' : '—'}
                    </span>
                  </div>
                </td>
                <td className="text-muted-foreground">/legal/{page.slug}</td>
                <td>
                  {page.published ? (
                    <span className="badge-pill ok">
                      <CheckCircle2 className="size-3" strokeWidth={2.2} aria-hidden /> Δημοσιευμένο
                    </span>
                  ) : (
                    <span className="badge-pill muted">
                      <CircleDashed className="size-3" strokeWidth={2.2} aria-hidden /> Πρόχειρο
                    </span>
                  )}
                </td>
                <td>{page.updatedLabel}</td>
                {canEdit && (
                  <td className="ctr">
                    <LegalPageRowActions page={page} />
                  </td>
                )}
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={colCount} className="py-8 text-center text-muted-foreground">
                  {pages.length === 0 ? 'Δεν υπάρχουν σελίδες ακόμα — πάτησε «Δημιουργία βασικών» για να ξεκινήσεις.' : 'Δεν βρέθηκαν σελίδες.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{filtered.length} {filtered.length === 1 ? 'σελίδα' : 'σελίδες'}</span>
      </div>
    </div>
  )
}
