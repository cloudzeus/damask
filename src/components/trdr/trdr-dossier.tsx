'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuPlus, LuUpload, LuLoaderCircle, LuTrash2, LuDownload, LuFileCheck2, LuTriangleAlert, LuCalendarClock, LuScanText } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  listTrdrDossier, listDocumentTypes, createDocumentType, uploadTrdrDossierDoc, updateTrdrDossierDoc, removeTrdrDossierDoc, classifyDossierDocument,
  type DossierDocItem, type DocumentTypeOption,
} from '@/lib/documents/actions'
import { isPdfFile, rasterizePdf, imageFileToPage, normalizeImageMimeType, MAX_RASTERIZE_PAGES } from '@/lib/ocr/rasterize'
import { runOcrExtraction } from '@/lib/ocr/actions'

/**
 * Αποθήκη δικαιολογητικών ανά πελάτη — ό,τι έχει ήδη η εταιρία (τύπος + αρχείο +
 * ημ. λήξης). Έτσι, στην ένταξη σε πρόγραμμα, ό,τι υπάρχει valid δεν ξαναζητείται.
 */

const DATE_FMT = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
function fmtDate(iso: string | null): string { return iso ? DATE_FMT.format(new Date(iso)) : '—' }

function readFileBase64(file: File): Promise<{ base64: string; ext: string }> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const res = String(reader.result)
      const base64 = res.includes(',') ? res.split(',')[1] : res
      const ext = file.name.includes('.') ? file.name.split('.').pop()! : 'bin'
      resolve({ base64, ext })
    }
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(file)
  })
}

