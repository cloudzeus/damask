'use client'

import { useEffect, useRef, useState } from 'react'
import { toast } from 'sonner'
import {
  LuBadgeCheck, LuLoaderCircle, LuTriangleAlert, LuX, LuUserPlus, LuCheck,
  LuPhone, LuMail, LuGlobe, LuLandmark, LuMapPin, LuBuilding2, LuHash, LuExternalLink,
} from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import type { OcrParty } from '@/lib/ocr/schema'
import { verifyIssuerAfm, createCustomerFromOcr } from '@/lib/ocr/customer-actions'
import type { AadeCompany } from '@/lib/aade'
import { isNameMismatch } from '@/lib/ocr/name-similarity'

/**
 * «Εξακρίβωση & Καρτέλα» — κάθεται μέσα στο OcrReviewPanel (src/components/ocr/ocr-review-panel.tsx),
 * κάτω από τα στοιχεία εκδότη. Αυτόματα (αν issuer.afm είναι 9ψήφιο) επαληθεύει
 * την εταιρεία μέσω ΑΑΔΕ (vat.wwa.gr, src/lib/ocr/customer-actions.ts →
 * src/lib/aade.ts), δείχνει σύγκριση με τα OCR-extracted στοιχεία, και επιτρέπει
 * δημιουργία καρτέλας πελάτη (trdr=null — δεν έχει συγχρονιστεί ακόμα με SoftOne).
 *
 * ΣΗΜ.: δεν υπάρχει ακόμα σελίδα λίστας πελατών (/customers) — το `href` προς
 * την καρτέλα είναι forward-compatible placeholder, όχι ενεργό link σήμερα.
 */

type AadeState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'found'; company: AadeCompany }
  | { status: 'not_found' }
  | { status: 'error'; message: string }

type CardFields = {
  name: string
  afm: string
  doy: string
  address: string
  city: string
  zip: string
  phones: string[]
  emails: string[]
  website: string
}

function initialCardFields(issuer: OcrParty): CardFields {
  return {
    name: issuer.name ?? '',
    afm: (issuer.afm ?? '').replace(/\D/g, ''),
    doy: '',
    address: issuer.address ?? '',
    city: '',
    zip: '',
    phones: issuer.phones ?? [],
    emails: issuer.emails ?? [],
    website: issuer.website ?? '',
  }
}

function FieldLabel({ icon: Icon, children }: { icon: React.ComponentType<{ className?: string }>; children: React.ReactNode }) {
  return (
    <label className="mb-1 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
      <Icon className="size-3" aria-hidden />
      {children}
    </label>
  )
}

function TextInput({
  value, onChange, placeholder, ariaLabel,
}: {
  value: string
  onChange: (v: string) => void
  placeholder?: string
  ariaLabel: string
}) {
  return (
    <input
      type="text"
      className="cell-input"
      aria-label={ariaLabel}
      value={value}
      placeholder={placeholder}
      onChange={e => onChange(e.target.value)}
      style={{
        width: '100%', height: 34, borderRadius: 9, border: '1px solid var(--border)',
        background: 'var(--card)', padding: '0 9px', fontSize: 13,
      }}
    />
  )
}

