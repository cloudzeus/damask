'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2, X, PartyPopper, CircleDashed,
} from 'lucide-react'
import { xhrUpload } from '@/components/ui/file-dropzone'
import type { PublicFileRequest } from '@/lib/file-requests/public'

/**
 * Δημόσιος uploader δικαιολογητικών (token-gated, ΧΩΡΙΣ session). Ο πελάτης
 * σέρνει/επιλέγει αρχεία και συσχετίζει ΚΑΘΕ αρχείο με ένα ζητούμενο στοιχείο
 * (combo box) πριν τη μεταφόρτωση. Upload = POST multipart {file,itemId} στο
 * /api/file-requests/{token}/upload (αποθήκευση Bunny + συσχέτιση + recompute
 * ολοκλήρωσης server-side). Το backend στέλνει και τα emails στην ολοκλήρωση.
 */

type OkRequest = Extract<PublicFileRequest, { ok: true }>

/** Τοπική κατάσταση ενός ζητούμενου στοιχείου — «uploaded» = υπάρχει fileUrl (ίδιο
 * κριτήριο με τον server: required.every(i => i.fileUrl) → COMPLETED). */
type ItemState = {
  id: string
  label: string
  description: string | null
  required: boolean
  uploaded: boolean
  fileName: string | null
}

type QueueStatus = 'idle' | 'uploading' | 'done' | 'error'
type QueuedFile = {
  id: string
  name: string
  size: number
  itemId: string
  status: QueueStatus
  progress: number
  error: string | null
}

type UploadResult = { ok?: true; url: string; name: string; size: number }

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