export function TrdrDossier({ trdrId, canEdit }: { trdrId: string; canEdit: boolean }) {
  const [docs, setDocs] = React.useState<DossierDocItem[]>([])
  const [types, setTypes] = React.useState<DocumentTypeOption[]>([])
  const [loading, setLoading] = React.useState(true)
  const [error, setError] = React.useState<string | null>(null)

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
        <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Δικαιολογητικά εταιρίας ({docs.length})
        </div>
        {canEdit && <UploadDialog trdrId={trdrId} types={types} onDone={load} onTypesChanged={setTypes} />}
      </div>

      <p className="mb-3 text-[0.71875rem] text-muted-foreground">
        Ό,τι δικαιολογητικά έχει ήδη η εταιρία (με ημ. λήξης όπου ισχύει). Στην ένταξη σε πρόγραμμα, όσα υπάρχουν <strong>σε ισχύ</strong> δεν ξαναζητούνται.
      </p>

      {loading ? (
        <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
          <LuLoaderCircle className="size-4 animate-spin" aria-hidden /> Φόρτωση…
        </div>
      ) : error ? (
        <p className="py-4 text-center text-[0.78125rem] text-coral">{error}</p>
      ) : docs.length === 0 ? (
        <p className="py-6 text-center text-[0.78125rem] text-muted-foreground">
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
                    <span className="text-[0.8125rem] font-semibold">{doc.documentTypeName}</span>
                    <ExpiryBadge doc={doc} />
                  </div>
                  <div className="mt-0.5 truncate text-[0.71875rem] text-muted-foreground">{doc.name}</div>
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  {doc.typeExpires && (
                    <label className="flex items-center gap-1 text-[0.6875rem] text-muted-foreground">
                      <LuCalendarClock className="size-3.5" aria-hidden />
                      <input
                        type="date"
                        defaultValue={doc.expiresAt ? doc.expiresAt.slice(0, 10) : ''}
                        onBlur={e => canEdit && handleExpiryChange(doc, e.target.value)}
                        disabled={!canEdit}
                        aria-label="Ημερομηνία λήξης"
                        className="h-8 rounded-full border border-border bg-card px-2 text-[0.75rem] outline-none focus-visible:border-ring focus-visible:ring-2 focus-visible:ring-ring/30"
                      />
                    </label>
                  )}
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
  if (!doc.typeExpires) return <span className="badge-pill muted">Δεν λήγει</span>
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

const NEW_TYPE = '__new__'

function UploadDialog({
  trdrId, types, onDone, onTypesChanged,
}: {
  trdrId: string
  types: DocumentTypeOption[]
  onDone: () => void
  onTypesChanged: (t: DocumentTypeOption[]) => void
}) {
  const [open, setOpen] = React.useState(false)
  const [typeId, setTypeId] = React.useState('')
  const [file, setFile] = React.useState<File | null>(null)
  const [expiresAt, setExpiresAt] = React.useState('')
  const [saving, setSaving] = React.useState(false)
  const [reading, setReading] = React.useState(false)
  const [aiHint, setAiHint] = React.useState<string | null>(null)
  // inline νέος τύπος
  const [newTypeName, setNewTypeName] = React.useState('')
  const [newTypeExpires, setNewTypeExpires] = React.useState(false)

  const selectedType = types.find(t => t.id === typeId)
  const creatingType = typeId === NEW_TYPE
  const typeExpires = creatingType ? newTypeExpires : (selectedType?.expires ?? false)

  function reset() {
    setTypeId(''); setFile(null); setExpiresAt(''); setNewTypeName(''); setNewTypeExpires(false); setAiHint(null)
  }

  /** AI ανάγνωση του επιλεγμένου αρχείου → πρόταση τύπου + ημ. λήξης (ενδεικτικά,
   * ο χρήστης επιβεβαιώνει). Rasterize client-side → OCR → classify. */
  async function aiRead() {
    if (!file) { toast.error('Επίλεξε πρώτα αρχείο.'); return }
    setReading(true); setAiHint(null)
    try {
      let images: { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }[] = []
      let digitalText = ''
      if (isPdfFile(file)) {
        const { pages, text } = await rasterizePdf(file, { maxPages: MAX_RASTERIZE_PAGES })
        images = pages.map(p => ({ base64: p.base64, mimeType: p.mimeType }))
        digitalText = text ?? ''
      } else if (normalizeImageMimeType(file)) {
        const page = await imageFileToPage(file)
        images = [{ base64: page.base64, mimeType: page.mimeType }]
      } else {
        toast.error('Μη υποστηριζόμενο αρχείο για AI ανάγνωση (JPG/PNG/WebP/PDF).'); return
      }
      const ocr = await runOcrExtraction({ images, text: digitalText || undefined, docType: 'auto' })
      if (!ocr.ok) { toast.error(ocr.message); return }
      const d = ocr.data
      const summary = [
        d.issuer?.name ? `Εκδότης: ${d.issuer.name}` : null,
        d.documentNumber ? `Αριθμός: ${d.documentNumber}` : null,
        d.date ? `Ημερομηνία: ${d.date}` : null,
        d.notes ? `Σημειώσεις: ${d.notes}` : null,
        digitalText ? `Κείμενο: ${digitalText.slice(0, 2500)}` : null,
      ].filter(Boolean).join('\n')
      const cls = await classifyDossierDocument({ summary, types: types.map(t => ({ name: t.name, expires: t.expires })) })
      if (!cls.ok) { toast.error(cls.message); return }
      const matched = cls.result.typeName ? types.find(t => t.name === cls.result.typeName) : null
      if (matched) setTypeId(matched.id)
      if (cls.result.expiresAt) setExpiresAt(cls.result.expiresAt)
      const parts = [matched ? `τύπος: ${matched.name}` : 'δεν βρέθηκε τύπος', cls.result.expiresAt ? `λήξη: ${cls.result.expiresAt}` : null].filter(Boolean)
      setAiHint(parts.join(' · '))
      toast.success('Η AI ανάγνωση ολοκληρώθηκε — έλεγξε & επιβεβαίωσε.')
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η AI ανάγνωση απέτυχε.')
    } finally { setReading(false) }
  }
  function handleOpenChange(next: boolean) {
    if (saving) return
    if (!next) reset()
    setOpen(next)
  }

  async function handleSave() {
    if (!file) { toast.error('Επίλεξε αρχείο.'); return }
    setSaving(true)
    try {
      let documentTypeId = typeId
      if (creatingType) {
        if (!newTypeName.trim()) { toast.error('Δώσε όνομα τύπου.'); setSaving(false); return }
        const t = await createDocumentType(newTypeName.trim(), newTypeExpires)
        documentTypeId = t.id
        onTypesChanged([...types.filter(x => x.id !== t.id), t].sort((a, b) => a.name.localeCompare(b.name, 'el')))
      }
      if (!documentTypeId) { toast.error('Επίλεξε τύπο δικαιολογητικού.'); setSaving(false); return }
      const { base64, ext } = await readFileBase64(file)
      await uploadTrdrDossierDoc(trdrId, {
        documentTypeId,
        name: file.name.replace(/\.[^.]+$/, ''),
        base64,
        mimeType: file.type || 'application/octet-stream',
        ext,
        expiresAt: typeExpires && expiresAt ? expiresAt : null,
      })
      toast.success('Το δικαιολογητικό αποθηκεύτηκε.')
      onDone()
      handleOpenChange(false)
    } catch {
      toast.error('Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <>
      <Button type="button" variant="outline" onClick={() => setOpen(true)}>
        <LuPlus className="size-3.5" aria-hidden /> Δικαιολογητικό
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Νέο δικαιολογητικό εταιρίας</DialogTitle>
            <DialogDescription>Αποθήκευσε ένα δικαιολογητικό στην εταιρία — θα αναγνωρίζεται αυτόματα στα προγράμματα.</DialogDescription>
          </DialogHeader>

          <div className="field !mb-0">
            <label htmlFor="dsr-type">Τύπος δικαιολογητικού</label>
            <Select value={typeId} onValueChange={v => setTypeId(v ?? '')}>
              <SelectTrigger id="dsr-type" className="h-10 w-full rounded-full border-border bg-card px-3 text-[0.8125rem]">
                <SelectValue placeholder="Επίλεξε…" />
              </SelectTrigger>
              <SelectContent>
                {types.map(t => <SelectItem key={t.id} value={t.id}>{t.name}{t.expires ? ' · (λήγει)' : ''}</SelectItem>)}
                <SelectItem value={NEW_TYPE}>+ Νέος τύπος…</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {creatingType && (
            <div className="field !mb-0 rounded-[14px] border border-border bg-muted/40 p-2.5">
              <label htmlFor="dsr-newtype" className="!text-[0.6875rem]">Όνομα νέου τύπου</label>
              <Input id="dsr-newtype" value={newTypeName} onChange={e => setNewTypeName(e.target.value)} placeholder="π.χ. Άδεια λειτουργίας" autoComplete="off" disabled={saving} />
              <div className="mt-2 flex items-center gap-2.5">
                <Switch checked={newTypeExpires} onCheckedChange={setNewTypeExpires} disabled={saving} id="dsr-newtype-exp" />
                <label htmlFor="dsr-newtype-exp" className="text-[0.78125rem] font-semibold">Λήγει (έχει ημερομηνία λήξης)</label>
              </div>
            </div>
          )}

          <div className="field !mb-0">
            <label htmlFor="dsr-file">Αρχείο</label>
            <input
              id="dsr-file"
              type="file"
              onChange={e => { setFile(e.target.files?.[0] ?? null); setAiHint(null) }}
              disabled={saving}
              className="block w-full text-[0.78125rem] file:mr-3 file:rounded-full file:border-0 file:bg-primary file:px-4 file:py-2 file:text-[0.78125rem] file:font-semibold file:text-primary-foreground"
            />
            {file && (
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <Button type="button" variant="outline" size="sm" onClick={aiRead} disabled={reading || saving}>
                  {reading ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuScanText className="size-3.5" aria-hidden />} AI ανάγνωση (τύπος + λήξη)
                </Button>
                {aiHint && <span className="text-[0.6875rem] text-[color:var(--success)]">AI: {aiHint} — έλεγξε & επιβεβαίωσε</span>}
              </div>
            )}
          </div>

          {typeExpires && (
            <div className="field !mb-0">
              <label htmlFor="dsr-exp">Ημερομηνία λήξης</label>
              <Input id="dsr-exp" type="date" value={expiresAt} onChange={e => setExpiresAt(e.target.value)} disabled={saving} className="h-10" />
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
            <Button type="button" onClick={handleSave} disabled={saving || !file || (!typeId)}>
              {saving ? <><LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> Αποθήκευση…</> : <><LuUpload className="size-3.5" aria-hidden /> Αποθήκευση</>}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
