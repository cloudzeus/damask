import { getSetting, getIntegration, maskSecret } from '@/lib/settings'
import { CompanyForm } from './company-form'
import type { CompanyProfileValues, LogoEntry } from './actions'

function str(value: unknown, fallback = ''): string {
  return typeof value === 'string' ? value : fallback
}

export async function CompanyTab() {
  const [profile, aade] = await Promise.all([
    getSetting<Record<string, unknown>>('company.profile'),
    getIntegration<{ username?: string; password?: string; afmCalledFor?: string }>('aade'),
  ])
  const p = profile ?? {}
  const logos: LogoEntry[] = Array.isArray(p.logos) ? (p.logos as LogoEntry[]) : []

  const initial: CompanyProfileValues = {
    name: str(p.name),
    title: str(p.title),
    afm: str(p.afm),
    doy: str(p.doy),
    jobTypeDesc: str(p.jobTypeDesc),
    gemiNumber: str(p.gemiNumber),
    address: str(p.address),
    city: str(p.city),
    zip: str(p.zip),
    district: str(p.district),
    country: str(p.country, 'Ελλάδα') || 'Ελλάδα',
    phone: str(p.phone),
    phone2: str(p.phone2),
    fax: str(p.fax),
    email: str(p.email),
    website: str(p.website),
    iban: str(p.iban),
    hours: str(p.hours),
    googleMapsLink: str(p.googleMapsLink),
    lat: str(p.lat),
    lng: str(p.lng),
    logos,
    aadeUsername: str(aade.username),
    aadePassword: '',
    afmCalledFor: str(aade.afmCalledFor),
  }

  return <CompanyForm initial={initial} maskedAadePassword={maskSecret(aade.password)} />
}
