'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuUpload, LuDownload, LuLoaderCircle, LuBadgeCheck, LuBox } from 'react-icons/lu'
import { cn } from '@/lib/utils'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  listCertifications, upsertCertification, uploadCertificationFile,
  type CertificationItem,
} from '@/lib/pm/actions'
import { CERT_FILE_KINDS, type CertFileKind } from '@/lib/pm/cert-prep'

function formatEUR(v: number): string {
  return `${v.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`
}

/**
 * Μετατρέπει ArrayBuffer → base64 σε chunks (32KB) — mirror του idiom στο
 * application-documents.tsx (spread ενός μεγάλου Uint8Array μπορεί να
 * ξεπεράσει το όριο ορισμάτων της μηχανής JS).
 */
function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  const chunkSize = 0x8000
  let binary = ''
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize)
    binary += String.fromCharCode(...chunk)
  }
  return btoa(binary)
}

function extOf(name: string): string {
  const i = name.lastIndexOf('.')
  return i >= 0 ? name.slice(i + 1).toLowerCase() : ''
}

const FILE_SLOTS: { kind: CertFileKind; label: string }[] = [
  { kind: 'photo', label: 'Φωτογραφία' },
  { kind: 'bankStatement', label: 'Εξτρέ τράπεζας' },
  { kind: 'newUnusedCert', label: 'Βεβαίωση καινούργιου & αμεταχείριστου' },
]

/**
 * Παράγει τη λίστα ελλείψεων ενός item, mirror της λογικής
 * certificationComplete (src/lib/pm/cert-prep.ts) — χρησιμοποιείται και για
 * το hint κάτω από το κλειδωμένο verified Switch.
 */
function missingPieces(item: CertificationItem): string[] {
  const missing: string[] = []
  if (!item.serialNumber && !item.location) missing.push('ταυτοποίηση (serial ή τοποθεσία)')
  if (!item.assetRegistryRef) missing.push('μητρώο παγίων')
  if (!item.photoKey) missing.push('φωτογραφία')
  if (!item.paid) missing.push('πληρωμή')
  if (!item.bankStatementKey) missing.push('εξτρέ τράπεζας')
  if (!item.newUnusedCertKey) missing.push('βεβαίωση καινούργιου-αμεταχείριστου')
  return missing
}

/**
 * «Πιστοποίηση» tab (C2a.2) — φυσικό αντικείμενο επένδυσης ανά ενεργή
 * δαπάνη: serial/τοποθεσία/μητρώο παγίων + πληρωμή + επαλήθευση, συν τρία
 * uploads (φωτογραφία / εξτρέ τράπεζας / βεβαίωση καινούργιου-αμεταχείριστου).
 * Self-fetching client component, mirror του idiom obligations-tab.tsx /
 * expenses-tab.tsx. Το verified Switch κλειδώνει μέχρι item.complete.
 */
export function CertificationTab({ applicationId, programId }: { applicationId: string; programId: string }) {
  const router = useRouter()
  const [items, setItems] = React.useState<CertificationItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listCertifications(applicationId)
      .then(setItems)
      .catch(() => setError('Η φόρτωση της πιστοποίησης απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  React.useEffect(() => { load() }, [load])

  function patchLocal(expenseId: string, patch: Partial<CertificationItem>) {
    setItems(prev => prev.map(i => (i.expenseId === expenseId ? { ...i, ...patch } : i)))
  }

  async function persist(expenseId: string, patch: Parameters<typeof upsertCertification>[1]) {
    try {
      await upsertCertification(expenseId, patch)
      router.refresh()
      load()
    } catch {
      toast.error('Η ενημέρωση απέτυχε.')
      load()
    }
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 dotted-leader text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Πιστοποίηση φυσικού αντικειμένου ({items.length})
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuBox className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">Δεν υπάρχουν ενεργές δαπάνες προς πιστοποίηση.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map(item => (
            <CertificationCard
              key={item.expenseId}
              item={item}
              applicationId={applicationId}
              programId={programId}
              onPatch={patch => patchLocal(item.expenseId, patch)}
              onPersist={patch => persist(item.expenseId, patch)}
              onReload={load}
            />
          ))}
        </div>
      )}
    </section>
  )
}

