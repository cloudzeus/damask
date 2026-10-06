'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { PartnerRowActions } from './partner-row-actions'
import { BulkRegionMatchButton } from '@/components/trdr/bulk-region-match-button'
import { BulkKadMatchButton } from '@/components/trdr/bulk-kad-match-button'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { Combobox, type ComboboxOption } from '@/components/ui/combobox'

export type PartnerRow = {
  id: string
  name: string
  afm: string | null
  city: string | null
  phone: string | null
  logoUrl: string | null
  contactsCount: number
  isProsp: boolean
  sodtype: number
  trdr: number | null
  regionName: string | null
  referrerId: string | null
  referrerName: string | null
}

type TabKey = 'customers' | 'suppliers' | 'leads'

function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

function LogoAvatar({ name, logoUrl }: { name: string; logoUrl: string | null }) {
  if (logoUrl) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={logoUrl} alt="" className="thumb-ring size-8 shrink-0 rounded-full object-cover" width={32} height={32} loading="lazy" />
    )
  }
  return <span className="avatar-ring size-8 shrink-0 text-[0.6875rem]">{initialsOf(name)}</span>
}

export function PartnersTable({ partners, referrerOptions }: { partners: PartnerRow[]; referrerOptions: ComboboxOption[] }) {
  const [tab, setTab] = useState<TabKey>('customers')
  const [query, setQuery] = useState('')
  const [referrerId, setReferrerId] = useState<string | null>(null)

  // Φίλτρο σύστασης (combobox, με id) + αναζήτηση εφαρμόζονται ΠΡΩΤΑ· από το
  // ίδιο σύνολο βγαίνουν ΚΑΙ οι μετρητές των tabs ΚΑΙ οι γραμμές. Η ελεύθερη
  // αναζήτηση ΔΕΝ ψάχνει πλέον στο όνομα σύστασης — γι' αυτό υπάρχει το combobox.
  const base = useMemo(() => {
    const q = query.trim().toLowerCase()
    let rows = referrerId ? partners.filter(p => p.referrerId === referrerId) : partners
    if (q) {
      rows = rows.filter(p =>
        p.name.toLowerCase().includes(q)
        || (p.afm ?? '').includes(q)
        || (p.city ?? '').toLowerCase().includes(q),
      )
    }
    return rows
  }, [partners, query, referrerId])

  const counts = useMemo(() => ({
    customers: base.filter(p => p.sodtype === 13).length,
    suppliers: base.filter(p => p.sodtype === 12).length,
    leads: base.filter(p => p.isProsp).length,
  }), [base])

  const filtered = useMemo(() => {
    if (tab === 'suppliers') return base.filter(p => p.sodtype === 12)
    if (tab === 'leads') return base.filter(p => p.isProsp)
    return base.filter(p => p.sodtype === 13)
  }, [base, tab])

  const columns: DataTableColumn<PartnerRow>[] = [
    {
      id: 'name',
      header: 'Συναλλασσόμενος',
      width: 260,
      enableHide: false,
      sortValue: p => p.name,
      cell: p => (
        <Link href={`/partners/${p.id}`} className="user-cell">
          <LogoAvatar name={p.name} logoUrl={p.logoUrl} />
          <span>
            <b>{p.name}</b>
            <small>{p.afm ? `ΑΦΜ ${p.afm}` : 'Χωρίς ΑΦΜ'}</small>
          </span>
        </Link>
      ),
    },
    { id: 'city', header: 'Πόλη', width: 130, sortValue: p => p.city, cell: p => p.city ?? '—' },
    {
      id: 'region',
      header: 'Περιφέρεια',
      width: 160,
      sortValue: p => p.regionName,
      cell: p => (p.regionName ? <span className="badge-pill muted">{p.regionName}</span> : <span className="text-muted-foreground">—</span>),
    },
    {
      id: 'referrer',
      header: 'Σύσταση',
      width: 150,
      sortValue: p => p.referrerName,
      cell: p => (p.referrerName ? <span className="badge-pill info">{p.referrerName}</span> : <span className="text-muted-foreground">—</span>),
    },
    { id: 'phone', header: 'Τηλέφωνο', width: 130, sortValue: p => p.phone, cell: p => p.phone ?? '—' },
    { id: 'contacts', header: 'Επαφές', align: 'right', width: 90, sortValue: p => p.contactsCount, cell: p => p.contactsCount },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 130,
      sortValue: p => (p.sodtype === 12 ? 0 : p.isProsp ? 1 : 2),
      cell: p =>
        p.sodtype === 12 ? (
          <span className="badge-pill muted">—</span>
        ) : p.isProsp ? (
          <span className="badge-pill warn">
            <span className="status-dot" style={{ background: 'var(--warning)' }} aria-hidden />
            Υποψήφιος
          </span>
        ) : (
          <span className="badge-pill ok">
            <span className="status-dot" style={{ background: 'var(--success)' }} aria-hidden />
            Πελάτης
          </span>
        ),
    },
    {
      id: 'sync',
      header: 'Sync',
      width: 110,
      sortValue: p => (p.trdr !== null ? 1 : 0),
      cell: p => (p.trdr !== null ? <span className="badge-pill info">S1 ✓</span> : <span className="badge-pill muted">Τοπικός</span>),
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 48,
      enableHide: false,
      enableResize: false,
      cell: p => <PartnerRowActions id={p.id} name={p.name} afm={p.afm} isProsp={p.isProsp} isLocal={p.trdr === null} />,
    },
  ]

  return (
    <DataTable
        searchable={false}
      tableId="partners"
      columns={columns}
      rows={filtered}
      rowKey={p => p.id}
      emptyMessage="Δεν βρέθηκαν συναλλασσόμενοι."
      footer={<span>{filtered.length} {filtered.length === 1 ? 'εγγραφή' : 'εγγραφές'}</span>}
      toolbarExtras={
        <>
          <label className="search">
            <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            <input
              type="text"
              placeholder="Αναζήτηση με επωνυμία, ΑΦΜ ή πόλη…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Αναζήτηση συναλλασσόμενων"
            />
          </label>
          <button type="button" className={`pill${tab === 'customers' ? ' on' : ''}`} onClick={() => setTab('customers')}>
            Πελάτες <span className="cnt">{counts.customers}</span>
          </button>
          <button type="button" className={`pill${tab === 'suppliers' ? ' on' : ''}`} onClick={() => setTab('suppliers')}>
            Προμηθευτές <span className="cnt">{counts.suppliers}</span>
          </button>
          <button type="button" className={`pill${tab === 'leads' ? ' on' : ''}`} onClick={() => setTab('leads')}>
            Leads <span className="cnt">{counts.leads}</span>
          </button>
          {referrerOptions.length > 0 && (
            <Combobox
              options={referrerOptions}
              value={referrerId}
              onChange={setReferrerId}
              placeholder="Όλες οι συστάσεις"
              ariaLabel="Φίλτρο ανά σύσταση (εταιρία ή ιδιώτης)"
              emptyText="Δεν βρέθηκε σύσταση."
              className="w-60"
            />
          )}
          <BulkKadMatchButton />
          <BulkRegionMatchButton />
        </>
      }
    />
  )
}
