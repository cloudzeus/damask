'use client'

import { useState, useTransition } from 'react'
import {
  Hash, Landmark, Briefcase, MapPin, Phone, Mail, Globe, BadgeCheck, LoaderCircle, TriangleAlert, RefreshCw,
} from 'lucide-react'
import { lookupPartnerAfm } from '../actions'
import type { AadeCompany } from '@/lib/aade'

type Field = { icon: React.ComponentType<{ className?: string }>; label: string; value: string | null }

type VerifyState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; company: AadeCompany }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

export function PartnerInfoCard({
  afm, doy, legalForm, profession, address, city, zip, phone, email, website,
}: {
  afm: string | null
  doy: string | null
  legalForm: string | null
  profession: string | null
  address: string | null
  city: string | null
  zip: string | null
  phone: string | null
  email: string | null
  website: string | null
}) {
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  const fields: Field[] = [
    { icon: Hash, label: 'ΑΦΜ', value: afm },
    { icon: Landmark, label: 'ΔΟΥ', value: doy },
    { icon: Briefcase, label: 'Νομική μορφή', value: legalForm },
    { icon: Briefcase, label: 'Δραστηριότητα', value: profession },
    { icon: MapPin, label: 'Διεύθυνση', value: [address, city, zip].filter(Boolean).join(', ') || null },
    { icon: Phone, label: 'Τηλέφωνο', value: phone },
    { icon: Mail, label: 'Email', value: email },
    { icon: Globe, label: 'Website', value: website },
  ]

  function handleVerify() {
    if (!afm) return
    setVerify({ status: 'loading' })
    startTransition(async () => {
      const res = await lookupPartnerAfm(afm)
      if (!res.ok) { setVerify({ status: 'error', message: res.message }); return }
      if (!res.found) { setVerify({ status: 'not_found' }); return }
      setVerify({ status: 'found', company: res.company })
    })
  }

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Στοιχεία
        </div>
        <button type="button" className="btn-pill btn-glass h-8 px-3.5 text-[12px]" onClick={handleVerify} disabled={!afm || pending}>
          {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
          ΑΑΔΕ re-verify
        </button>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {fields.map(f => (
          <div key={f.label} className="min-w-0">
            <dt className="mb-0.5 flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground">
              <f.icon className="size-3" aria-hidden /> {f.label}
            </dt>
            <dd className="truncate text-[13px]">{f.value ?? '—'}</dd>
          </div>
        ))}
      </dl>

      {verify.status === 'loading' && (
        <div className="notice mt-3"><LoaderCircle className="animate-spin" aria-hidden /><span>Έλεγχος στο μητρώο ΑΑΔΕ…</span></div>
      )}
      {verify.status === 'found' && (
        <div className="notice success mt-3">
          <BadgeCheck aria-hidden />
          <span>
            Επαληθεύτηκε — «{verify.company.name}» ·{' '}
            <span style={{ color: verify.company.isActive ? 'var(--success)' : 'var(--destructive)' }}>
              {verify.company.isActive ? 'Ενεργή' : 'Ανενεργή'}
            </span>
            {verify.company.aadeStatus ? ` (${verify.company.aadeStatus})` : ''}
          </span>
        </div>
      )}
      {verify.status === 'not_found' && (
        <div className="notice mt-3"><TriangleAlert aria-hidden /><span>Δεν βρέθηκαν στοιχεία για αυτό το ΑΦΜ στο μητρώο της ΑΑΔΕ.</span></div>
      )}
      {verify.status === 'error' && (
        <div className="notice mt-3"><TriangleAlert aria-hidden /><span>{verify.message}</span></div>
      )}
    </div>
  )
}
