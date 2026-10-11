import type { Metadata } from 'next'
import { FileWarning, Clock } from 'lucide-react'
import { getPublicCert } from '@/lib/supplier-cert/public'
import { SignCertClient } from './sign-client'

/**
 * Δημόσια σελίδα του ΠΡΟΜΗΘΕΥΤΗ για τη «Βεβαίωση προμηθευτή» (token-gated, χωρίς λογαριασμό): έλεγχος,
 * λογότυπο, υπογραφή με το χέρι (κινητό/tablet) ή σφραγίδα. Top-level route (όπως /r)· ο proxy επιτρέπει το /b/. noindex.
 */
export const metadata: Metadata = { title: 'Βεβαίωση προμηθευτή', robots: { index: false, follow: false } }
export const dynamic = 'force-dynamic'

export default async function SupplierCertPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const cert = await getPublicCert(token)
  return (
    <main className="min-h-dvh bg-slate-100 px-4 py-6 text-slate-900 sm:py-10" translate="no">
      <div className="mx-auto flex max-w-[800px] flex-col gap-5">
        <div className="flex items-center justify-between text-[length:var(--fs-12)] font-semibold tracking-[0.12em] text-slate-500 uppercase">
          <span>Βεβαίωση προμηθευτή</span>
          <span className="tracking-normal normal-case">μέσω World Wide Associates</span>
        </div>
        {!cert.ok ? (
          <section className="rounded-2xl bg-white p-8 text-center shadow-sm ring-1 ring-slate-200">
            {cert.reason === 'expired' ? <Clock className="mx-auto mb-3 size-8 text-amber-600" aria-hidden /> : <FileWarning className="mx-auto mb-3 size-8 text-rose-600" aria-hidden />}
            <h1 className="mb-2 text-[length:var(--fs-20)] font-bold">{cert.reason === 'expired' ? 'Ο σύνδεσμος έληξε' : 'Ο σύνδεσμος δεν βρέθηκε'}</h1>
            <p className="text-slate-600">Επικοινωνήστε με τον πελάτη σας ή με τη World Wide Associates (210 7218758) για νέο σύνδεσμο.</p>
          </section>
        ) : (
          <SignCertClient token={token} cert={cert} />
        )}
      </div>
    </main>
  )
}