/** Επεξεργάσιμη λίστα τιμών (τηλέφωνα/emails) ως chips: Enter ή κόμμα προσθέτει, «×» αφαιρεί. */
function ChipsField({
  label, icon: Icon, values, onChange, placeholder, ariaLabel,
}: {
  label: string
  icon: React.ComponentType<{ className?: string }>
  values: string[]
  onChange: (next: string[]) => void
  placeholder?: string
  ariaLabel: string
}) {
  const [draft, setDraft] = useState('')

  function commit() {
    const v = draft.trim()
    if (v && !values.includes(v)) onChange([...values, v])
    setDraft('')
  }

  return (
    <div>
      <FieldLabel icon={Icon}>{label}</FieldLabel>
      <div
        className="flex flex-wrap items-center gap-1.5 rounded-[9px] px-2 py-1.5"
        style={{ border: '1px solid var(--border)', background: 'var(--card)', minHeight: 34 }}
      >
        {values.map((v, i) => (
          <span
            key={`${v}-${i}`}
            className="inline-flex items-center gap-1 rounded-full py-0.5 pr-1 pl-2.5 text-[11.5px] font-medium"
            style={{ background: 'var(--muted)' }}
          >
            {v}
            <button
              type="button"
              onClick={() => onChange(values.filter((_, idx) => idx !== i))}
              aria-label={`Αφαίρεση ${v}`}
              className="flex size-4 items-center justify-center rounded-full text-muted-foreground hover:bg-black/10"
            >
              <LuX className="size-2.5" aria-hidden />
            </button>
          </span>
        ))}
        <input
          type="text"
          className="min-w-[110px] flex-1 border-none bg-transparent text-[12.5px] outline-none"
          aria-label={ariaLabel}
          value={draft}
          placeholder={values.length === 0 ? placeholder : undefined}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); commit() }
            else if (e.key === 'Backspace' && draft === '' && values.length > 0) {
              onChange(values.slice(0, -1))
            }
          }}
          onBlur={commit}
        />
      </div>
    </div>
  )
}

export interface CustomerCardPanelProps {
  issuer: OcrParty
}