export function CustomerUploader({ token, request }: { token: string; request: OkRequest }) {
  const [items, setItems] = useState<ItemState[]>(() =>
    request.items.map(i => ({
      id: i.id,
      label: i.label,
      description: i.description,
      required: i.required,
      uploaded: i.uploaded,
      fileName: i.fileName,
    })),
  )
  const [queue, setQueue] = useState<QueuedFile[]>([])
  const [isDragOver, setIsDragOver] = useState(false)

  const inputRef = useRef<HTMLInputElement>(null)
  const filesRef = useRef<Map<string, File>>(new Map())
  const controllersRef = useRef<Map<string, AbortController>>(new Map())

  // Πρώτο ακόμη εκκρεμές item — default επιλογή για νέα αρχεία.
  function firstPendingItemId(current: ItemState[]): string {
    const pending = current.find(i => !i.uploaded)
    return (pending ?? current[0])?.id ?? ''
  }

  function updateQueued(id: string, patch: Partial<QueuedFile>) {
    setQueue(prev => prev.map(q => (q.id === id ? { ...q, ...patch } : q)))
  }

  function addFiles(fileList: FileList | File[]) {
    const incoming = Array.from(fileList)
    if (incoming.length === 0) return
    const defaultItemId = firstPendingItemId(items)
    const newRows: QueuedFile[] = incoming.map(file => {
      const id = crypto.randomUUID()
      filesRef.current.set(id, file)
      return { id, name: file.name, size: file.size, itemId: defaultItemId, status: 'idle', progress: 0, error: null }
    })
    setQueue(prev => [...prev, ...newRows])
  }

  async function runUpload(id: string) {
    const file = filesRef.current.get(id)
    const row = queue.find(q => q.id === id)
    if (!file || !row) return
    if (!row.itemId) {
      updateQueued(id, { status: 'error', error: 'Επίλεξε σε ποιο δικαιολογητικό αντιστοιχεί.' })
      return
    }
    const controller = new AbortController()
    controllersRef.current.set(id, controller)
    updateQueued(id, { status: 'uploading', progress: 0, error: null })

    const fd = new FormData()
    fd.append('file', file)
    fd.append('itemId', row.itemId)

    try {
      const res = await xhrUpload<UploadResult>(
        `/api/file-requests/${token}/upload`,
        fd,
        pct => updateQueued(id, { progress: Math.max(0, Math.min(100, Math.round(pct))) }),
        controller.signal,
      )
      updateQueued(id, { status: 'done', progress: 100 })
      setItems(prev => prev.map(it => (it.id === row.itemId ? { ...it, uploaded: true, fileName: res?.name ?? file.name } : it)))
    } catch (err) {
      if (controller.signal.aborted) return
      updateQueued(id, { status: 'error', error: err instanceof Error ? err.message : 'Η μεταφόρτωση απέτυχε.' })
    } finally {
      controllersRef.current.delete(id)
    }
  }

  function removeRow(id: string) {
    controllersRef.current.get(id)?.abort()
    controllersRef.current.delete(id)
    filesRef.current.delete(id)
    setQueue(prev => prev.filter(q => q.id !== id))
  }

  function onDrop(e: DragEvent<HTMLDivElement>) {
    e.preventDefault()
    setIsDragOver(false)
    if (e.dataTransfer.files?.length) addFiles(e.dataTransfer.files)
  }

  // Ακύρωση εκκρεμών μεταφορτώσεων στο unmount (χωρίς setState).
  useEffect(() => {
    const controllers = controllersRef.current
    return () => { controllers.forEach(c => c.abort()) }
  }, [])

  const requiredItems = useMemo(() => items.filter(i => i.required), [items])
  const allRequiredDone = requiredItems.length > 0 && requiredItems.every(i => i.uploaded)
  const uploadedCount = items.filter(i => i.uploaded).length

  return (
    <div style={{ display: 'grid', gap: '1.1rem' }}>
      {allRequiredDone && (
        <div role="status" style={successBanner}>
          <PartyPopper size={20} aria-hidden style={{ flexShrink: 0 }} />
          <span>Ολοκληρώθηκε — λάβαμε όλα τα δικαιολογητικά. Θα λάβεις επιβεβαίωση στο email σου.</span>
        </div>
      )}

      {/* Checklist ζητούμενων στοιχείων */}
      <section aria-label="Ζητούμενα δικαιολογητικά" style={{ display: 'grid', gap: '0.55rem' }}>
        <div style={sectionTitle}>
          Ζητούμενα δικαιολογητικά
          <span style={{ fontWeight: 600, color: 'var(--muted-foreground, #64748b)' }}> · {uploadedCount}/{items.length}</span>
        </div>
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.5rem' }}>
          {items.map(item => (
            <li key={item.id} style={itemCard(item.uploaded)}>
              <span aria-hidden style={{ flexShrink: 0, marginTop: '0.1rem', color: item.uploaded ? 'var(--success, #059669)' : 'var(--muted-foreground, #94a3b8)' }}>
                {item.uploaded ? <CheckCircle2 size={18} /> : <CircleDashed size={18} />}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{item.label}</span>
                  <span className={item.required ? 'badge-pill danger' : 'badge-pill muted'} lang="el">
                    {item.required ? 'Υποχρεωτικό' : 'Προαιρετικό'}
                  </span>
                </div>
                {item.description && (
                  <p style={{ margin: '0.2rem 0 0', fontSize: '0.78rem', lineHeight: 1.45, color: 'var(--muted-foreground, #64748b)' }}>{item.description}</p>
                )}
                <p style={{ margin: '0.3rem 0 0', fontSize: '0.76rem', color: item.uploaded ? 'var(--success, #059669)' : 'var(--muted-foreground, #94a3b8)' }}>
                  {item.uploaded ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '0.3rem' }}>
                      <FileText size={13} aria-hidden />
                      Ανέβηκε{item.fileName ? `: ${item.fileName}` : ''}
                    </span>
                  ) : 'Εκκρεμεί'}
                </p>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Ζώνη μεταφόρτωσης */}
      <div
        role="button"
        tabIndex={0}
        aria-label="Ζώνη μεταφόρτωσης — σύρε αρχεία εδώ ή πάτησε για επιλογή"
        onClick={() => inputRef.current?.click()}
        onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); inputRef.current?.click() } }}
        onDragOver={e => { e.preventDefault(); setIsDragOver(true) }}
        onDragLeave={() => setIsDragOver(false)}
        onDrop={onDrop}
        style={dropZone(isDragOver)}
      >
        <UploadCloud size={30} strokeWidth={1.6} aria-hidden style={{ color: 'var(--muted-foreground, #64748b)' }} />
        <p style={{ margin: '0.5rem 0 0', fontSize: '0.9rem', fontWeight: 600 }}>Σύρε αρχεία εδώ ή πάτησε για επιλογή</p>
        <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: 'var(--muted-foreground, #94a3b8)' }}>
          Για κάθε αρχείο, επίλεξε σε ποιο δικαιολογητικό αντιστοιχεί.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </div>

      {/* Ουρά αρχείων προς μεταφόρτωση */}
      {queue.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
          {queue.map(row => {
            const selectId = `map-${row.id}`
            const busy = row.status === 'uploading'
            return (
              <li key={row.id} style={queueRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <FileText size={16} aria-hidden style={{ flexShrink: 0, color: 'var(--muted-foreground, #64748b)' }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: '0.85rem', fontWeight: 600 }}>{row.name}</span>
                  <span style={{ flexShrink: 0, fontSize: '0.72rem', color: 'var(--muted-foreground, #94a3b8)', fontVariantNumeric: 'tabular-nums' }}>{formatBytes(row.size)}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}><QueueBadge status={row.status} /></span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <label htmlFor={selectId} style={srOnly}>Αντιστοίχιση δικαιολογητικού για το αρχείο {row.name}</label>
                  <select
                    id={selectId}
                    value={row.itemId}
                    disabled={busy || row.status === 'done'}
                    onChange={e => updateQueued(row.id, { itemId: e.target.value, error: null })}
                    style={selectStyle}
                  >
                    {items.map(it => (
                      <option key={it.id} value={it.id}>
                        {it.label}{it.uploaded ? ' (αντικατάσταση)' : ''}{it.required ? '' : ' — προαιρετικό'}
                      </option>
                    ))}
                  </select>

                  {row.status !== 'done' && (
                    <button
                      type="button"
                      onClick={() => runUpload(row.id)}
                      disabled={busy || !row.itemId}
                      style={{ ...primaryBtn, opacity: busy || !row.itemId ? 0.6 : 1, cursor: busy || !row.itemId ? 'default' : 'pointer' }}
                    >
                      {busy ? <Loader2 size={15} className="animate-spin" aria-hidden /> : <UploadCloud size={15} aria-hidden />}
                      {row.status === 'error' ? 'Επανάληψη' : 'Μεταφόρτωση'}
                    </button>
                  )}

                  <button type="button" onClick={() => removeRow(row.id)} aria-label={`Αφαίρεση ${row.name}`} style={iconBtn}>
                    <X size={16} aria-hidden />
                  </button>
                </div>

                {busy && (
                  <div style={progressTrack} aria-hidden>
                    <div style={{ ...progressFill, width: `${row.progress}%` }} />
                  </div>
                )}
                {row.status === 'error' && row.error && (
                  <p role="alert" style={{ margin: 0, fontSize: '0.76rem', color: 'var(--coral, #e11d48)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                    <AlertTriangle size={13} aria-hidden /> {row.error}
                  </p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function QueueBadge({ status }: { status: QueueStatus }) {
  switch (status) {
    case 'uploading':
      return <span className="badge-pill info" lang="el"><Loader2 size={11} className="animate-spin" aria-hidden /> Μεταφόρτωση</span>
    case 'done':
      return <span className="badge-pill ok" lang="el"><CheckCircle2 size={11} aria-hidden /> Ολοκληρώθηκε</span>
    case 'error':
      return <span className="badge-pill danger" lang="el"><AlertTriangle size={11} aria-hidden /> Σφάλμα</span>
    default:
      return <span className="badge-pill muted" lang="el">Σε αναμονή</span>
  }
}

/* ---- styles (inline, rem, opaque, tokens με fallback για φωτεινή κάρτα) ---- */

const successBanner: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: '0.7rem',
  background: 'color-mix(in srgb, var(--success, #059669) 12%, #fff)', border: '1px solid color-mix(in srgb, var(--success, #059669) 35%, transparent)',
  color: 'var(--success, #047857)', fontSize: '0.88rem', fontWeight: 600, lineHeight: 1.4,
}
const sectionTitle: CSSProperties = { fontSize: '0.78rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--foreground, #0f172a)' }
const itemCard = (uploaded: boolean): CSSProperties => ({
  display: 'flex', gap: '0.6rem', padding: '0.7rem 0.8rem', borderRadius: '0.7rem',
  border: `1px solid ${uploaded ? 'color-mix(in srgb, var(--success, #059669) 35%, transparent)' : 'var(--border, #e2e8f0)'}`,
  background: uploaded ? 'color-mix(in srgb, var(--success, #059669) 7%, var(--background, #f8fafc))' : 'var(--background, #f8fafc)',
})
const dropZone = (over: boolean): CSSProperties => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  minHeight: '9rem', padding: '1.4rem 1rem', borderRadius: '0.8rem', cursor: 'pointer',
  border: `2px dashed ${over ? 'var(--coral, #16323F)' : 'var(--border, #cbd5e1)'}`,
  background: over ? 'color-mix(in srgb, var(--coral, #16323F) 6%, var(--background, #f8fafc))' : 'var(--background, #f8fafc)',
  transition: 'border-color .15s, background .15s',
})
const queueRow: CSSProperties = { display: 'grid', gap: '0.55rem', padding: '0.7rem 0.8rem', borderRadius: '0.7rem', border: '1px solid var(--border, #e2e8f0)', background: 'var(--card, #fff)' }
const selectStyle: CSSProperties = { flex: '1 1 12rem', minWidth: 0, minHeight: '2.75rem', padding: '0 0.7rem', borderRadius: '0.6rem', border: '1px solid var(--border, #cbd5e1)', background: 'var(--background, #f8fafc)', color: 'inherit', fontSize: '0.85rem' }
const primaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.4rem', minHeight: '2.75rem', padding: '0 1rem', borderRadius: '999px', border: 'none', background: 'var(--coral, #16323F)', color: '#fff', fontWeight: 700, fontSize: '0.85rem' }
const iconBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '2.75rem', height: '2.75rem', flexShrink: 0, borderRadius: '0.6rem', border: '1px solid var(--border, #cbd5e1)', background: 'transparent', color: 'var(--muted-foreground, #64748b)', cursor: 'pointer' }
const progressTrack: CSSProperties = { height: '0.4rem', borderRadius: '999px', background: 'var(--muted, #e2e8f0)', overflow: 'hidden' }
const progressFill: CSSProperties = { height: '100%', borderRadius: '999px', background: 'var(--coral, #16323F)', transition: 'width .15s' }
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
