'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
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
  trdrId, afm, irsdataName, legalForm, jobtypetrd, address, city, zip, countryName, trdCategoryName, paymentName, shipmentName, phone, phone2, email, emailAcc, website, employees, annualRevenue,
}: {
  trdrId: string
  afm: string | null
  irsdataName: string | null
  legalForm: string | null
  jobtypetrd: string | null
  address: string | null
  city: string | null
  zip: string | null
  countryName: string | null
  trdCategoryName: string | null
  paymentName: string | null
  shipmentName: string | null
  phone: string | null
  phone2: string | null
  email: string | null
  emailAcc: string | null
  website: string | null
  employees: number | null
  annualRevenue: number | null
}) {
  const router = useRouter()
  const [verify, setVerify] = useState<VerifyState>({ status: 'idle' })
  const [pending, startTransition] = useTransition()

  const fields: Field[] = [
    { icon: Hash, label: 'ΑΦΜ', value: afm },
    { icon: Landmark, label: 'ΔΟΥ', value: irsdataName },
    { icon: Briefcase, label: 'Νομική μορφή', value: legalForm },
    { icon: Briefcase, label: 'Δραστηριότητα', value: jobtypetrd },
    { icon: MapPin, label: 'Διεύθυνση', value: [address, city, zip].filter(Boolean).join(', ') || null },
    { icon: Globe, label: 'Χώρα', value: countryName },
    { icon: Briefcase, label: 'Κατηγορία', value: trdCategoryName },
    { icon: Phone, label: 'Τηλέφωνο', value: phone },
    { icon: Phone, label: 'Τηλέφωνο 2', value: phone2 },
    { icon: Mail, label: 'Email', value: email },
    { icon: Mail, label: 'Email λογιστηρίου', value: emailAcc },
    { icon: Globe, label: 'Website', value: website },
    { icon: Briefcase, label: 'Τρόπος πληρωμής', value: paymentName },
    { icon: Briefcase, label: 'Τρόπος αποστολής', value: shipmentName },
    { icon: Briefcase, label: 'Εργαζόμενοι', value: employees != null ? employees.toLocaleString('el-GR') : null },
    { icon: Briefcase, label: 'Ετήσια έσοδα', value: annualRevenue != null ? `${annualRevenue.toLocaleString('el-GR')} €` : null },
  ]

  function handleVerify() {
    if (!afm) return
    setVerify({ status: 'loading' })
    startTransition(async () => {
      // applyDoyToTrdrId: το re-verify γράφει και τη ΔΟΥ στην καρτέλα (Trdr.IRSDATA).
      const res = await lookupPartnerAfm(afm, trdrId)
      if (!res.ok) { setVerify({ status: 'error', message: res.message }); return }
      if (!res.found) { setVerify({ status: 'not_found' }); return }
      setVerify({ status: 'found', company: res.company })
      if (res.irsdataCode) router.refresh() // η ΔΟΥ γράφτηκε — ανανέωση για να φανεί στα Στοιχεία
    })
  }

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Στοιχεία
        </div>
        <button type="button" className="btn-pill btn-glass h-8 px-3.5 text-[0.75rem]" onClick={handleVerify} disabled={!afm || pending}>
          {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <RefreshCw className="size-3.5" aria-hidden />}
          ΑΑΔΕ re-verify
        </button>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {fields.map(f => (
          <div key={f.label} className="min-w-0">
            <dt className="mb-0.5 flex items-center gap-1.5 text-[0.6875rem] font-semibold text-muted-foreground">
              <f.icon className="size-3" aria-hidden /> {f.label}
            </dt>
            <dd className="truncate text-[0.8125rem]">{f.value ?? '—'}</dd>
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
            {verify.company.doy ? ` · ΔΟΥ ${verify.company.doy}` : ''}
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
