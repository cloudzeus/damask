'use client'

import * as React from 'react'
import { LuUpload, LuLoaderCircle, LuCircleCheck, LuCircleAlert } from 'react-icons/lu'
import { uploadPortalDocument } from '@/app/portal/upload/[token]/actions'

const MAX_UPLOAD_BYTES = 8 * 1024 * 1024 // keep in sync with portal-public.ts + next.config bodySizeLimit

/**
 * Μετατρέπει ArrayBuffer → base64 σε chunks (32KB) — ίδιο idiom με
 * arrayBufferToBase64 στο application-documents.tsx / new-program-dialog.tsx
 * (spread ενός μεγάλου Uint8Array μπορεί να ξεπεράσει το όριο ορισμάτων).
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

function reasonMessage(reason: string | undefined): string {
  if (reason === 'too_large') return 'Το αρχείο είναι πολύ μεγάλο (μέγιστο 8MB).'
  if (reason === 'expired') return 'Ο σύνδεσμος έχει λήξει.'
  return 'Κάτι πήγε στραβά.'
}

type UiState = 'idle' | 'uploading' | 'success' | 'error'

/**
 * Δημόσια φόρμα ανεβάσματος δικαιολογητικού (magic-link, χωρίς auth). Το
 * token περνάει ρητά (δεν υπάρχει session) στο server action
 * uploadPortalDocument. Επιτρέπει re-upload — αν alreadyUploaded, δείχνουμε
 * απλά μια σημείωση ότι το νέο αρχείο θα αντικαταστήσει το προηγούμενο.
 */
export function PortalUploadForm({
  token,
  title,
  alreadyUploaded,
}: {
  token: string
  title: string
  alreadyUploaded: boolean
}) {
  const fileInputRef = React.useRef<HTMLInputElement | null>(null)
  const [state, setState] = React.useState<UiState>('idle')
  const [errorMessage, setErrorMessage] = React.useState('')
  const [uploadedName, setUploadedName] = React.useState('')

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0] ?? null
    e.target.value = ''
    if (!file) return

    if (file.size > MAX_UPLOAD_BYTES) {
      setState('error')
      setErrorMessage(reasonMessage('too_large'))
      return
    }

    setState('uploading')
    try {
      const buffer = await file.arrayBuffer()
      const base64 = arrayBufferToBase64(buffer)
      const res = await uploadPortalDocument(token, {
        filename: file.name,
        base64,
        mimeType: file.type || 'application/octet-stream',
      })
      if (res.ok) {
        setUploadedName(file.name)
        setState('success')
      } else {
        setState('error')
        setErrorMessage(reasonMessage(res.reason))
      }
    } catch {
      setState('error')
      setErrorMessage(reasonMessage(undefined))
    }
  }

  return (
    <div className="flex flex-col items-center gap-3 text-center">
      {alreadyUploaded && state === 'idle' && (
        <p className="text-[12.5px] text-muted-foreground">
          Έχει ήδη ανέβει αρχείο — μπορείτε να το αντικαταστήσετε.
        </p>
      )}

      {state === 'success' ? (
        <div className="flex flex-col items-center gap-1.5 text-[var(--success)]">
          <LuCircleCheck className="size-6" aria-hidden />
          <p className="text-[13.5px] font-semibold text-foreground">Το αρχείο παραλήφθηκε. Ευχαριστούμε.</p>
          {uploadedName && <p className="text-[11.5px] text-muted-foreground">{uploadedName}</p>}
        </div>
      ) : null}

      {state === 'error' && (
        <div className="flex flex-col items-center gap-1.5">
          <LuCircleAlert className="size-6" style={{ color: 'var(--coral)' }} aria-hidden />
          <p className="text-[13.5px] font-semibold text-foreground">{errorMessage}</p>
        </div>
      )}

      <input ref={fileInputRef} type="file" className="hidden" onChange={handleFileChange} />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={state === 'uploading'}
        className="btn-pill btn-navy mx-auto disabled:cursor-not-allowed disabled:opacity-60"
      >
        {state === 'uploading' ? (
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden />
        ) : (
          <LuUpload className="size-4" aria-hidden />
        )}
        {state === 'uploading'
          ? 'Ανέβασμα…'
          : state === 'success' || state === 'error'
            ? 'Ανέβασμα άλλου αρχείου'
            : `Ανέβασμα — ${title}`}
      </button>
    </div>
  )
}
