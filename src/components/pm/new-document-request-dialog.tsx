'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuMailPlus, LuCopy } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { listTrdrContactEmails, createDocumentRequest } from '@/lib/pm/actions'

/**
 * Dialog νέου αιτήματος εγγράφου προς πελάτη (C2d) — τίτλος/περιγραφή/email
 * παραλήπτη → createDocumentRequest, μετά την επιτυχία δείχνει τον μαγικό
 * σύνδεσμο (χωρίς σύνδεση) με κουμπί αντιγραφής.
 *
 * Email prefill: με άνοιγμα φορτώνει listTrdrContactEmails(applicationId) και
 * τα προσφέρει σαν <datalist> πάνω σε ελεύθερο Input — έτσι ο χρήστης μπορεί
 * είτε να διαλέξει μια προτεινόμενη επαφή είτε να πληκτρολογήσει άλλο email.
 *
 * Mirror του idiom AddObligationDialog (obligations-tab.tsx): χειροκίνητο
 * open state αντί για DialogTrigger primitive, ώστε να δέχεται custom
 * `trigger` (π.χ. icon-button ανά γραμμή υποχρέωσης).
 */
export function NewDocumentRequestDialog({
  applicationId, obligationId = null, defaultTitle, trigger, onCreated,
}: {
  applicationId: string
  obligationId?: string | null
  defaultTitle?: string
  trigger?: React.ReactNode
  onCreated?: () => void
}) {
  const [open, setOpen] = React.useState(false)
  const [title, setTitle] = React.useState(defaultTitle ?? '')
  const [description, setDescription] = React.useState('')
  const [email, setEmail] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<{ label: string; email: string }[]>([])
  const [saving, setSaving] = React.useState(false)
  const [result, setResult] = React.useState<{ url: string } | null>(null)

  const listId = React.useId()

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (next) {
      setTitle(defaultTitle ?? '')
      setDescription('')
      setEmail('')
      setResult(null)
      listTrdrContactEmails(applicationId).then(setSuggestions).catch(() => setSuggestions([]))
    }
    setOpen(next)
  }

  async function handleSubmit() {
    const trimmedTitle = title.trim()
    const trimmedEmail = email.trim()
    if (!trimmedTitle) { toast.error('Ο τίτλος του αιτήματος είναι υποχρεωτικός.'); return }
    if (!trimmedEmail) { toast.error('Το email παραλήπτη είναι υποχρεωτικό.'); return }
    setSaving(true)
    try {
      const { url } = await createDocumentRequest(applicationId, {
        obligationId,
        title: trimmedTitle,
        description: description.trim() || undefined,
        email: trimmedEmail,
      })
      toast.success('Το αίτημα δημιουργήθηκε.')
      setResult({ url })
      onCreated?.()
    } catch {
      toast.error('Η δημιουργία του αιτήματος απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  async function handleCopy() {
    if (!result) return
    try {
      await navigator.clipboard.writeText(result.url)
      toast.success('Ο σύνδεσμος αντιγράφηκε.')
    } catch {
      toast.error('Η αντιγραφή απέτυχε.')
    }
  }

  return (
    <>
      {trigger ? (
        <span onClick={() => handleOpenChange(true)} className="contents">{trigger}</span>
      ) : (
        <Button type="button" onClick={() => handleOpenChange(true)}>
          <LuMailPlus className="size-3.5" aria-hidden /> Νέο αίτημα
        </Button>
      )}
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[440px]">
          <DialogHeader>
            <DialogTitle>Αίτημα εγγράφου από πελάτη</DialogTitle>
            <DialogDescription>Στείλτε στον πελάτη σύνδεσμο ανεβάσματος (χωρίς σύνδεση).</DialogDescription>
          </DialogHeader>

          {result ? (
            <div className="flex flex-col gap-2.5">
              <p className="text-[12.5px] text-muted-foreground">
                Ο σύνδεσμος στάλθηκε στο email (εφόσον έχει ρυθμιστεί αποστολή) — μπορείτε επίσης να τον αντιγράψετε:
              </p>
              <div className="flex items-center gap-1.5">
                <Input value={result.url} readOnly className="h-9 text-[12px]" onFocus={e => e.target.select()} />
                <Button type="button" variant="outline" onClick={handleCopy}>
                  <LuCopy className="size-3.5" aria-hidden /> Αντιγραφή
                </Button>
              </div>
            </div>
          ) : (
            <>
              <div className="field !mb-0">
                <label htmlFor="doc-req-title">Τίτλος</label>
                <Input
                  id="doc-req-title"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  placeholder="π.χ. Τιμολόγιο προμηθευτή"
                  autoFocus
                  autoComplete="off"
                  disabled={saving}
                />
              </div>

              <div className="field !mb-0">
                <label htmlFor="doc-req-description">Περιγραφή</label>
                <textarea
                  id="doc-req-description"
                  className="cms-textarea"
                  rows={2}
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  disabled={saving}
                />
              </div>

              <div className="field !mb-0">
                <label htmlFor="doc-req-email">Email παραλήπτη</label>
                <Input
                  id="doc-req-email"
                  type="email"
                  list={listId}
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="name@example.com"
                  autoComplete="off"
                  disabled={saving}
                />
                <datalist id={listId}>
                  {suggestions.map(s => (
                    <option key={s.email} value={s.email} label={s.label} />
                  ))}
                </datalist>
              </div>
            </>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            {result ? (
              <DialogClose render={<Button type="button">Κλείσιμο</Button>} />
            ) : (
              <>
                <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
                <Button type="button" onClick={handleSubmit} disabled={saving || !title.trim() || !email.trim()}>
                  {saving ? 'Αποστολή…' : (<><LuMailPlus className="size-3.5" aria-hidden /> Δημιουργία</>)}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
