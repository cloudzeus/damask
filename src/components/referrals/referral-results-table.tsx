'use client'

import { LuCircleCheck, LuCircleX, LuTriangleAlert, LuUserCheck } from 'react-icons/lu'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import type { ReferralCompanyResult } from '@/lib/referrals/actions'

const STATUS_META: Record<string, { label: string; cls: string; Icon: typeof LuCircleCheck; order: number }> = {
  ELIGIBLE: { label: 'Επιλέξιμη', cls: 'ok', Icon: LuCircleCheck, order: 0 },
  INELIGIBLE: { label: 'Μη επιλέξιμη', cls: 'muted', Icon: LuCircleX, order: 2 },
  NOT_FOUND: { label: 'Δεν βρέθηκε στην ΑΑΔΕ', cls: 'warn', Icon: LuTriangleAlert, order: 1 },
  ERROR: { label: 'Σφάλμα', cls: 'warn', Icon: LuTriangleAlert, order: 1 },
}
const metaOf = (s: string) => STATUS_META[s] ?? STATUS_META.INELIGIBLE

const COLUMNS: DataTableColumn<ReferralCompanyResult>[] = [
  { id: 'afm', header: 'ΑΦΜ', width: 110, nowrap: true, sortValue: c => c.afm, cell: c => <span className="tabular-nums">{c.afm}</span> },
  {
    id: 'name', header: 'Επωνυμία', width: 260, enableHide: false, sortValue: c => c.name ?? '',
    cell: c => (
      <div className="flex flex-col gap-0.5">
        <span className="font-semibold">{c.name ?? '—'}</span>
        {c.existingTrdrId && (
          <span className={`badge-pill shrink-0 self-start ${c.existingIsCustomer ? 'warn' : 'muted'}`}>
            <LuUserCheck className="size-3" aria-hidden /> {c.existingIsCustomer ? 'Ήδη πελάτης' : 'Ήδη καταχωρημένη'}
          </span>
        )}
      </div>
    ),
  },
  {
    id: 'region', header: 'Περιοχή', width: 170, sortValue: c => c.regionName ?? '',
    cell: c => (
      <>
        {c.regionName ?? '—'}
        {c.regionName && !c.regionConfident && <span className="badge-pill muted ml-1 shrink-0" title="Εκτίμηση Περιφέρειας από ΤΚ">εκτ.</span>}
      </>
    ),
  },
  {
    id: 'status', header: 'Κατάσταση', width: 170, sortValue: c => metaOf(c.status).order, searchValue: c => metaOf(c.status).label,
    cell: c => {
      const m = metaOf(c.status)
      return (
        <>
          <span className={`badge-pill shrink-0 ${m.cls}`}><m.Icon className="size-3" aria-hidden /> {m.label}</span>
          {c.error && <div className="mt-0.5 text-[length:var(--fs-11)] text-muted-foreground">{c.error}</div>}
        </>
      )
    },
  },
  {
    id: 'programs', header: 'Επιλέξιμα προγράμματα', width: 300, sortValue: c => c.eligiblePrograms.length,
    searchValue: c => c.eligiblePrograms.map(p => p.title).join(' '),
    cell: c => c.eligiblePrograms.length === 0
      ? <span className="text-muted-foreground">—</span>
      : (
        <div className="flex flex-wrap gap-1">
          {c.eligiblePrograms.map(p => (
            <span key={p.programId} className="badge-pill ok shrink-0">{p.title}{p.fundingRate != null ? ` · ${p.fundingRate}%` : ''}</span>
          ))}
        </div>
      ),
  },
]

/** Αποτελέσματα ελέγχου επιλεξιμότητας παραπομπής (Εργαλείο παραπομπών + modal Συστήστη). */
export function ReferralResultsTable({ results, tableId }: { results: ReferralCompanyResult[]; tableId: string }) {
  return (
    <DataTable
      bare
      tableId={tableId}
      columns={COLUMNS}
      rows={results}
      rowKey={c => c.id}
      initialSort={{ columnId: 'status', dir: 'asc' }}
      searchPlaceholder="Αναζήτηση ΑΦΜ, επωνυμίας, περιοχής, προγράμματος…"
      emptyMessage="Δεν υπάρχουν αποτελέσματα."
    />
  )
}