export function CustomerCardPanel({ issuer }: CustomerCardPanelProps) {
  const [aade, setAade] = useState<AadeState>({ status: 'idle' })
  const [fields, setFields] = useState<CardFields>(() => initialCardFields(issuer))
  const [creating, setCreating] = useState(false)
  const [created, setCreated] = useState<{ customerId: string } | null>(null)
  const [duplicate, setDuplicate] = useState<{ customerId: string; customerName: string } | null>(null)
  const attemptedAfmRef = useRef<string | null>(null)
  const appliedAadeRef = useRef(false)

  const cleanAfm = (issuer.afm ?? '').replace(/\D/g, '')
  const afmLooksValid = /^\d{9}$/.test(cleanAfm)

  useEffect(() => {
    if (!afmLooksValid) return
    if (attemptedAfmRef.current === cleanAfm) return
    attemptedAfmRef.current = cleanAfm
    setAade({ status: 'loading' })
    verifyIssuerAfm(cleanAfm)
      .then(res => {
        if (!res.ok) { setAade({ status: 'error', message: res.message }); return }
        if (!res.found) { setAade({ status: 'not_found' }); return }
        setAade({ status: 'found', company: res.company })
        if (!appliedAadeRef.current) {
          appliedAadeRef.current = true
          setFields(prev => ({
            ...prev,
            name: res.company.name || prev.name,
            afm: res.company.afm || prev.afm,
            doy: res.company.doy ?? prev.doy,
            address: res.company.address ?? prev.address,
            city: res.company.city ?? prev.city,
            zip: res.company.zip ?? prev.zip,
          }))
        }
      })
      .catch((err: unknown) => {
        setAade({ status: 'error', message: err instanceof Error ? err.message : 'Σφάλμα επαλήθευσης ΑΑΔΕ.' })
      })
  }, [cleanAfm, afmLooksValid])

  function patch(p: Partial<CardFields>) {
    setFields(prev => ({ ...prev, ...p }))
  }

  const officialNames = aade.status === 'found' ? [aade.company.name, aade.company.shortName] : []
  const nameMismatch = aade.status === 'found' && isNameMismatch(issuer.name, officialNames)

  function handleCreate() {
    if (!fields.name.trim()) {
      toast.error('Συμπλήρωσε την επωνυμία.')
      return
    }
    setCreating(true)
    setDuplicate(null)
    createCustomerFromOcr({
      name: fields.name,
      afm: fields.afm,
      address: fields.address,
      city: fields.city,
      zip: fields.zip,
      phones: fields.phones,
      emails: fields.emails,
    })
      .then(res => {
        if (res.ok) {
          setCreated({ customerId: res.customerId })
          toast.success('Δημιουργήθηκε η καρτέλα πελάτη.')
          return
        }
        if (res.duplicate) {
          setDuplicate({ customerId: res.customerId, customerName: res.customerName })
        }
        toast.error(res.message)
      })
      .catch((err: unknown) => toast.error(err instanceof Error ? err.message : 'Αποτυχία δημιουργίας καρτέλας.'))
      .finally(() => setCreating(false))
  }

  return (
    <div className="flex flex-col gap-3">
      {/* ── Κάρτα «Επαλήθευση ΑΑΔΕ» ─────────────────────────────────── */}
      <div className="rounded-2xl border border-border p-3.5">
        <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
          <span className="flex items-center gap-1.5 text-[12.5px] font-bold">
            <LuLandmark className="size-3.5" aria-hidden /> Επαλήθευση ΑΑΔΕ
          </span>
          {aade.status === 'loading' && (
            <span className="badge-pill muted"><LuLoaderCircle className="size-3 animate-spin" aria-hidden /> Έλεγχος…</span>
          )}
          {aade.status === 'found' && (
            <span className="badge-pill ok"><LuBadgeCheck className="size-3" aria-hidden /> Επαληθεύτηκε</span>
          )}
          {aade.status === 'not_found' && (
            <span className="badge-pill warn"><LuTriangleAlert className="size-3" aria-hidden /> Δεν βρέθηκε στο μητρώο</span>
          )}
          {aade.status === 'error' && (
            <span className="badge-pill warn"><LuTriangleAlert className="size-3" aria-hidden /> Σφάλμα ΑΑΔΕ</span>
          )}
          {aade.status === 'idle' && !afmLooksValid && (
            <span className="badge-pill muted">Χρειάζεται ΑΦΜ 9 ψηφίων</span>
          )}
        </div>

        {aade.status === 'found' && (
          <div className="flex flex-col gap-1 text-[12px]">
            <div><b>Επωνυμία:</b> {aade.company.name}{aade.company.shortName ? ` (${aade.company.shortName})` : ''}</div>
            {aade.company.doy && <div><b>ΔΟΥ:</b> {aade.company.doy}</div>}
            {(aade.company.address || aade.company.city) && (
              <div><b>Διεύθυνση:</b> {[aade.company.address, aade.company.city, aade.company.zip].filter(Boolean).join(', ')}</div>
            )}
            {aade.company.profession && <div><b>Δραστηριότητα:</b> {aade.company.profession}</div>}
            <div>
              <b>Κατάσταση:</b>{' '}
              <span style={{ color: aade.company.isActive ? 'var(--success)' : 'var(--destructive)' }}>
                {aade.company.isActive ? 'Ενεργή' : 'Ανενεργή'}
              </span>
              {aade.company.aadeStatus ? ` — ${aade.company.aadeStatus}` : ''}
            </div>
            {nameMismatch && (
              <div className="mt-1.5 flex items-center gap-1.5 text-[11.5px]" style={{ color: 'var(--warning)' }}>
                <LuTriangleAlert className="size-3.5 shrink-0" aria-hidden />
                Διαφορά επωνυμίας από το παραστατικό — προτείνεται η επίσημη «{aade.company.name}».
              </div>
            )}
          </div>
        )}
        {aade.status === 'not_found' && (
          <p className="text-[12px] text-muted-foreground">
            Δεν βρέθηκαν στοιχεία για το ΑΦΜ {cleanAfm} στο μητρώο της ΑΑΔΕ — έλεγξε το ΑΦΜ ή συμπλήρωσε τα στοιχεία χειροκίνητα παρακάτω.
          </p>
        )}
        {aade.status === 'error' && (
          <p className="text-[12px]" style={{ color: 'var(--warning)' }}>{aade.message}</p>
        )}
        {aade.status === 'idle' && !afmLooksValid && (
          <p className="text-[12px] text-muted-foreground">Το ΑΦΜ εκδότη δεν είναι 9 ψηφία — συμπλήρωσέ το στα στοιχεία εκδότη παραπάνω για αυτόματο έλεγχο ΑΑΔΕ.</p>
        )}
      </div>

      {/* ── Section «Στοιχεία καρτέλας» ─────────────────────────────── */}
      <div className="rounded-2xl border border-border p-3.5">
        <span className="mb-2.5 flex items-center gap-1.5 text-[12.5px] font-bold">
          <LuUserPlus className="size-3.5" aria-hidden /> Στοιχεία καρτέλας
        </span>
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
          <div className="sm:col-span-2">
            <FieldLabel icon={LuBuilding2}>Επωνυμία</FieldLabel>
            <TextInput ariaLabel="Επωνυμία καρτέλας" value={fields.name} onChange={v => patch({ name: v })} placeholder="—" />
          </div>
          <div>
            <FieldLabel icon={LuHash}>ΑΦΜ</FieldLabel>
            <TextInput ariaLabel="ΑΦΜ καρτέλας" value={fields.afm} onChange={v => patch({ afm: v })} placeholder="9 ψηφία" />
          </div>
          <div>
            <FieldLabel icon={LuLandmark}>ΔΟΥ</FieldLabel>
            <TextInput ariaLabel="ΔΟΥ καρτέλας" value={fields.doy} onChange={v => patch({ doy: v })} placeholder="—" />
          </div>
          <div>
            <FieldLabel icon={LuMapPin}>Διεύθυνση</FieldLabel>
            <TextInput ariaLabel="Διεύθυνση καρτέλας" value={fields.address} onChange={v => patch({ address: v })} placeholder="—" />
          </div>
          <div>
            <FieldLabel icon={LuBuilding2}>Πόλη</FieldLabel>
            <TextInput ariaLabel="Πόλη καρτέλας" value={fields.city} onChange={v => patch({ city: v })} placeholder="—" />
          </div>
          <div>
            <FieldLabel icon={LuHash}>ΤΚ</FieldLabel>
            <TextInput ariaLabel="ΤΚ καρτέλας" value={fields.zip} onChange={v => patch({ zip: v })} placeholder="—" />
          </div>
          <div>
            <FieldLabel icon={LuGlobe}>Website</FieldLabel>
            <TextInput ariaLabel="Website καρτέλας" value={fields.website} onChange={v => patch({ website: v })} placeholder="—" />
          </div>
          <div className="sm:col-span-2">
            <ChipsField label="Τηλέφωνα" icon={LuPhone} values={fields.phones} onChange={v => patch({ phones: v })} placeholder="Προσθήκη τηλεφώνου, Enter…" ariaLabel="Τηλέφωνα καρτέλας" />
          </div>
          <div className="sm:col-span-2">
            <ChipsField label="Emails" icon={LuMail} values={fields.emails} onChange={v => patch({ emails: v })} placeholder="Προσθήκη email, Enter…" ariaLabel="Emails καρτέλας" />
          </div>
        </div>

        {duplicate && (
          <div className="notice mt-3">
            <LuTriangleAlert aria-hidden />
            <span>
              Υπάρχει ήδη καρτέλα με αυτό το ΑΦΜ: «{duplicate.customerName}».{' '}
              <a href={`/customers/${duplicate.customerId}`} className="font-semibold underline">Άνοιγμα καρτέλας</a>
            </span>
          </div>
        )}

        <div className="mt-3 flex items-center gap-2.5">
          <Button type="button" onClick={handleCreate} disabled={creating || !!created}>
            {created ? (
              <><LuCheck className="size-3.5" aria-hidden /> Δημιουργήθηκε</>
            ) : creating ? (
              <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Δημιουργία…</>
            ) : (
              <><LuUserPlus className="size-3.5" aria-hidden /> Δημιουργία καρτέλας πελάτη</>
            )}
          </Button>
          {created && (
            <a
              href={`/customers/${created.customerId}`}
              className="inline-flex items-center gap-1 text-[12px] font-semibold text-(--info) hover:underline"
            >
              Άνοιγμα καρτέλας <LuExternalLink className="size-3" aria-hidden />
            </a>
          )}
        </div>
      </div>
    </div>
  )
}
