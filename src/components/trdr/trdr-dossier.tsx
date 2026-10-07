'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuLoaderCircle, LuTrash2, LuDownload, LuFileCheck2, LuTriangleAlert, LuCalendarClock, LuScanText } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import {
  listTrdrDossier, listDocumentTypes, updateTrdrDossierDoc, removeTrdrDossierDoc,
  type DossierDocItem, type DocumentTypeOption,
} from '@/lib/documents/actions'
import { ScanFormDialog } from '@/components/tax/scan-form-dialog'
import { DocumentPreviewButton } from '@/components/ui/document-preview'
import { DossierSmartUpload } from './dossier-smart-upload'

/**
 * Αποθήκη δικαιολογητικών ανά πελάτη — ό,τι έχει ήδη η εταιρία (τύπος + αρχείο +
 * ημ. λήξης). Έτσι, στην ένταξη σε πρόγραμμα, ό,τι υπάρχει valid δεν ξαναζητείται.
 */

const DATE_FMT = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
function fmtDate(iso: string | null): string { return iso ? DATE_FMT.format(new Date(iso)) : '—' }

export function TrdrDossier({ trdrId, trdrName, canEdit }: { trdrId: string; trdrName: string; canEdit: boolean }) {
  const [docs, setDocs] = React.useState<DossierDocItem[]>([])
  const [types, setTypes] = React.useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)
  const [scanOpen, setScanOpen] = React.useState(false)

  const load = React.useCallback(() => {
    setLoading(true)
    setError(null)
    Promise.all([listTrdrDossier(trdrId), listDocumentTypes()])
      .then(([d, t]) => { setDocs(d); setTypes(t) })
      .catch(() => setError('Η φόρτωση των δικαιολογητικών απέτυχε.'))
      .finally(() => setLoading(false))
  }, [trdrId])

  React.useEffect(() => {
    let cancelled = false
    Promise.all([listTrdrDossier(trdrId), listDocumentTypes()])
      .then(([d, t]) => { if (!cancelled) { setDocs(d); setTypes(t) } })
      .catch(() => { if (!cancelled) setError('Η φόρτωση των δικαιολογητικών απέτυχε.') })
      .finally(() => { if (!cancelled) setLoading(false) })
    return () => { cancelled = true }
  }, [trdrId])

  async function handleExpiryChange(doc: DossierDocItem, value: string) {
    const next = value || null
    if ((doc.expiresAt ? doc.expiresAt.slice(0, 10) : null) === next) return
    setDocs(prev => prev.map(d => (d.id === doc.id ? { ...d, expiresAt: next ? new Date(next).toISOString() : null, expired: next ? new Date(next).getTime() < Date.now() : false } : d)))
    try {
      await updateTrdrDossierDoc(doc.id, { expiresAt: next })
    } catch {
      toast.error('Η ενημέρωση λήξης απέτυχε.')
      load()
    }
  }

  async function handleRemove(doc: DossierDocItem) {
    if (!window.confirm(`Διαγραφή του δικαιολογητικού «${doc.name}»;`)) return
    const prev = docs
    setDocs(prev.filter(d => d.id !== doc.id))
    try {
      await removeTrdrDossierDoc(doc.id)
      toast.success('Το δικαιολογητικό διαγράφηκε.')
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
      setDocs(prev)
    }
  }

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[length:var(--fs-10-5)] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Δικαιολογητικά εταιρίας ({docs.length})
        </div>
        {canEdit && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setScanOpen(true)}
              title="Σάρωση συμπληρωμένου εντύπου (Οδηγός Εντύπων) → αποθήκευση τιμών"
            >
              <LuScanText className="size-3.5" aria-hidden /> Σάρωση τιμών
            </Button>
            <DossierSmartUpload trdrId={trdrId} types={types} onDone={load} />
          </div>
        )}
      </div>
      {canEdit && <ScanFormDialog trdrId={trdrId} trdrName={trdrName} open={scanOpen} onOpenChange={setScanOpen} onSaved={load} />}

      <p className="mb-3 text-[length:var(--fs-11-5)] text-muted-foreground">
        Ό,τι δικαιολογητικά έχει ήδη η εταιρία (με ημ. λήξης όπου ισχύει). Στην ένταξη σε πρόγραμμα, όσα υπάρχουν <strong>σε ισχύ</strong> δεν ξαναζητούνται.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[length:var(--fs-12-5)] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[length:var(--fs-12-5)] text-coral">{error}</p>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-[length:var(--fs-12-5)] text-muted-foreground">
          Δεν υπάρχουν αποθηκευμένα δικαιολογητικά για αυτή την εταιρία.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {docs.map(doc => (
            <div key={doc.id} className="rounded-2xl border border-border bg-card/60 p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <LuFileCheck2 className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <span className="text-[length:var(--fs-13)] font-semibold">{doc.documentTypeName}</span>
                    <ExpiryBadge doc={doc} />
                    {doc.programTitle ? (
                      <span className="badge-pill muted max-w-[16rem] truncate" title={doc.programTitle}>
                        {doc.programTitle}{doc.reusable ? ' · και για άλλα' : ' · μόνο εδώ'}
                      </span>
                    ) : (
                      <span className="badge-pill muted">Γενικό</span>
                    )}
                  </div>
                  <div className="mt-0.5 truncate text-[length:var(--fs-11-5)] text-muted-foreground">{doc.name}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {(doc.typeExpires || doc.expiresAt) && (
                    <label className="flex items-center gap-1 text-[length:var(--fs-11)] text-muted-foreground">
                      <LuCalendarClock className="size-3.5" aria-hidden />
                      <input
                        type="date"
                        defaultValue={doc.expiresAt ? doc.expiresAt.slice(0, 10) : ''}
                        onBlur={e => canEdit && handleExpiryChange(doc, e.target.value)}
                        disabled={!canEdit}
                        aria-label="Ημερομηνία λήξης"
                        className="h-8 rounded-full border border-border bg-card px-2 text-[length:var(--fs-12)] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                    </label>
                  )}
                  <DocumentPreviewButton url={`/partners/${trdrId}/dossier/${doc.id}`} name={doc.name} mimeType={doc.mimeType} />
                  <a
                    href={`/partners/${trdrId}/dossier/${doc.id}`}
                    className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    title="Λήψη"
                    aria-label={`Λήψη — ${doc.name}`}
                  >
                    <LuDownload className="size-3.5" aria-hidden />
                  </a>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => handleRemove(doc)}
                      className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                      title="Διαγραφή"
                      aria-label={`Διαγραφή — ${doc.name}`}
                    >
                      <LuTrash2 className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

function ExpiryBadge({ doc }: { doc: DossierDocItem }) {
  if (!doc.typeExpires && !doc.expiresAt) return <span className="badge-pill muted">Δεν λήγει</span>
  if (!doc.expiresAt) return <span className="badge-pill warn">Χωρίς ημ. λήξης</span>
  if (doc.expired) {
    return (
      <span className="badge-pill" style={{ color: 'var(--coral)', background: 'var(--coral-soft)' }}>
        <LuTriangleAlert className="size-3" aria-hidden /> Έληξε {fmtDate(doc.expiresAt)}
      </span>
    )
  }
  return <span className="badge-pill ok">Σε ισχύ έως {fmtDate(doc.expiresAt)}</span>
}
