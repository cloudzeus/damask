'use client'

import { useEffect, useMemo, useRef, useState, type CSSProperties, type DragEvent } from 'react'
import {
  UploadCloud, FileText, CheckCircle2, AlertTriangle, Loader2, X, PartyPopper, CircleDashed, Sparkles,
} from 'lucide-react'
import { xhrUpload } from '@/components/ui/file-dropzone'
import type { PublicFileRequest } from '@/lib/file-requests/public'
import { recognizeFileForRequest } from '@/lib/file-requests/classify'
import { readForRecognition } from '@/lib/ocr/read-for-recognition'
import { documentHint } from '@/lib/file-requests/doc-hints'

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
  /** αυτόματη αναγνώριση σε εξέλιξη */
  recognizing: boolean
  /** τι αναγνωρίστηκε (αν ταίριαξε αυτόματα σε στοιχείο) */
  recognized: { typeName: string | null; confidence: number } | null
  /** Το έγγραφο φαίνεται να αφορά άλλη επιχείρηση — δεν ανεβαίνει χωρίς ρητή επιβεβαίωση. */
  foreign?: string | null
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
      return { id, name: file.name, size: file.size, itemId: defaultItemId, status: 'idle', progress: 0, error: null, recognizing: true, recognized: null }
    })
    setQueue(prev => [...prev, ...newRows])
    void recognizeAll(newRows.map(r => r.id))
  }

  // Αυτόματη αναγνώριση & αντιστοίχιση (2 αρχεία τη φορά).
  async function recognizeAll(ids: string[]) {
    const work = [...ids]
    const worker = async () => {
      while (work.length) {
        const id = work.shift()!
        const file = filesRef.current.get(id)
        if (!file) continue
        const payload = await readForRecognition(file)
        const res = await recognizeFileForRequest(token, { fileName: file.name, ...payload }).catch(() => null)
        setQueue(prev => prev.map(q => {
          if (q.id !== id) return q
          if (res?.ok && res.foreignNote) return { ...q, recognizing: false, foreign: res.foreignNote }
          if (!res || !res.ok || !res.itemId) return { ...q, recognizing: false }
          return { ...q, recognizing: false, itemId: res.itemId, recognized: { typeName: res.typeName, confidence: res.confidence } }
        }))
      }
    }
    await Promise.all([worker(), worker()])
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
    if (row.recognized?.typeName) fd.append('docType', row.recognized.typeName)

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
                {item.uploaded ? <CheckCircle2 size={16} /> : <CircleDashed size={16} />}
              </span>
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontWeight: 700, fontSize: 'var(--fs-13)' }}>{item.label}</span>
                  <span className={item.required ? 'badge-pill danger' : 'badge-pill muted'} lang="el">
                    {item.required ? 'Υποχρεωτικό' : 'Προαιρετικό'}
                  </span>
                </div>
                {item.description && (
                  <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--fs-12-5)', lineHeight: 1.45, color: 'var(--muted-foreground, #64748b)' }}>{item.description}</p>
                )}
                {!item.uploaded && documentHint(item.label, item.description) && (
                  <p style={{ margin: '0.2rem 0 0', fontSize: 'var(--fs-12-5)', lineHeight: 1.45, color: 'var(--muted-foreground, #64748b)' }}><b>Πού το βρίσκετε:</b> {documentHint(item.label, item.description)}</p>
                )}
                <p style={{ margin: '0.3rem 0 0', fontSize: 'var(--fs-12)', color: item.uploaded ? 'var(--success, #059669)' : 'var(--muted-foreground, #94a3b8)' }}>
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

      {/* Απορρίφθηκε αρχείο → υπενθύμιση ΤΙ ζητήσαμε, με εξήγηση */}
      {queue.some(q => q.status === 'error') && items.some(i => !i.uploaded) && (
        <div role="alert" style={{ padding: '1rem 1.1rem', borderRadius: 14, background: '#FCE8E6', borderLeft: '4px solid #B3261E', color: '#0B0F2A' }}>
          <p style={{ margin: 0, fontWeight: 700, display: 'flex', alignItems: 'center', gap: '0.4rem' }}><AlertTriangle size={16} aria-hidden style={{ color: '#B3261E' }} /> Κάποιο αρχείο δεν έγινε δεκτό — σας έχουμε ζητήσει τα εξής δικαιολογητικά:</p>
          <ul style={{ margin: '0.6rem 0 0', paddingLeft: '1.1rem', display: 'grid', gap: '0.45rem' }}>
            {items.filter(i => !i.uploaded).map(i => {
              const hint = documentHint(i.label, i.description) ?? i.description
              return <li key={i.id} style={{ fontSize: 'var(--fs-13)' }}><b>{i.label}</b>{hint ? <><br /><span style={{ color: '#474C60' }}>{hint}</span></> : null}</li>
            })}
          </ul>
          <p style={{ margin: '0.6rem 0 0', fontSize: 'var(--fs-12-5)', color: '#474C60' }}>Κάθε αρχείο ελέγχεται αυτόματα — ανεβάστε μόνο τα παραπάνω έγγραφα, της συγκεκριμένης επιχείρησης, σε PDF ή φωτογραφία.</p>
        </div>
      )}

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
        <UploadCloud size={24} strokeWidth={1.6} aria-hidden style={{ color: 'var(--muted-foreground, #64748b)' }} />
        <p style={{ margin: '0.4rem 0 0', fontSize: 'var(--fs-13)', fontWeight: 700 }}>Σύρε αρχεία εδώ ή πάτησε για επιλογή</p>
        <p style={{ margin: '0.15rem 0 0', fontSize: 'var(--fs-12)', color: 'var(--muted-foreground, #94a3b8)' }}>
          PDF ή φωτογραφία. Κάθε αρχείο ελέγχεται αυτόματα: γίνεται δεκτό μόνο αν είναι ένα από τα ζητούμενα έγγραφα της επιχείρησης.
        </p>
        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,image/jpeg,image/png,image/webp,image/heic"
          onChange={e => { if (e.target.files) addFiles(e.target.files); e.target.value = '' }}
          style={{ display: 'none' }}
        />
      </div>

      {/* Ουρά αρχείων προς μεταφόρτωση */}
      {queue.filter(q => q.status === 'idle' || q.status === 'error').length > 1 && (
        <button
          type="button"
          onClick={() => queue.filter(q => (q.status === 'idle' || q.status === 'error') && q.itemId && !q.recognizing && !q.foreign).forEach(q => void runUpload(q.id))}
          disabled={queue.some(q => q.recognizing)}
          style={{ ...primaryBtn, justifySelf: 'end', opacity: queue.some(q => q.recognizing) ? 0.6 : 1, cursor: 'pointer' }}
        >
          <UploadCloud size={13} aria-hidden /> Μεταφόρτωση όλων ({queue.filter(q => q.status === 'idle' || q.status === 'error').length})
        </button>
      )}
      {queue.length > 0 && (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '0.55rem' }}>
          {queue.map(row => {
            const selectId = `map-${row.id}`
            const busy = row.status === 'uploading'
            return (
              <li key={row.id} style={queueRow}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', minWidth: 0 }}>
                  <FileText size={16} aria-hidden style={{ flexShrink: 0, color: 'var(--muted-foreground, #64748b)' }} />
                  <span style={{ minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 'var(--fs-12-5)', fontWeight: 700 }}>{row.name}</span>
                  <span style={{ flexShrink: 0, fontSize: 'var(--fs-11-5)', color: 'var(--muted-foreground, #94a3b8)', fontVariantNumeric: 'tabular-nums' }}>{formatBytes(row.size)}</span>
                  <span style={{ marginLeft: 'auto', flexShrink: 0 }}><QueueBadge status={row.status} /></span>
                </div>

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem', alignItems: 'center' }}>
                  <label htmlFor={selectId} style={srOnly}>Αντιστοίχιση δικαιολογητικού για το αρχείο {row.name}</label>
                  <select
                    id={selectId}
                    value={row.itemId}
                    disabled={busy || row.status === 'done'}
                    onChange={e => updateQueued(row.id, { itemId: e.target.value, error: null, recognized: null })}
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
                      disabled={busy || !row.itemId || !!row.foreign}
                      style={{ ...primaryBtn, opacity: busy || !row.itemId || row.foreign ? 0.6 : 1, cursor: busy || !row.itemId || row.foreign ? 'default' : 'pointer' }}
                    >
                      {busy ? <Loader2 size={13} className="animate-spin" aria-hidden /> : <UploadCloud size={13} aria-hidden />}
                      {row.status === 'error' ? 'Επανάληψη' : 'Μεταφόρτωση'}
                    </button>
                  )}

                  <button type="button" onClick={() => removeRow(row.id)} aria-label={`Αφαίρεση ${row.name}`} style={iconBtn}>
                    <X size={14} aria-hidden />
                  </button>
                </div>

                {!row.recognizing && row.foreign && row.status !== 'done' && (
                  <div role="alert" style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.5rem', borderRadius: 10, border: '1px solid var(--danger, #b3261e)', background: 'rgba(179,38,30,0.06)', padding: '0.45rem 0.65rem', fontSize: 'var(--fs-12)', color: 'var(--danger, #b3261e)' }}>
                    <span style={{ flex: 1, minWidth: 0 }}>{row.foreign}</span>
                    <button type="button" onClick={() => updateQueued(row.id, { foreign: null })} style={{ ...iconBtn, width: 'auto', padding: '0.2rem 0.6rem', fontSize: 'var(--fs-11-5)', fontWeight: 700 }}>
                      Είναι σωστό — συνέχεια
                    </button>
                  </div>
                )}
                {row.recognizing && (
                  <p style={recognizeNote}>
                    <Loader2 size={13} className="animate-spin" aria-hidden /> Αναγνώριση εγγράφου…
                  </p>
                )}
                {!row.recognizing && row.recognized && row.status !== 'done' && (
                  <p style={{ ...recognizeNote, color: 'var(--success, #047857)' }}>
                    <Sparkles size={13} aria-hidden />
                    Αναγνωρίστηκε{row.recognized.typeName ? ` ως «${row.recognized.typeName}»` : ''} — αντιστοιχίστηκε αυτόματα. Έλεγξε και ανέβασε.
                  </p>
                )}
                {busy && (
                  <div style={progressTrack} aria-hidden>
                    <div style={{ ...progressFill, width: `${row.progress}%` }} />
                  </div>
                )}
                {row.status === 'error' && row.error && (
                  <p role="alert" style={{ margin: 0, fontSize: 'var(--fs-12)', color: 'var(--coral, #e11d48)', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
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
      return <span className="badge-pill info" lang="el"><Loader2 size={11} className="animate-spin" aria-hidden /> Έλεγχος &amp; μεταφόρτωση</span>
    case 'done':
      return <span className="badge-pill ok" lang="el"><CheckCircle2 size={11} aria-hidden /> Ολοκληρώθηκε</span>
    case 'error':
      return <span className="badge-pill danger" lang="el"><AlertTriangle size={11} aria-hidden /> Δεν έγινε δεκτό</span>
    default:
      return <span className="badge-pill muted" lang="el">Σε αναμονή</span>
  }
}

/* ---- styles (inline, rem, opaque, tokens με fallback για φωτεινή κάρτα) ---- */

const successBanner: CSSProperties = {
  display: 'flex', alignItems: 'center', gap: '0.6rem', padding: '0.85rem 1rem', borderRadius: '0.7rem',
  background: 'color-mix(in srgb, var(--success, #059669) 12%, #fff)', border: '1px solid color-mix(in srgb, var(--success, #059669) 35%, transparent)',
  color: 'var(--success, #047857)', fontSize: 'var(--fs-14)', fontWeight: 600, lineHeight: 1.4,
}
const sectionTitle: CSSProperties = { fontSize: 'var(--fs-12-5)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--foreground, #0f172a)' }
const itemCard = (uploaded: boolean): CSSProperties => ({
  display: 'flex', gap: '0.55rem', padding: '0.55rem 0.7rem', borderRadius: '0.7rem',
  border: `1px solid ${uploaded ? 'color-mix(in srgb, var(--success, #059669) 35%, transparent)' : 'var(--border, #e2e8f0)'}`,
  background: uploaded ? 'color-mix(in srgb, var(--success, #059669) 7%, var(--background, #f8fafc))' : 'var(--background, #f8fafc)',
})
const dropZone = (over: boolean): CSSProperties => ({
  display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', textAlign: 'center',
  minHeight: '6.5rem', padding: '1rem', borderRadius: '0.8rem', cursor: 'pointer',
  border: `2px dashed ${over ? 'var(--coral, #16323F)' : 'var(--border, #cbd5e1)'}`,
  background: over ? 'color-mix(in srgb, var(--coral, #16323F) 6%, var(--background, #f8fafc))' : 'var(--background, #f8fafc)',
  transition: 'border-color .15s, background .15s',
})
const queueRow: CSSProperties = { display: 'grid', gap: '0.45rem', padding: '0.6rem 0.7rem', borderRadius: '0.7rem', border: '1px solid var(--border, #e2e8f0)', background: 'var(--card, #fff)' }
const selectStyle: CSSProperties = { flex: '1 1 12rem', minWidth: 0, height: '2.125rem', padding: '0 0.6rem', borderRadius: '0.5rem', border: '1px solid var(--border, #cbd5e1)', background: 'var(--card, #fff)', color: 'inherit', fontSize: 'var(--fs-12-5)', fontWeight: 600 }
const primaryBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: '0.35rem', height: '2.125rem', padding: '0 0.85rem', borderRadius: '999px', border: 'none', background: 'var(--primary, #16323F)', color: 'var(--primary-foreground, #fff)', fontWeight: 700, fontSize: 'var(--fs-12)', whiteSpace: 'nowrap' }
const iconBtn: CSSProperties = { display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '2.125rem', height: '2.125rem', flexShrink: 0, borderRadius: '999px', border: '1px solid var(--border, #cbd5e1)', background: 'transparent', color: 'var(--muted-foreground, #64748b)', cursor: 'pointer' }
const progressTrack: CSSProperties = { height: '0.25rem', borderRadius: '999px', background: 'var(--muted, #e2e8f0)', overflow: 'hidden' }
const progressFill: CSSProperties = { height: '100%', borderRadius: '999px', background: 'var(--primary, #16323F)', transition: 'width .15s' }
const recognizeNote: CSSProperties = { margin: 0, display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: 'var(--fs-12)', color: 'var(--muted-foreground, #64748b)' }
const srOnly: CSSProperties = { position: 'absolute', width: 1, height: 1, padding: 0, margin: -1, overflow: 'hidden', clip: 'rect(0 0 0 0)', whiteSpace: 'nowrap', border: 0 }
