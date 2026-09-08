'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { LuUpload, LuCircleCheck, LuClock, LuLoaderCircle, LuFileText } from 'react-icons/lu'
import { submitObligationUpload, type PortalApp } from '@/lib/pm/portal-contact'

/** Portal πελάτη — προγράμματα & δικαιολογητικά με απευθείας ανέβασμα ανά εκκρεμότητα. */
export function PortalPrograms({ applications }: { applications: PortalApp[] }) {
  const router = useRouter()
  const [busyId, setBusyId] = React.useState<string | null>(null)

  async function handleUpload(obligationId: string, file: File) {
    if (file.size > 8 * 1024 * 1024) { toast.error('Το αρχείο ξεπερνά τα 8MB.'); return }
    setBusyId(obligationId)
    try {
      const base64 = await new Promise<string>((resolve, reject) => {
        const r = new FileReader()
        r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
        r.onerror = () => reject(new Error('read'))
        r.readAsDataURL(file)
      })
      const res = await submitObligationUpload(obligationId, { filename: file.name, base64, mimeType: file.type || 'application/octet-stream' })
      if (res.ok) { toast.success('Το δικαιολογητικό ανέβηκε.'); router.refresh() }
      else toast.error('Το ανέβασμα απέτυχε.')
    } catch {
      toast.error('Το ανέβασμα απέτυχε.')
    } finally {
      setBusyId(null)
    }
  }

  if (applications.length === 0) {
    return <p className="py-10 text-center text-sm text-muted-foreground">Δεν υπάρχουν προγράμματα διαθέσιμα για την επαφή σας ακόμη.</p>
  }

  return (
    <div className="flex flex-col gap-4">
      {applications.map(app => (
        <div key={app.applicationId} className="glass p-4 sm:p-5">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="flex-1 text-[1.0625rem] font-semibold">{app.programTitle}</h2>
            <span className="badge-pill info">{app.lifecycleLabel}</span>
            <span className="badge-pill muted">Φάση: {app.stageLabel}</span>
          </div>

          {app.obligations.length === 0 ? (
            <p className="text-[0.8125rem] text-muted-foreground">Δεν υπάρχουν δικαιολογητικά σε εκκρεμότητα.</p>
          ) : (
            <ul className="flex flex-col divide-y divide-border">
              {app.obligations.map(o => {
                const done = o.status === 'APPROVED' || o.status === 'SUBMITTED'
                const rejected = o.status === 'REJECTED'
                const busy = busyId === o.id
                return (
                  <li key={o.id} className="flex flex-wrap items-center gap-2.5 py-2.5">
                    <LuFileText className="size-4 shrink-0 text-muted-foreground" aria-hidden />
                    <div className="min-w-0 flex-1">
                      <div className="text-[0.875rem] font-medium">{o.name}</div>
                      {o.hasDocument && o.documentName && (
                        <div className="truncate text-[0.6875rem] text-muted-foreground">Ανέβηκε: {o.documentName}</div>
                      )}
                      {o.dueDate && !done && (
                        <div className="text-[0.6875rem] text-muted-foreground">Προθεσμία: {new Date(o.dueDate).toLocaleDateString('el-GR')}</div>
                      )}
                    </div>
                    <span className={`badge-pill ${done ? 'success' : rejected ? '' : 'warn'}`} style={rejected ? { color: 'var(--card)', background: 'var(--coral)' } : undefined}>
                      {done ? <LuCircleCheck className="size-3" aria-hidden /> : <LuClock className="size-3" aria-hidden />} {o.statusLabel}
                    </span>
                    {!done && (
                      <label className="btn-pill btn-glass h-9 cursor-pointer px-3 text-[0.78125rem]">
                        {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuUpload className="size-3.5" aria-hidden />}
                        {rejected ? 'Επανα-ανέβασμα' : 'Ανέβασμα'}
                        <input
                          type="file"
                          className="hidden"
                          disabled={busy}
                          onChange={e => { const f = e.target.files?.[0]; if (f) void handleUpload(o.id, f); e.target.value = '' }}
                        />
                      </label>
                    )}
                  </li>
                )
              })}
            </ul>
          )}
        </div>
      ))}
    </div>
  )
}
