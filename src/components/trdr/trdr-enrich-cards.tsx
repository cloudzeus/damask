'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { RefreshCw, BadgeCheck, Download, Trash2, ScanEye, LoaderCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { removeTrdrDocument } from '@/lib/trdr/enrich-actions'
import { GemiSyncConfirmDialog } from './gemi-sync-dialog'
import { AadeCheckDialog } from './aade-check-dialog'
import { GemiDocsDialog } from './gemi-docs-dialog'

/**
 * Καρτέλα /partners/[id] (W2 T4 §0.8β) — «ΓΕΜΗ & ΑΑΔΕ», «ΚΑΔ», «Έγγραφα»
 * sections. Ίδιο glass-card idiom με partner-info-card.tsx/contacts-panel.tsx.
 * Server-fetched δεδομένα έρχονται ήδη formatted (strings) από το page.tsx
 * RSC — αυτά τα components μένουν καθαρά presentational + τα sync/apply
 * dialogs (reused από τη λίστα /partners, βλ. aade-check-dialog.tsx/gemi-sync-dialog.tsx).
 */

// ── ΓΕΜΗ & ΑΑΔΕ ──────────────────────────────────────────────────────────

export function GemiAadeCard({
  trdrId, name, afm, arGemi, gemiOffice, gemiStatus, foundingDate, aadeStatus, aadeFirmKind, gemiSyncedAt, aadeSyncedAt,
}: {
  trdrId: string
  name: string
  afm: string | null
  arGemi: string | null
  gemiOffice: string | null
  gemiStatus: string | null
  foundingDate: string | null
  aadeStatus: string | null
  aadeFirmKind: string | null
  gemiSyncedAt: string | null
  aadeSyncedAt: string | null
}) {
  const [gemiOpen, setGemiOpen] = React.useState(false)
  const [aadeOpen, setAadeOpen] = React.useState(false)

  const fields: [string, string | null][] = [
    ['Αριθμός ΓΕΜΗ', arGemi],
    ['Υπηρεσία ΓΕΜΗ', gemiOffice],
    ['Κατάσταση ΓΕΜΗ', gemiStatus],
    ['Ημ/νία ίδρυσης', foundingDate],
    ['Κατάσταση ΑΑΔΕ', aadeStatus],
    ['Είδος επιχείρησης (ΑΑΔΕ)', aadeFirmKind],
    ['Τελευταίος συγχρονισμός ΓΕΜΗ', gemiSyncedAt],
    ['Τελευταίος έλεγχος ΑΑΔΕ', aadeSyncedAt],
  ]

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          ΓΕΜΗ &amp; ΑΑΔΕ
        </div>
        <Button type="button" variant="outline" size="sm" onClick={() => setGemiOpen(true)}>
          <RefreshCw className="size-3.5" aria-hidden /> Συγχρονισμός ΓΕΜΗ
        </Button>
        <Button type="button" variant="outline" size="sm" disabled={!afm} onClick={() => setAadeOpen(true)}>
          <BadgeCheck className="size-3.5" aria-hidden /> Έλεγχος ΑΑΔΕ
        </Button>
      </div>

      <dl className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        {fields.map(([label, value]) => (
          <div key={label} className="min-w-0">
            <dt className="mb-0.5 text-[11px] font-semibold text-muted-foreground">{label}</dt>
            <dd className="truncate text-[13px]">{value ?? '—'}</dd>
          </div>
        ))}
      </dl>

      <GemiSyncConfirmDialog trdrId={trdrId} name={name} open={gemiOpen} onOpenChange={setGemiOpen} />
      <AadeCheckDialog trdrId={trdrId} afm={afm} open={aadeOpen} onOpenChange={setAadeOpen} />
    </div>
  )
}

// ── ΚΑΔ ──────────────────────────────────────────────────────────────────

export type TrdrKadRow = {
  id: string
  code: string
  description: string
  kind: 'PRIMARY' | 'SECONDARY'
  licensed: boolean
}

