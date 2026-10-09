'use client'

import { useRouter } from 'next/navigation'
import { LuBuilding2 } from 'react-icons/lu'
import { selectPortalCompany } from '@/lib/pm/portal-documents'
import type { PortalCompany } from '@/lib/pm/portal-session'

/** Επιλογέας επιχείρησης για όσους είναι επαφή σε περισσότερες εταιρείες (π.χ. λογιστής). */
export function CompanySwitcher({ companies, current }: { companies: PortalCompany[]; current: string | null }) {
  const router = useRouter()
  if (companies.length < 2) return null
  return (
    <label className="p-switch">
      <LuBuilding2 aria-hidden />
      <span className="sr-only">Επιχείρηση</span>
      <select value={current ?? companies[0].contactId} onChange={async e => { if ((await selectPortalCompany(e.target.value)).ok) router.refresh() }}>
        {companies.map(c => <option key={c.contactId} value={c.contactId}>{c.name}</option>)}
      </select>
    </label>
  )
}
