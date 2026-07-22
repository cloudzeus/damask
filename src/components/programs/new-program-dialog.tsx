'use client'

import { useRef, useState, useEffect, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuPlus, LuTag, LuUpload, LuFile, LuTriangleAlert } from 'react-icons/lu'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Progress } from '@/components/ui/progress'
import { createProgram, extractProgram } from '@/lib/programs/actions'
import { extractPdfText } from '@/lib/programs/pdf-text'

type Phase = 'form' | 'processing' | 'failed'

/**
 * Μετατρέπει ArrayBuffer → base64 σε chunks (32KB) αντί για ένα
 * `String.fromCharCode(...bytes)` — spread ενός μεγάλου Uint8Array μπορεί
 * να ξεπεράσει το όριο ορισμάτων της μηχανής JS (π.χ. πολυσέλιδα PDF).
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

// Κατά τη διάρκεια του extractProgram (μία, αδιαίρετη server-action κλήση —
// χωρίς ενδιάμεσα progress events) ο δείκτης «ερπύζει» αργά ως ένδειξη
// ζωντάνιας, χωρίς ποτέ να φτάσει το 100% πριν έρθει πραγματικά η απάντηση.
const EXTRACT_START_PCT = 30
const EXTRACT_CAP_PCT = 92
const EXTRACT_TICK_MS = 2500

export function NewProgramDialog() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Νέο πρόγραμμα
      </Button>
      <NewProgramDialogContent open={open} onOpenChange={setOpen} />
    </>
  )
}

function NewProgramDialogContent({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  const router = useRouter()
  const fileInputRef = useRef<HTMLInputElement | null>(null)

  const [title, setTitle] = useState('')
  const [file, setFile] = useState<File | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})

  const [phase, setPhase] = useState<Phase>('form')
  const [progress, setProgress] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [createdId, setCreatedId] = useState<string | null>(null)

  // Αργή, φθίνουσα «ερπύστρα» προόδου όσο τρέχει το extractProgram.
  useEffect(() => {
    if (phase !== 'processing' || progress < EXTRACT_START_PCT) return
    const t = setInterval(() => {
      setProgress(p => (p < EXTRACT_CAP_PCT ? p + 1 : p))
    }, EXTRACT_TICK_MS)
    return () => clearInterval(t)
  }, [phase, progress])

  function resetForm() {
    setTitle('')
    setFile(null)
    setErrors({})
    setPhase('form')
    setProgress(0)
    setProgressLabel('')
    setError(null)
    setCreatedId(null)
  }

  function handleOpenChange(next: boolean) {
    if (phase === 'processing') return
    if (!next) resetForm()
    onOpenChange(next)
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0] ?? null
    e.target.value = ''
    if (f) setFile(f)
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()

    const nextErrors: Record<string, string> = {}
    if (!title.trim()) nextErrors.title = 'Ο τίτλος είναι υποχρεωτικός.'
    if (!file) nextErrors.file = 'Επίλεξε το PDF της προκήρυξης.'
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors)
      return
    }
    setErrors({})
    setError(null)
    setPhase('processing')

    try {
      setProgressLabel('Ανάγνωση κειμένου PDF…')
      setProgress(5)
      const text = await extractPdfText(file!)

      if (!text.trim()) {
        setError('Το PDF δεν περιέχει επιλέξιμο κείμενο (π.χ. είναι σαρωμένη εικόνα). Προς το παρόν υποστηρίζονται μόνο PDF με κείμενο.')
        setPhase('form')
        return
      }

      setProgressLabel('Μεταφόρτωση αρχείου…')
      setProgress(15)
      const buffer = await file!.arrayBuffer()
      const pdfBase64 = arrayBufferToBase64(buffer)

      const { id } = await createProgram({
        title: title.trim(),
        sourceFileName: file!.name,
        pdfBase64,
        mimeType: file!.type || 'application/pdf',
      })
      setCreatedId(id)

      setProgressLabel('Αποδελτίωση με DeepSeek… (μπορεί να πάρει λεπτά)')
      setProgress(EXTRACT_START_PCT)
      const r = await extractProgram(id, text)

      if (r.ok) {
        setProgress(100)
        toast.success('Το πρόγραμμα δημιουργήθηκε και αποδελτιώθηκε.')
        onOpenChange(false)
        resetForm()
        router.push(`/programs/${id}`)
      } else {
        setError(r.error ?? 'Η αποδελτίωση απέτυχε.')
        setPhase('failed')
      }
    } catch (err) {
      const message = err instanceof Error && err.message ? err.message : 'Κάτι πήγε στραβά.'
      setError(message)
      setPhase(createdId ? 'failed' : 'form')
    }
  }

  function goToCreatedProgram() {
    if (!createdId) return
    onOpenChange(false)
    resetForm()
    router.push(`/programs/${createdId}`)
  }

  const busy = phase === 'processing'

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="glass sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>Νέο πρόγραμμα</DialogTitle>
          <DialogDescription>
            Ανέβασε την προκήρυξη σε PDF — τα βασικά στοιχεία του προγράμματος εξάγονται αυτόματα με AI.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="field !mb-0">
            <label htmlFor="np-title">Τίτλος*</label>
            <div className="inwrap">
              <LuTag aria-hidden />
              <input
                id="np-title" value={title} onChange={e => setTitle(e.target.value)}
                placeholder="π.χ. Ψηφιακός Μετασχηματισμός ΜμΕ" required disabled={busy} autoFocus
              />
            </div>
            {errors.title && <div className="error">{errors.title}</div>}
          </div>

          <div className="field !mb-0">
            <label>Προκήρυξη (PDF)*</label>
            <input ref={fileInputRef} type="file" accept=".pdf,application/pdf" className="hidden" onChange={handleFileChange} />
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={busy}
              className="flex w-full items-center gap-2 rounded-lg border border-dashed border-border px-3 py-2.5 text-left text-[12.5px] transition-colors hover:bg-muted disabled:cursor-not-allowed disabled:opacity-50"
            >
              {file ? <LuFile className="size-3.5 shrink-0" aria-hidden /> : <LuUpload className="size-3.5 shrink-0" aria-hidden />}
              <span className="truncate">{file ? file.name : 'Επίλεξε το PDF της προκήρυξης…'}</span>
            </button>
            {errors.file && <div className="error">{errors.file}</div>}
          </div>

          {phase === 'processing' && (
            <div className="flex flex-col gap-1.5 pt-1">
              <Progress value={progress} />
              <p className="text-center text-[11.5px] text-muted-foreground">{progressLabel || 'Επεξεργασία…'}</p>
            </div>
          )}

          {error && phase === 'form' && (
            <div className="error flex items-start gap-1.5">
              <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden /> <span>{error}</span>
            </div>
          )}

          {phase === 'failed' && (
            <div className="flex flex-col gap-2 rounded-lg border border-dashed p-3" style={{ borderColor: 'var(--destructive)' }}>
              <div className="flex items-start gap-1.5 text-[12.5px]" style={{ color: 'var(--destructive)' }}>
                <LuTriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden />
                <span>Το πρόγραμμα δημιουργήθηκε, αλλά η αυτόματη αποδελτίωση απέτυχε: {error}</span>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                Μπορείς να ανοίξεις το πρόγραμμα και να συμπληρώσεις τα στοιχεία χειροκίνητα, ή να ξαναδοκιμάσεις την αποδελτίωση από εκεί.
              </p>
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            {phase === 'failed' ? (
              <>
                <DialogClose render={<Button type="button" variant="outline">Κλείσιμο</Button>} />
                <Button type="button" onClick={goToCreatedProgram}>Άνοιγμα προγράμματος</Button>
              </>
            ) : (
              <>
                <DialogClose render={<Button type="button" variant="outline" disabled={busy}>Άκυρο</Button>} />
                <Button type="submit" disabled={busy}>
                  {busy ? 'Επεξεργασία…' : (<><LuPlus className="size-3.5" aria-hidden /> Δημιουργία &amp; Αποδελτίωση</>)}
                </Button>
              </>
            )}
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
