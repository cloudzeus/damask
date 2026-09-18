'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuUpload, LuFile, LuDownload, LuTrash2, LuLoaderCircle } from 'react-icons/lu'
import {
  listApplicationDocuments, uploadApplicationDocument, removeApplicationDocument,
  type ApplicationDocumentItem,
} from '@/lib/pm/actions'
import { listDocumentTypes, type DocumentTypeOption } from '@/lib/documents/actions'
import { DocumentPreviewButton } from '@/components/ui/document-preview'

/**
 * Μετατρέπει ArrayBuffer → base64 σε chunks (32KB) — ίδιο idiom με
 * arrayBufferToBase64 στο new-program-dialog.tsx (spread ενός μεγάλου
 * Uint8Array μπορεί να ξεπεράσει το όριο ορισμάτων της μηχανής JS).
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

function formatSize(bytes: number | null): string {
  if (bytes == null) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

/**
 * «Δικαιολογητικά» ενός obligation (ή γενικά της αίτησης, αν obligationId
 * παραλείπεται) — compact upload + λίστα με link λήψης μέσω του gated route
 * `/programs/[id]/applications/[appId]/documents/[docId]`. Χρησιμοποιείται
 * inline μέσα σε κάθε γραμμή του ObligationsTab (Task 12).
 */
export function ApplicationDocuments({
  applicationId,
  obligationId,
  programId,
  appId,
}: {
  applicationId: string
  obligationId?: string
  programId: string
  appId: string
}) {
  const router = useRouter()
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [docs, setDocs] = React.useState<ApplicationDocumentItem[]>([])
  const [types, setTypes] = React.useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [uploading, setUploading] = React.useState(false)
  const [expiresAt, setExpiresAt] = React.useState('')
  const [typeId, setTypeId] = React.useState('')

  const selectedType = types.find(t => t.id === typeId) ?? null

  const load = React.useCallback(() => {
    setLoading(true)
    listApplicationDocuments(applicationId, obligationId)
      .then(setDocs)
      .catch(() => toast.error('Η φόρτωση των εγγράφων απέτυχε.'))
      .finally(() => setLoading(false))
  }, [applicationId, obligationId])

  React.useEffect(() => { const t = setTimeout(load, 0); return () => clearTimeout(t) }, [load])
  React.useEffect(() => {
    let cancelled = false
    listDocumentTypes().then(t => { if (!cancelled) setTypes(t) }).catch(() => {})
    return () => { cancelled = true }
  }, [])

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return
    setUploading(true)
    try {
      const buffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buffer)
      await uploadApplicationDocument(applicationId, obligationId ?? null, {
        name: file.name,
        base64,
        mimeType: file.type || 'application/octet-stream',
        ext: extOf(file.name),
        expiresAt: expiresAt || null,
        documentTypeId: typeId || null,
      })
      toast.success('Το έγγραφο ανέβηκε.')
      setExpiresAt('')
      setTypeId('')
      load()
      router.refresh()
    } catch {
      toast.error('Το ανέβασμα του εγγράφου απέτυχε.')
    } finally {
      setUploading(false)
    }
  }

  async function handleRemove(doc: ApplicationDocumentItem) {
    if (!window.confirm(`Διαγραφή του εγγράφου «${doc.name}»;`)) return
    const prevDocs = docs
    setDocs(prevDocs.filter(d => d.id !== doc.id))
    try {
      await removeApplicationDocument(doc.id)
      toast.success('Το έγγραφο διαγράφηκε.')
      router.refresh()
    } catch {
      toast.error('Η διαγραφή απέτυχε.')
      setDocs(prevDocs)
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-1.5">
        <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
        <button
          type="button"
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2.5 py-1 text-[0.6875rem] font-semibold text-muted-foreground transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
        >
          {uploading ? <LuLoaderCircle className="size-3 animate-spin" aria-hidden /> : <LuUpload className="size-3" aria-hidden />}
          {uploading ? 'Ανέβασμα…' : 'Ανέβασμα εγγράφου'}
        </button>
        {types.length > 0 && (
          <label className="inline-flex items-center gap-1 text-[0.65625rem] text-muted-foreground" title="Τύπος δικαιολογητικού (προαιρετικό)">
            τύπος:
            <select
              value={typeId}
              onChange={e => setTypeId(e.target.value)}
              disabled={uploading}
              aria-label="Τύπος δικαιολογητικού (προαιρετικό)"
              className="max-w-[150px] rounded-full border border-border bg-card px-2 py-0.5 text-[0.65625rem] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
            >
              <option value="">— (κανένας) —</option>
              {types.map(t => <option key={t.id} value={t.id}>{t.name}{t.expires ? ' ⏱' : ''}</option>)}
            </select>
          </label>
        )}
        <label
          className="inline-flex items-center gap-1 text-[0.65625rem] text-muted-foreground"
          title={selectedType?.expires ? 'Αυτός ο τύπος έχει ημ. λήξης — όρισέ την' : 'Ημ. λήξης δικαιολογητικού (προαιρετικό — π.χ. φορολογική/ασφαλιστική ενημερότητα)'}
        >
          λήξη{selectedType?.expires ? <span className="text-[color:var(--amber)]"> *</span> : ''}:
          <input
            type="date"
            value={expiresAt}
            onChange={e => setExpiresAt(e.target.value)}
            disabled={uploading}
            aria-label="Ημερομηνία λήξης (προαιρετικό)"
            className="rounded-full border border-border bg-card px-2 py-0.5 text-[0.65625rem] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        </label>
        {loading && <LuLoaderCircle className="size-3 animate-spin text-muted-foreground" aria-hidden />}
      </div>

      {docs.length > 0 && (
        <ul className="flex flex-col gap-1">
          {docs.map(doc => (
            <li key={doc.id} className="flex min-w-0 items-center gap-1.5 text-[0.75rem]">
              <LuFile className="size-3 shrink-0 text-muted-foreground" aria-hidden />
              <span className="min-w-0 truncate font-semibold" title={doc.name}>{doc.name}</span>
              {doc.typeName && <span className="badge-pill muted shrink-0">{doc.typeName}</span>}
              <span className="shrink-0 text-[0.6875rem] text-muted-foreground">{formatSize(doc.size)}</span>
              <DocumentPreviewButton
                url={`/programs/${programId}/applications/${appId}/documents/${doc.id}`}
                name={doc.name}
                mimeType={doc.mimeType}
                className="ml-auto !size-5"
              />
              <a
                href={`/programs/${programId}/applications/${appId}/documents/${doc.id}`}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                aria-label={`Λήψη — ${doc.name}`}
                title="Λήψη"
              >
                <LuDownload className="size-3" aria-hidden />
              </a>
              <button
                type="button"
                onClick={() => handleRemove(doc)}
                className="inline-flex size-5 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
                aria-label={`Διαγραφή — ${doc.name}`}
                title="Διαγραφή"
              >
                <LuTrash2 className="size-3" aria-hidden />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
