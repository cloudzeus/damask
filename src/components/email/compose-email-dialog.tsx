'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Mail, Users, Type, Plus, Trash2, Paperclip, FileCheck2, ChevronDown, Send, LoaderCircle } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose, DialogTrigger,
} from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { FileDropzone, xhrUpload } from '@/components/ui/file-dropzone'
import { RichTextEditor } from '@/components/email/rich-text-editor'
import { sendCustomerEmail, type ComposeAttachment } from '@/lib/email/actions'
import { cn } from '@/lib/utils'

/**
 * Επαναχρησιμοποιήσιμος composer «Νέο email» (Tiptap rich text + συνημμένα +
 * προαιρετικό αίτημα δικαιολογητικών). Καλεί το έτοιμο backend
 * `sendCustomerEmail`. Μπορεί να λειτουργήσει είτε με δικό του trigger
 * (uncontrolled) είτε ελεγχόμενα (open/onOpenChange) — π.χ. για «Reply» με
 * προϋπάρχον threadId. Η ενότητα «Ζήτησε δικαιολογητικά» εμφανίζεται μόνο όταν
 * υπάρχει `trdrId` (το backend αγνοεί file request χωρίς πελάτη).
 */

type RequestItem = { label: string; required: boolean }

export function ComposeEmailDialog({
  trdrId, programId, applicationId, obligationId,
  defaultTo = '', defaultSubject = '', threadId,
  onSent,
  open: controlledOpen, onOpenChange: controlledOnOpenChange,
  triggerLabel = 'Νέο email',
  triggerVariant = 'default',
  showTrigger = true,
}: {
  trdrId?: string
  programId?: string
  applicationId?: string
  obligationId?: string
  defaultTo?: string
  defaultSubject?: string
  threadId?: string
  onSent?: () => void
  open?: boolean
  onOpenChange?: (open: boolean) => void
  triggerLabel?: string
  triggerVariant?: 'default' | 'outline'
  showTrigger?: boolean
}) {
  const isControlled = controlledOpen !== undefined
  const [uncontrolledOpen, setUncontrolledOpen] = useState(false)
  const open = isControlled ? controlledOpen : uncontrolledOpen
  const setOpen = (v: boolean) => {
    if (isControlled) controlledOnOpenChange?.(v)
    else setUncontrolledOpen(v)
  }

  const [to, setTo] = useState(defaultTo)
  const [cc, setCc] = useState('')
  const [subject, setSubject] = useState(defaultSubject)
  const [bodyHtml, setBodyHtml] = useState('')
  const [attachments, setAttachments] = useState<ComposeAttachment[]>([])
  const [editorKey, setEditorKey] = useState(0)

  const [wantRequest, setWantRequest] = useState(false)
  const [reqTitle, setReqTitle] = useState('')
  const [reqExpires, setReqExpires] = useState('')
  const [reqItems, setReqItems] = useState<RequestItem[]>([{ label: '', required: true }])

  const [pending, startTransition] = useTransition()

  function resetForm() {
    setTo(defaultTo)
    setCc('')
    setSubject(defaultSubject)
    setBodyHtml('')
    setAttachments([])
    setEditorKey(k => k + 1)
    setWantRequest(false)
    setReqTitle('')
    setReqExpires('')
    setReqItems([{ label: '', required: true }])
  }

  function handleOpenChange(next: boolean) {
    setOpen(next)
    if (!next) resetForm()
  }

  async function uploadAttachment(file: File, onProgress: (pct: number) => void, signal: AbortSignal): Promise<ComposeAttachment> {
    const fd = new FormData()
    fd.append('file', file)
    const res = await xhrUpload<{ url: string; name: string; size?: number; mime?: string }>('/api/attachments/upload', fd, onProgress, signal)
    return { url: res.url, name: res.name, size: res.size, mime: res.mime }
  }

  function addItem() {
    setReqItems(items => [...items, { label: '', required: true }])
  }
  function removeItem(idx: number) {
    setReqItems(items => (items.length <= 1 ? items : items.filter((_, i) => i !== idx)))
  }
  function updateItem(idx: number, patch: Partial<RequestItem>) {
    setReqItems(items => items.map((it, i) => (i === idx ? { ...it, ...patch } : it)))
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!to.trim()) { toast.error('Συμπλήρωσε παραλήπτη.'); return }
    if (!subject.trim()) { toast.error('Συμπλήρωσε θέμα.'); return }

    let fileRequest: NonNullable<Parameters<typeof sendCustomerEmail>[0]['fileRequest']> | undefined
    if (wantRequest && trdrId) {
      const items = reqItems.map(it => ({ label: it.label.trim(), required: it.required })).filter(it => it.label)
      if (!reqTitle.trim()) { toast.error('Δώσε τίτλο στο αίτημα δικαιολογητικών.'); return }
      if (!reqExpires) { toast.error('Δώσε ημερομηνία λήξης για το αίτημα.'); return }
      if (items.length === 0) { toast.error('Πρόσθεσε τουλάχιστον ένα δικαιολογητικό.'); return }
      const expiresAt = new Date(`${reqExpires}T23:59:59`)
      if (Number.isNaN(expiresAt.getTime())) { toast.error('Μη έγκυρη ημερομηνία λήξης.'); return }
      fileRequest = { title: reqTitle.trim(), expiresAt: expiresAt.toISOString(), items }
    }

    startTransition(async () => {
      const res = await sendCustomerEmail({
        threadId,
        trdrId,
        programId,
        applicationId,
        obligationId,
        to: to.trim(),
        cc: cc.trim() || undefined,
        subject: subject.trim(),
        bodyHtml,
        attachments: attachments.length ? attachments : undefined,
        fileRequest,
      })
      if (!res.ok) {
        toast.error(res.error ?? 'Η αποστολή απέτυχε.')
        return
      }
      if (res.fileRequestUrl) {
        toast.success('Το email στάλθηκε.', { description: `Σύνδεσμος δικαιολογητικών: ${res.fileRequestUrl}` })
      } else {
        toast.success('Το email στάλθηκε.')
      }
      handleOpenChange(false)
      onSent?.()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      {showTrigger && !isControlled && (
        <DialogTrigger
          render={
            <Button type="button" variant={triggerVariant}>
              <Mail className="size-4" aria-hidden />
              {triggerLabel}
            </Button>
          }
        />
      )}
      <DialogContent className="glass max-h-[90vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[680px]">
        <DialogHeader>
          <DialogTitle>{threadId ? 'Απάντηση' : 'Νέο email'}</DialogTitle>
          <DialogDescription>Σύνθεσε και στείλε email στον πελάτη — με συνημμένα ή αίτημα δικαιολογητικών.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <div className="field !mb-0">
            <label htmlFor="compose-to">Προς*</label>
            <div className="inwrap">
              <Mail aria-hidden />
              <input id="compose-to" type="email" multiple value={to} onChange={e => setTo(e.target.value)} placeholder="paraliptis@example.com" required />
            </div>
          </div>

          <div className="field !mb-0">
            <label htmlFor="compose-cc">Κοιν. (CC)</label>
            <div className="inwrap">
              <Users aria-hidden />
              <input id="compose-cc" value={cc} onChange={e => setCc(e.target.value)} placeholder="Προαιρετικά, χωρισμένα με κόμμα" />
            </div>
          </div>

          <div className="field !mb-0">
            <label htmlFor="compose-subject">Θέμα*</label>
            <div className="inwrap">
              <Type aria-hidden />
              <input id="compose-subject" value={subject} onChange={e => setSubject(e.target.value)} placeholder="Θέμα του email" required />
            </div>
          </div>

          <div className="field !mb-0">
            <label htmlFor="compose-body">Μήνυμα</label>
            <RichTextEditor key={editorKey} value="" onChange={setBodyHtml} disabled={pending} />
          </div>

          <div className="field !mb-0">
            <label className="flex items-center gap-1.5">
              <Paperclip className="size-3.5" aria-hidden /> Συνημμένα
            </label>
            <FileDropzone<ComposeAttachment>
              uploadFn={uploadAttachment}
              onUploaded={items => setAttachments(prev => [...prev, ...items])}
              maxSizeMB={25}
              helperText="Έως 25MB ανά αρχείο."
            />
          </div>

          {trdrId && (
            <div className="rounded-xl border border-border bg-card">
              <button
                type="button"
                onClick={() => setWantRequest(v => !v)}
                aria-expanded={wantRequest}
                className="flex min-h-11 w-full items-center justify-between gap-2 px-3.5 py-2 text-left"
              >
                <span className="flex items-center gap-2 text-sm font-semibold">
                  <FileCheck2 className="size-4 text-muted-foreground" aria-hidden />
                  Ζήτησε δικαιολογητικά
                </span>
                <span className="flex items-center gap-2">
                  <span className={cn('badge-pill', wantRequest ? 'info' : 'muted')}>{wantRequest ? 'Ενεργό' : 'Ανενεργό'}</span>
                  <ChevronDown className={cn('size-4 text-muted-foreground transition-transform', wantRequest && 'rotate-180')} aria-hidden />
                </span>
              </button>

              {wantRequest && (
                <div className="flex flex-col gap-3 border-t border-border p-3.5">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div className="field !mb-0">
                      <label htmlFor="req-title">Τίτλος αιτήματος*</label>
                      <div className="inwrap">
                        <FileCheck2 aria-hidden />
                        <input id="req-title" value={reqTitle} onChange={e => setReqTitle(e.target.value)} placeholder="π.χ. Δικαιολογητικά ένταξης" />
                      </div>
                    </div>
                    <div className="field !mb-0">
                      <label htmlFor="req-expires">Ημ/νία λήξης*</label>
                      <input
                        id="req-expires"
                        type="date"
                        value={reqExpires}
                        onChange={e => setReqExpires(e.target.value)}
                        className="h-11 w-full rounded-full border border-border bg-card px-4 text-sm outline-none focus-visible:border-(--info) focus-visible:ring-4 focus-visible:ring-(--info-soft)"
                      />
                    </div>
                  </div>

                  <div className="flex flex-col gap-2">
                    <span className="text-xs font-bold">Ζητούμενα δικαιολογητικά</span>
                    {reqItems.map((item, idx) => (
                      <div key={idx} className="flex items-center gap-2">
                        <input
                          value={item.label}
                          onChange={e => updateItem(idx, { label: e.target.value })}
                          placeholder={`Δικαιολογητικό ${idx + 1}`}
                          className="h-11 flex-1 rounded-full border border-border bg-card px-4 text-sm outline-none focus-visible:border-(--info) focus-visible:ring-4 focus-visible:ring-(--info-soft)"
                        />
                        <label className="flex min-h-11 shrink-0 items-center gap-1.5 rounded-full border border-border bg-muted/40 px-3 text-xs font-semibold">
                          <input
                            type="checkbox"
                            checked={item.required}
                            onChange={e => updateItem(idx, { required: e.target.checked })}
                            className="size-4 accent-(--info)"
                          />
                          Υποχρεωτικό
                        </label>
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          aria-label="Αφαίρεση δικαιολογητικού"
                          className="min-h-11 min-w-11"
                          disabled={reqItems.length <= 1}
                          onClick={() => removeItem(idx)}
                        >
                          <Trash2 className="size-4" aria-hidden />
                        </Button>
                      </div>
                    ))}
                    <Button type="button" variant="outline" size="sm" className="min-h-11 self-start" onClick={addItem}>
                      <Plus className="size-4" aria-hidden />
                      Προσθήκη δικαιολογητικού
                    </Button>
                  </div>
                </div>
              )}
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-xl bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending}>
              {pending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Send className="size-4" aria-hidden />}
              {pending ? 'Αποστολή…' : 'Αποστολή'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