export function TrdrKadCard({ kads }: { kads: TrdrKadRow[] }) {
  return (
    <div className="glass stagger p-4">
      <div className="dotted-leader mb-2.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        ΚΑΔ ({kads.length})
      </div>
      {kads.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν καταχωρημένοι ΚΑΔ.</p>
      ) : (
        <div className="table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Κωδικός</th>
                <th>Περιγραφή</th>
                <th className="ctr">Επισημάνσεις</th>
              </tr>
            </thead>
            <tbody>
              {kads.map(k => (
                <tr key={k.id} className="dotted-row-bottom">
                  <td className="tabular-nums">{k.code}</td>
                  <td>{k.description}</td>
                  <td className="ctr">
                    <div className="flex flex-wrap items-center justify-end gap-1.5">
                      {k.kind === 'PRIMARY' && <span className="badge-pill ok">Πρωτεύων</span>}
                      {k.licensed && <span className="badge-pill warn">Άδεια λειτουργίας</span>}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}

// ── Έγγραφα ─────────────────────────────────────────────────────────────

export type TrdrDocumentRow = {
  id: string
  title: string
  docKind: 'DECISION' | 'PUBLICATION' | 'OTHER'
  createdAtLabel: string
  downloadable: boolean
}

const DOC_KIND_LABEL: Record<TrdrDocumentRow['docKind'], string> = {
  DECISION: 'Απόφαση',
  PUBLICATION: 'Δημοσίευση',
  OTHER: 'Άλλο',
}

export function TrdrDocumentsCard({
  trdrId, arGemi, documents,
}: {
  trdrId: string
  arGemi: string | null
  documents: TrdrDocumentRow[]
}) {
  const router = useRouter()
  const [gemiOpen, setGemiOpen] = React.useState(false)
  const [deletingId, setDeletingId] = React.useState<string | null>(null)

  async function handleDelete(doc: TrdrDocumentRow) {
    if (!window.confirm(`Διαγραφή του εγγράφου «${doc.title}»;`)) return
    setDeletingId(doc.id)
    try {
      await removeTrdrDocument(doc.id)
      toast.success('Το έγγραφο διαγράφηκε.')
      router.refresh()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η διαγραφή του εγγράφου απέτυχε.')
    } finally {
      setDeletingId(null)
    }
  }

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Έγγραφα ({documents.length})
        </div>
        <Button type="button" variant="outline" size="sm" disabled={!arGemi} onClick={() => setGemiOpen(true)}>
          <ScanEye className="size-3.5" aria-hidden /> Προβολή εγγράφων ΓΕΜΗ
        </Button>
      </div>

      {documents.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν αποθηκευμένα έγγραφα.</p>
      ) : (
        <div className="flex flex-col">
          {documents.map(doc => (
            <div key={doc.id} className="dotted-row-bottom flex flex-wrap items-center gap-2.5 py-2.5">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="badge-pill muted shrink-0">{DOC_KIND_LABEL[doc.docKind]}</span>
                  <b className="truncate text-[13px]">{doc.title}</b>
                </div>
                <div className="mt-0.5 text-[11.5px] text-muted-foreground">{doc.createdAtLabel}</div>
              </div>
              {doc.downloadable && (
                <a href={`/partners/${trdrId}/documents/${doc.id}`} className="btn-pill btn-glass h-8 px-3 text-[12px]">
                  <Download className="size-3.5" aria-hidden /> Λήψη
                </a>
              )}
              <Button
                type="button" variant="ghost" size="icon-sm" disabled={deletingId === doc.id}
                onClick={() => handleDelete(doc)} aria-label={`Διαγραφή ${doc.title}`}
              >
                {deletingId === doc.id ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <Trash2 className="size-3.5" aria-hidden />}
              </Button>
            </div>
          ))}
        </div>
      )}

      <GemiDocsDialog trdrId={trdrId} open={gemiOpen} onOpenChange={setGemiOpen} onSaved={() => router.refresh()} />
    </div>
  )
}
