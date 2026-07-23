'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Search } from 'lucide-react'
import { PartnerRowActions } from './partner-row-actions'
import { BulkRegionMatchButton } from '@/components/trdr/bulk-region-match-button'

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
  return <span className="avatar-ring size-8 shrink-0 text-[11px]">{initialsOf(name)}</span>
}

export function PartnersTable({ partners }: { partners: PartnerRow[] }) {
  const [tab, setTab] = useState<TabKey>('customers')
  const [query, setQuery] = useState('')

  const counts = useMemo(() => ({
    customers: partners.filter(p => p.sodtype === 13).length,
    suppliers: partners.filter(p => p.sodtype === 12).length,
    leads: partners.filter(p => p.isProsp).length,
  }), [partners])

  const byTab = useMemo(() => {
    if (tab === 'suppliers') return partners.filter(p => p.sodtype === 12)
    if (tab === 'leads') return partners.filter(p => p.isProsp)
    return partners.filter(p => p.sodtype === 13)
  }, [partners, tab])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return byTab
    return byTab.filter(p =>
      p.name.toLowerCase().includes(q)
      || (p.afm ?? '').includes(q)
      || (p.city ?? '').toLowerCase().includes(q),
    )
  }, [byTab, query])

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
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
        <div className="flex-1" />
        <BulkRegionMatchButton />
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Συναλλασσόμενος</th>
              <th>Πόλη</th>
              <th>Περιφέρεια</th>
              <th>Τηλέφωνο</th>
              <th className="num">Επαφές</th>
              <th>Κατάσταση</th>
              <th>Sync</th>
              <th className="ctr" style={{ width: 40 }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(p => (
              <tr key={p.id} className="dotted-row-bottom">
                <td>
                  <Link href={`/partners/${p.id}`} className="user-cell">
                    <LogoAvatar name={p.name} logoUrl={p.logoUrl} />
                    <span>
                      <b>{p.name}</b>
                      <small>{p.afm ? `ΑΦΜ ${p.afm}` : 'Χωρίς ΑΦΜ'}</small>
                    </span>
                  </Link>
                </td>
                <td>{p.city ?? '—'}</td>
                <td>
                  {p.regionName ? <span className="badge-pill muted">{p.regionName}</span> : <span className="text-muted-foreground">—</span>}
                </td>
                <td>{p.phone ?? '—'}</td>
                <td className="num">{p.contactsCount}</td>
                <td>
                  {p.sodtype === 12 ? (
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
                  )}
                </td>
                <td>
                  {p.trdr !== null ? (
                    <span className="badge-pill info">S1 ✓</span>
                  ) : (
                    <span className="badge-pill muted">Τοπικός</span>
                  )}
                </td>
                <td className="ctr">
                  <PartnerRowActions id={p.id} name={p.name} afm={p.afm} isProsp={p.isProsp} isLocal={p.trdr === null} />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={8} className="py-8 text-center text-muted-foreground">
                  Δεν βρέθηκαν συναλλασσόμενοι.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{filtered.length} {filtered.length === 1 ? 'εγγραφή' : 'εγγραφές'}</span>
      </div>
    </div>
  )
}
