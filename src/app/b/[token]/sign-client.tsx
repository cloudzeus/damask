'use client'

import * as React from 'react'
import { CheckCircle2, Download, ImagePlus, LoaderCircle, PenLine, Stamp, Trash2, Upload } from 'lucide-react'
import { cn } from '@/lib/utils'
import { CertPreview } from '@/components/supplier-cert/cert-preview'
import { SignaturePad, type SignaturePadHandle } from '@/components/ui/signature-pad'
import { uploadSupplierLogo, signPublicCert, type PublicCert } from '@/lib/supplier-cert/public'

type Ok = Extract<PublicCert, { ok: true }>
type Img = { base64: string; mime: string; url: string }

const ACCEPT = 'image/png,image/jpeg,image/webp'

/** Εικόνα → (σμίκρυνση έως 1200px) → base64 για αποστολή. Κρατά PNG για διαφάνεια (σφραγίδες/λογότυπα). */
async function readImage(file: File): Promise<Img> {
  if (!ACCEPT.split(',').includes(file.type)) throw new Error('Επιτρέπονται εικόνες PNG, JPG ή WEBP.')
  const url = URL.createObjectURL(file)
  const img = await new Promise<HTMLImageElement>((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url })
  const scale = Math.min(1, 1200 / Math.max(img.width, img.height))
  const c = document.createElement('canvas')
  c.width = Math.round(img.width * scale)
  c.height = Math.round(img.height * scale)
  c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
  const mime = file.type === 'image/jpeg' ? 'image/jpeg' : 'image/png'
  const dataUrl = c.toDataURL(mime, 0.9)
  URL.revokeObjectURL(url)
  return { base64: dataUrl.split(',')[1] ?? '', mime, url: dataUrl }
}

function Step({ n, title, hint, children }: { n: number; title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
      <div className="mb-3 flex items-start gap-3">
        <span className="grid size-7 shrink-0 place-items-center rounded-full bg-[#001B72] text-[length:var(--fs-13)] font-bold text-white">{n}</span>
        <div>
          <h2 className="text-[length:var(--fs-15)] font-bold">{title}</h2>
          {hint && <p className="text-[length:var(--fs-12-5)] text-slate-500">{hint}</p>}
        </div>
      </div>
      {children}
    </section>
  )
}

