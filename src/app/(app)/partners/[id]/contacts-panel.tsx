'use client'

import { useState } from 'react'
import { Plus, Mail, Phone, Smartphone } from 'lucide-react'
import { ContactFormDialog } from './contact-form-dialog'
import { ContactRowActions } from './contact-row-actions'

export type ContactRow = {
  id: string
  name: string
  position: string | null
  email: string | null
  phone: string | null
  mobile: string | null
  isPrimary: boolean
  hasUser: boolean
  hasPendingRequest: boolean
}

function initialsOf(name: string): string {
  return name.split(' ').map(w => w[0]).filter(Boolean).slice(0, 2).join('').toUpperCase()
}

export function ContactsPanel({ customerId, contacts }: { customerId: string; contacts: ContactRow[] }) {
  const [addOpen, setAddOpen] = useState(false)

  return (
    <div className="glass stagger p-4">
      <div className="mb-2.5 flex flex-wrap items-center justify-between gap-2">
        <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
          Επαφές ({contacts.length})
        </div>
        <button type="button" className="btn-pill btn-navy h-8 px-3.5 text-[12px]" onClick={() => setAddOpen(true)}>
          <Plus className="size-3.5" aria-hidden /> Επαφή
        </button>
      </div>

      {contacts.length === 0 ? (
        <p className="py-4 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν επαφές ακόμα.</p>
      ) : (
        <div className="flex flex-col">
          {contacts.map(c => (
            <div key={c.id} className="dotted-row-bottom flex flex-wrap items-center gap-3 py-2.5">
              <span className="avatar-ring size-8 shrink-0 text-[11px]">{initialsOf(c.name)}</span>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <b className="text-[13px]">{c.name}</b>
                  {c.position && <span className="text-[11.5px] text-muted-foreground">— {c.position}</span>}
                  {c.isPrimary && <span className="badge-pill ok">Κύρια</span>}
                  {c.hasUser && <span className="badge-pill info">User ✓</span>}
                  {!c.hasUser && c.hasPendingRequest && <span className="badge-pill warn">Αίτημα σε αναμονή</span>}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11.5px] text-muted-foreground">
                  {c.email && <span className="inline-flex items-center gap-1"><Mail className="size-3" aria-hidden /> {c.email}</span>}
                  {c.phone && <span className="inline-flex items-center gap-1"><Phone className="size-3" aria-hidden /> {c.phone}</span>}
                  {c.mobile && <span className="inline-flex items-center gap-1"><Smartphone className="size-3" aria-hidden /> {c.mobile}</span>}
                  {!c.email && !c.phone && !c.mobile && <span>Χωρίς στοιχεία επικοινωνίας</span>}
                </div>
              </div>
              <ContactRowActions customerId={customerId} contact={c} />
            </div>
          ))}
        </div>
      )}

      <ContactFormDialog mode="create" customerId={customerId} open={addOpen} onOpenChange={setAddOpen} />
    </div>
  )
}
