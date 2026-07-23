'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuLoaderCircle, LuMailX, LuSend, LuCheck, LuX, LuCopy } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  listDocumentRequests, resendDocumentRequest, cancelDocumentRequest, fulfillDocumentRequest,
  type DocumentRequestItem,
} from '@/lib/pm/actions'
import { NewDocumentRequestDialog } from './new-document-request-dialog'

/** Καταστάσεις που δεν επιτρέπουν πια επαναποστολή/ακύρωση (κλειστό αίτημα). */
const TERMINAL_STATUSES = new Set(['CANCELLED', 'FULFILLED'])

function statusBadge(status: string) {
  switch (status) {
    case 'PENDING':
      return <span className="badge-pill muted shrink-0">Εκκρεμεί</span>
    case 'UPLOADED':
      return <span className="badge-pill info shrink-0">Ανέβηκε</span>
    case 'FULFILLED':
      return <span className="badge-pill ok shrink-0">Ολοκληρώθηκε</span>
    case 'CANCELLED':
      return <span className="badge-pill shrink-0" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>Ακυρώθηκε</span>
    case 'EXPIRED':
      return <span className="badge-pill muted shrink-0">Έληξε</span>
    default:
      return <span className="badge-pill muted shrink-0">{status}</span>
  }
}

/**
 * «Αιτήματα εγγράφων» tab (C2d — office UI) — λίστα αιτημάτων εγγράφων προς
 * τον πελάτη της αίτησης (magic-link ανέβασμα χωρίς σύνδεση). Self-fetching
 * client component, mirror του idiom certification-tab.tsx / obligations-tab.tsx.
 */
export function DocumentRequestsTab({ applicationId }: { applicationId: string }) {
  const [items, setItems] = React.useState<DocumentRequestItem[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    listDocumentRequests(applicationId)
      .then(setItems)
      .catch(() => setError('Η φόρτωση των αιτημάτων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId])

  React.useEffect(() => { load() }, [load])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Αιτήματα εγγράφων ({items.length})
        </div>
        <NewDocumentRequestDialog applicationId={applicationId} onCreated={load} />
      </div>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[12.5px] text-coral">{error}</p>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <LuMailX className="size-6 text-muted-foreground" aria-hidden />
          <p className="text-[12.5px] text-muted-foreground">Δεν υπάρχουν αιτήματα εγγράφων.</p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {items.map(item => (
            <DocumentRequestRow key={item.id} item={item} onReload={load} />
          ))}
        </div>
      )}
    </section>
  )
}

function DocumentRequestRow({ item, onReload }: { item: DocumentRequestItem; onReload: () => void }) {
  const [busy, setBusy] = React.useState<'resend' | 'cancel' | 'fulfill' | null>(null)
  const [resendUrl, setResendUrl] = React.useState<string | null>(null)

  const terminal = TERMINAL_STATUSES.has(item.status)

  async function handleResend() {
    setBusy('resend')
    try {
      const { url } = await resendDocumentRequest(item.id)
      toast.success('Ο σύνδεσμος στάλθηκε ξανά.')
      setResendUrl(url)
      onReload()
    } catch {
      toast.error('Η επαναποστολή απέτυχε.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCancel() {
    if (!window.confirm(`Ακύρωση του αιτήματος «${item.title}»;`)) return
    setBusy('cancel')
    try {
      await cancelDocumentRequest(item.id)
      toast.success('Το αίτημα ακυρώθηκε.')
      onReload()
    } catch {
      toast.error('Η ακύρωση απέτυχε.')
    } finally {
      setBusy(null)
    }
  }

  async function handleFulfill() {
    setBusy('fulfill')
    try {
      await fulfillDocumentRequest(item.id)
      toast.success('Το αίτημα επιβεβαιώθηκε.')
      onReload()
    } catch {
      toast.error('Η επιβεβαίωση απέτυχε.')
    } finally {
      setBusy(null)
    }
  }

  async function handleCopy() {
    if (!resendUrl) return
    try {
      await navigator.clipboard.writeText(resendUrl)
      toast.success('Ο σύνδεσμος αντιγράφηκε.')
    } catch {
      toast.error('Η αντιγραφή απέτυχε.')
    }
  }

  return (
    <div className="rounded-2xl border border-border bg-card/60 p-3">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-[13px] font-semibold">{item.title}</span>
            {statusBadge(item.status)}
            {item.uploadedAt && (
              <span className="badge-pill ok shrink-0">
                <LuCheck className="size-3" aria-hidden /> Ανέβηκε {new Date(item.uploadedAt).toLocaleDateString('el-GR')}
              </span>
            )}
          </div>
          {item.description && <p className="mt-1 text-[12px] text-muted-foreground">{item.description}</p>}
          <p className="mt-1 text-[11.5px] text-muted-foreground">
            Παραλήπτης: {item.email} · Λήξη: {new Date(item.expiresAt).toLocaleDateString('el-GR')}
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {!terminal && (
            <Button type="button" size="sm" variant="outline" onClick={handleResend} disabled={busy !== null}>
              {busy === 'resend' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuSend className="size-3.5" aria-hidden />}
              Επαναποστολή
            </Button>
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            onClick={handleFulfill}
            disabled={busy !== null || item.status !== 'UPLOADED'}
          >
            {busy === 'fulfill' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuCheck className="size-3.5" aria-hidden />}
            Επιβεβαίωση
          </Button>
          {!terminal && (
            <button
              type="button"
              onClick={handleCancel}
              disabled={busy !== null}
              className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive disabled:cursor-not-allowed disabled:opacity-50"
              aria-label={`Ακύρωση — ${item.title}`}
              title="Ακύρωση"
            >
              {busy === 'cancel' ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuX className="size-3.5" aria-hidden />}
            </button>
          )}
        </div>
      </div>

      {resendUrl && (
        <div className="mt-2.5 flex items-center gap-1.5 pt-2.5" style={{ borderTop: '1px dotted var(--dotted)' }}>
          <Input value={resendUrl} readOnly className="h-8 text-[11.5px]" onFocus={e => e.target.select()} />
          <Button type="button" size="sm" variant="outline" onClick={handleCopy}>
            <LuCopy className="size-3.5" aria-hidden /> Αντιγραφή
          </Button>
        </div>
      )}
    </div>
  )
}
