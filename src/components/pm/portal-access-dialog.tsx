'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { LuUserRound, LuCopy } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { listTrdrContactEmails, createPortalAccess } from '@/lib/pm/actions'

/**
 * Dialog «Πρόσβαση Portal» (C2d — hub header) — δημιουργεί magic-link
 * πρόσβασης του πελάτη στο portal παρακολούθησης των έργων του
 * (createPortalAccess), με email prefill από τις επαφές του Trdr (datalist,
 * ίδιο idiom με NewDocumentRequestDialog).
 */
export function PortalAccessDialog({ applicationId }: { applicationId: string }) {
  const [open, setOpen] = React.useState(false)
  const [email, setEmail] = React.useState('')
  const [suggestions, setSuggestions] = React.useState<{ label: string; email: string }[]>([])
  const [saving, setSaving] = React.useState(false)
  const [result, setResult] = React.useState<{ url: string } | null>(null)

  const listId = React.useId()

  function handleOpenChange(next: boolean) {
    if (saving) return
    if (next) {
      setEmail('')
      setResult(null)
      listTrdrContactEmails(applicationId).then(setSuggestions).catch(() => setSuggestions([]))
    }
    setOpen(next)
  }

  async function handleSubmit() {
    const trimmedEmail = email.trim()
    if (!trimmedEmail) { toast.error('Το email είναι υποχρεωτικό.'); return }
    setSaving(true)
    try {
      const { url } = await createPortalAccess(applicationId, { email: trimmedEmail })
      toast.success('Η πρόσβαση δημιουργήθηκε.')
      setResult({ url })
    } catch {
      toast.error('Η δημιουργία πρόσβασης απέτυχε.')
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
      <Button type="button" variant="outline" onClick={() => handleOpenChange(true)}>
        <LuUserRound className="size-3.5" aria-hidden /> Πρόσβαση Portal
      </Button>
      <Dialog open={open} onOpenChange={handleOpenChange}>
        <DialogContent className="glass sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>Πρόσβαση Portal πελάτη</DialogTitle>
            <DialogDescription>Δημιουργήστε σύνδεσμο πρόσβασης του πελάτη στο portal παρακολούθησης (χωρίς σύνδεση).</DialogDescription>
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
            <div className="field !mb-0">
              <label htmlFor="portal-access-email">Email πελάτη</label>
              <Input
                id="portal-access-email"
                type="email"
                list={listId}
                value={email}
                onChange={e => setEmail(e.target.value)}
                placeholder="name@example.com"
                autoFocus
                autoComplete="off"
                disabled={saving}
              />
              <datalist id={listId}>
                {suggestions.map(s => (
                  <option key={s.email} value={s.email} label={s.label} />
                ))}
              </datalist>
            </div>
          )}

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            {result ? (
              <DialogClose render={<Button type="button">Κλείσιμο</Button>} />
            ) : (
              <>
                <DialogClose render={<Button type="button" variant="outline" disabled={saving}>Άκυρο</Button>} />
                <Button type="button" onClick={handleSubmit} disabled={saving || !email.trim()}>
                  {saving ? 'Δημιουργία…' : 'Δημιουργία συνδέσμου'}
                </Button>
              </>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