function CertificationCard({
  item, applicationId, programId, onPatch, onPersist, onReload,
}: {
  item: CertificationItem
  applicationId: string
  programId: string
  onPatch: (patch: Partial<CertificationItem>) => void
  onPersist: (patch: Parameters<typeof upsertCertification>[1]) => void
  onReload: () => void
}) {
  const missing = missingPieces(item)

  function handleTextBlur(field: 'serialNumber' | 'location' | 'assetRegistryRef', value: string) {
    const next = value.trim() ? value.trim() : null
    if (next === item[field]) return
    onPatch({ [field]: next } as Partial<CertificationItem>)
    onPersist({ [field]: next })
  }

  function handleDateBlur(value: string) {
    const next = value ? value : null
    const prevValue = item.assetRegistryDate ? item.assetRegistryDate.slice(0, 10) : null
    if (next === prevValue) return
    onPatch({ assetRegistryDate: next ? new Date(next).toISOString() : null })
    onPersist({ assetRegistryDate: next })
  }

  function handlePaidChange(paid: boolean) {
    onPatch({ paid })
    onPersist({ paid })
  }

  function handleVerifiedChange(verified: boolean) {
    if (verified && !item.complete) return
    onPatch({ verified })
    onPersist({ verified })
  }

  function handleNotesBlur(value: string) {
    onPersist({ notes: value.trim() ? value.trim() : null })
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <span className="text-[13px] font-semibold">{item.expenseDescription}</span>{' '}
          <span className="text-[11.5px] text-muted-foreground">{formatEUR(item.amount)}</span>
        </div>
        {item.complete ? (
          <span className="badge-pill ok shrink-0"><LuBadgeCheck className="size-3" aria-hidden /> Πιστοποιημένο</span>
        ) : missing.length < 6 ? (
          <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Ελλιπές</span>
        ) : (
          <span className="badge-pill muted shrink-0">Εκκρεμεί</span>
        )}
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-4">
        <div className="field !mb-0">
          <label htmlFor={`cert-serial-${item.expenseId}`}>Serial number</label>
          <Input
            id={`cert-serial-${item.expenseId}`}
            defaultValue={item.serialNumber ?? ''}
            placeholder="—"
            onBlur={e => handleTextBlur('serialNumber', e.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`cert-location-${item.expenseId}`}>Τοποθεσία</label>
          <Input
            id={`cert-location-${item.expenseId}`}
            defaultValue={item.location ?? ''}
            placeholder="—"
            onBlur={e => handleTextBlur('location', e.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`cert-registry-ref-${item.expenseId}`}>Μητρώο παγίων (αρ.)</label>
          <Input
            id={`cert-registry-ref-${item.expenseId}`}
            defaultValue={item.assetRegistryRef ?? ''}
            placeholder="—"
            onBlur={e => handleTextBlur('assetRegistryRef', e.target.value)}
            className="h-8 text-[12.5px]"
          />
        </div>
        <div className="field !mb-0">
          <label htmlFor={`cert-registry-date-${item.expenseId}`}>Μητρώο παγίων (ημ/νία)</label>
          <input
            id={`cert-registry-date-${item.expenseId}`}
            type="date"
            defaultValue={item.assetRegistryDate ? item.assetRegistryDate.slice(0, 10) : ''}
            onBlur={e => handleDateBlur(e.target.value)}
            className="h-8 w-full rounded-full border border-border bg-card px-3 text-[12.5px] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </div>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-2">
          <Switch checked={item.paid} onCheckedChange={handlePaidChange} id={`cert-paid-${item.expenseId}`} />
          <label htmlFor={`cert-paid-${item.expenseId}`} className="text-[12.5px] font-semibold">Πληρώθηκε</label>
        </div>
        <div className="flex items-center gap-2">
          <Switch
            checked={item.verified}
            onCheckedChange={handleVerifiedChange}
            disabled={!item.complete && !item.verified}
            id={`cert-verified-${item.expenseId}`}
          />
          <label htmlFor={`cert-verified-${item.expenseId}`} className="text-[12.5px] font-semibold">Επαληθεύτηκε</label>
        </div>
        {!item.complete && (
          <span className="text-[11px] text-muted-foreground">
            Λείπουν: {missing.join(', ')}
          </span>
        )}
      </div>

      <div className="field !mt-2.5 !mb-0">
        <label htmlFor={`cert-notes-${item.expenseId}`}>Σημείωση</label>
        <textarea
          key={`notes-${item.expenseId}-${item.notes ?? ''}`}
          id={`cert-notes-${item.expenseId}`}
          className="cms-textarea"
          rows={2}
          defaultValue={item.notes ?? ''}
          onBlur={e => handleNotesBlur(e.target.value)}
        />
      </div>

      <div className="mt-2.5 grid grid-cols-1 gap-2.5 pt-2.5 sm:grid-cols-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
        {FILE_SLOTS.map(slot => (
          <CertFileSlot
            key={slot.kind}
            slot={slot}
            item={item}
            applicationId={applicationId}
            programId={programId}
            onReload={onReload}
          />
        ))}
      </div>
    </div>
  )
}

const KEY_FIELD: Record<CertFileKind, keyof CertificationItem> = {
  photo: 'photoKey',
  bankStatement: 'bankStatementKey',
  newUnusedCert: 'newUnusedCertKey',
}

function CertFileSlot({
  slot, item, applicationId, programId, onReload,
}: {
  slot: { kind: CertFileKind; label: string }
  item: CertificationItem
  applicationId: string
  programId: string
  onReload: () => void
}) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [uploading, setUploading] = React.useState(false)
  const key = item[KEY_FIELD[slot.kind]] as string | null

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buffer)
      await uploadCertificationFile(item.expenseId, slot.kind, {
        base64,
        mimeType: file.type || 'application/octet-stream',
        ext: extOf(file.name),
      })
      toast.success('Το αρχείο ανέβηκε.')
      onReload()
      router.refresh()
    } catch {
      toast.error('Το ανέβασμα απέτυχε.')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11.5px] font-semibold text-muted-foreground">{slot.label}</span>
      <div className="flex flex-wrap items-center gap-1.5">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuUpload className="size-3" aria-hidden />}
          {uploading ? 'Ανέβασμα…' : key ? 'Αντικατάσταση' : 'Ανέβασμα'}
        </button>
        {key && (
          <a
            href={`/programs/${programId}/applications/${applicationId}/certifications/${item.expenseId}/${slot.kind}`}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold transition-colors hover:bg-muted',
            )}
            style={{ color: 'var(--success)' }}
            title="Λήψη"
          >
            <LuDownload className="size-3" aria-hidden /> Λήψη
          </a>
        )}
      </div>
    </div>
  )
}
