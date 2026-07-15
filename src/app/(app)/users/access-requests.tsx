'use client'

import { useTransition } from 'react'
import { toast } from 'sonner'
import { approveAccessRequest, rejectAccessRequest } from './actions'

export type AccessRequestRow = {
  id: string
  type: string
  name: string
  company: string
  afm: string
  email: string
}

export function AccessRequestsPanel({ requests }: { requests: AccessRequestRow[] }) {
  const [pending, startTransition] = useTransition()

  if (requests.length === 0) return null

  function approve(id: string) {
    startTransition(async () => {
      const res = await approveAccessRequest(id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function reject(id: string) {
    startTransition(async () => {
      const res = await rejectAccessRequest(id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <div className="glass stagger mt-4 p-4">
      <div className="dotted-leader mb-2.5 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αιτήματα B2B σε αναμονή
      </div>
      <div className="flex flex-col">
        {requests.map(request => (
          <div key={request.id} className="dotted-row-bottom flex flex-wrap items-center gap-3 py-3">
            <div className="min-w-0 flex-1">
              <b className="text-[13px]">
                {request.name} <span className="font-normal text-muted-foreground">— {request.company}</span>
              </b>
              <small className="block text-[11px] text-muted-foreground">
                ΑΦΜ {request.afm} · {request.email} · {request.type === 'ARCHITECT' ? 'Αρχιτέκτονας' : 'Πελάτης'}
              </small>
            </div>
            <div className="flex shrink-0 gap-2">
              <button
                type="button"
                className="btn-pill btn-navy h-8 px-4 text-[12px]"
                disabled={pending}
                onClick={() => approve(request.id)}
              >
                Έγκριση
              </button>
              <button
                type="button"
                className="btn-pill btn-glass h-8 px-4 text-[12px]"
                disabled={pending}
                onClick={() => reject(request.id)}
              >
                Απόρριψη
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