export function SignCertClient({ token, cert }: { token: string; cert: Ok }) {
  const pad = React.useRef<SignaturePadHandle>(null)
  const [logo, setLogo] = React.useState<string | null>(cert.logo)
  const [logoBusy, setLogoBusy] = React.useState(false)
  const [name, setName] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [place, setPlace] = React.useState(cert.data.place)
  const [padEmpty, setPadEmpty] = React.useState(true)
  const [stamp, setStamp] = React.useState<Img | null>(null)
  const [agree, setAgree] = React.useState(false)
  const [busy, setBusy] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [done, setDone] = React.useState(cert.status === 'SIGNED')
  const [sigPreview, setSigPreview] = React.useState<string | null>(null)
  const onPadChange = React.useCallback((empty: boolean) => {
    setPadEmpty(empty)
    if (empty) setSigPreview(null)
  }, [])

  async function onLogo(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    setLogoBusy(true); setError(null)
    try {
      const img = await readImage(f)
      const r = await uploadSupplierLogo(token, { base64: img.base64, mime: img.mime })
      if (!r.ok) throw new Error(r.message)
      setLogo(img.url)
    } catch (err) { setError(err instanceof Error ? err.message : 'Το ανέβασμα απέτυχε.') } finally { setLogoBusy(false) }
  }
  async function onStamp(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0]
    e.target.value = ''
    if (!f) return
    try { setStamp(await readImage(f)); setError(null) } catch (err) { setError(err instanceof Error ? err.message : 'Μη αποδεκτή εικόνα.') }
  }

  async function submit() {
    setError(null)
    const sig = pad.current?.toPng() ?? null
    if (name.trim().length < 3) { setError('Συμπληρώστε το ονοματεπώνυμο του υπογράφοντος.'); return }
    if (!sig && !stamp) { setError('Υπογράψτε στο πλαίσιο ή προσθέστε τη σφραγίδα της εταιρίας.'); return }
    if (!agree) { setError('Επιβεβαιώστε ότι τα στοιχεία της βεβαίωσης είναι ακριβή.'); return }
    setBusy(true)
    try {
      const r = await signPublicCert(token, {
        signerName: name, signerTitle: title || null, place,
        signature: sig ? { base64: sig.split(',')[1] ?? '', mime: 'image/png' } : null,
        stamp: stamp ? { base64: stamp.base64, mime: stamp.mime } : null,
      })
      if (!r.ok) throw new Error(r.message)
      setDone(true)
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Η υπογραφή απέτυχε — δοκιμάστε ξανά.')
    } finally { setBusy(false) }
  }

  if (done) {
    return (
      <section className="rounded-2xl bg-white p-6 text-center shadow-sm ring-1 ring-slate-200 sm:p-8" aria-live="polite">
        <CheckCircle2 className="mx-auto mb-3 size-10 text-emerald-600" aria-hidden />
        <h1 className="mb-2 text-[length:var(--fs-20)] font-bold">Η βεβαίωση υπογράφηκε</h1>
        <p className="mb-5 text-slate-600">Ευχαριστούμε! Το υπογεγραμμένο αντίγραφο στάλθηκε αυτόματα στον φάκελο της αγοράς.</p>
        <a href={`/b/${token}/pdf`} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center gap-2 rounded-full bg-[#001B72] px-6 font-bold text-white hover:bg-[#00085E]">
          <Download className="size-4" aria-hidden /> Λήψη PDF
        </a>
      </section>
    )
  }

  const d = { ...cert.data, place }
  return (
    <>
      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <h1 className="text-[length:var(--fs-20)] font-bold">Ελέγξτε και υπογράψτε τη βεβαίωση</h1>
        <p className="mt-1 text-slate-600">
          Η {cert.data.buyer.name} χρειάζεται τη βεβαίωσή σας για το τιμολόγιο <b>{cert.data.invoiceNumber || '—'}</b> στο πρόγραμμα «{cert.data.programTitle}».
          Τη συντάξαμε με τα στοιχεία της αγοράς — χρειάζεται μόνο η υπογραφή σας (περίπου 1 λεπτό).
        </p>
      </section>

      <div className="-mx-1 overflow-x-auto px-1 pb-1">
        <CertPreview data={d} logo={logo} signature={sigPreview} stamp={stamp?.url ?? null} signer={{ name, title }} />
      </div>

      <Step n={1} title="Λογότυπο της εταιρίας σας (προαιρετικό)" hint="Θα εμφανίζεται στην κεφαλίδα — και σε όσες βεβαιώσεις σας συντάξουμε στο μέλλον.">
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-4 font-semibold hover:bg-slate-50">
            {logoBusy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ImagePlus className="size-4" aria-hidden />}
            {logo ? 'Αλλαγή λογοτύπου' : 'Ανέβασμα λογοτύπου'}
            <input type="file" accept={ACCEPT} className="sr-only" onChange={onLogo} disabled={logoBusy} />
          </label>
          {logo && <span className="text-[length:var(--fs-12-5)] text-emerald-700">✓ Το λογότυπο προστέθηκε</span>}
        </div>
      </Step>

      <Step n={2} title="Ποιος υπογράφει">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 sm:col-span-1">
            <span className="text-[length:var(--fs-12-5)] font-semibold">Ονοματεπώνυμο *</span>
            <input value={name} onChange={e => setName(e.target.value)} autoComplete="name" className="min-h-11 rounded-lg border border-slate-300 px-3 text-[max(1rem,1em)] outline-none focus:border-[#001B72] focus:ring-2 focus:ring-[#001B72]/20" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--fs-12-5)] font-semibold">Ιδιότητα</span>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder="π.χ. Νόμιμος εκπρόσωπος" autoComplete="organization-title" className="min-h-11 rounded-lg border border-slate-300 px-3 text-[max(1rem,1em)] outline-none focus:border-[#001B72] focus:ring-2 focus:ring-[#001B72]/20" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[length:var(--fs-12-5)] font-semibold">Τόπος</span>
            <input value={place} onChange={e => setPlace(e.target.value)} placeholder="π.χ. Αθήνα" className="min-h-11 rounded-lg border border-slate-300 px-3 text-[max(1rem,1em)] outline-none focus:border-[#001B72] focus:ring-2 focus:ring-[#001B72]/20" />
          </label>
        </div>
      </Step>

      <Step n={3} title="Υπογραφή και/ή σφραγίδα" hint="Υπογράψτε με το δάχτυλο ή τη γραφίδα — ή ανεβάστε φωτογραφία της σφραγίδας. Μπορείτε και τα δύο.">
        <div className="mb-1 flex items-center gap-2 text-[length:var(--fs-13)] font-semibold"><PenLine className="size-4" aria-hidden /> Ιδιόχειρη υπογραφή</div>
        <SignaturePad ref={pad} onChange={onPadChange} />
        <div className="mt-2 flex justify-end">
          <button type="button" disabled={padEmpty} onClick={() => setSigPreview(pad.current?.toPng() ?? null)} className="min-h-10 rounded-full px-4 text-[length:var(--fs-12-5)] font-semibold text-[#001B72] hover:bg-slate-100 disabled:opacity-40">
            Εμφάνιση στη βεβαίωση
          </button>
        </div>
        <div className="mt-4 mb-1 flex items-center gap-2 text-[length:var(--fs-13)] font-semibold"><Stamp className="size-4" aria-hidden /> Σφραγίδα εταιρίας</div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-full border border-slate-300 px-4 font-semibold hover:bg-slate-50">
            <Upload className="size-4" aria-hidden /> {stamp ? 'Αλλαγή σφραγίδας' : 'Ανέβασμα σφραγίδας (εικόνα)'}
            <input type="file" accept={ACCEPT} capture="environment" className="sr-only" onChange={onStamp} />
          </label>
          {stamp && (
            <span className="inline-flex items-center gap-2">
              {/* eslint-disable-next-line @next/next/no-img-element -- προεπισκόπηση τοπικής εικόνας */}
              <img src={stamp.url} alt="Σφραγίδα" className="h-12 rounded border border-slate-200 bg-white object-contain p-1" />
              <button type="button" onClick={() => setStamp(null)} aria-label="Αφαίρεση σφραγίδας" className="grid size-10 place-items-center rounded-full hover:bg-slate-100"><Trash2 className="size-4" aria-hidden /></button>
            </span>
          )}
        </div>
        <p className="mt-1 text-[length:var(--fs-12)] text-slate-500">Καλύτερα PNG με διαφανές φόντο· από κινητό μπορείτε να τη φωτογραφίσετε.</p>
      </Step>

      <section className="rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200 sm:p-5">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={agree} onChange={e => setAgree(e.target.checked)} className="mt-1 size-5" />
          <span className="text-[length:var(--fs-14)]">Δηλώνω ότι τα στοιχεία της βεβαίωσης είναι ακριβή και ότι έχω δικαίωμα να υπογράψω για λογαριασμό της εταιρίας.</span>
        </label>
        {error && <p role="alert" className="mt-3 rounded-lg bg-rose-50 px-3 py-2 text-[length:var(--fs-13)] text-rose-800">{error}</p>}
        <button
          type="button"
          onClick={submit}
          disabled={busy}
          className={cn('mt-4 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-full bg-[#001B72] px-6 text-[length:var(--fs-15)] font-bold text-white hover:bg-[#00085E] disabled:opacity-60 sm:w-auto')}
        >
          {busy && <LoaderCircle className="size-4 animate-spin" aria-hidden />}
          Υπογραφή βεβαίωσης
        </button>
        <p className="mt-2 text-[length:var(--fs-12)] text-slate-500">
          Μετά την υπογραφή δημιουργείται το τελικό PDF. Αν κάτι δεν είναι σωστό, μην υπογράψετε — απαντήστε στο email που λάβατε.
        </p>
      </section>
    </>
  )
}
