'use client'

import * as React from 'react'
import { LuX } from 'react-icons/lu'

/**
 * Modal του portal (native <dialog>: Esc κλείνει, το focus μένει μέσα, backdrop). Το children μπορεί
 * να είναι συνάρτηση που παίρνει `close` — για κλείσιμο μετά από επιτυχή αποθήκευση.
 */
export function PModal({ trigger, triggerClassName = 'p-btn', title, description, children, disabled }: {
  trigger: React.ReactNode; triggerClassName?: string; title: string; description?: string; disabled?: boolean
  children: React.ReactNode | ((close: () => void) => React.ReactNode)
}) {
  const ref = React.useRef<HTMLDialogElement>(null)
  const [open, setOpen] = React.useState(false)
  const id = React.useId()
  const close = React.useCallback(() => setOpen(false), [])
  // Το <dialog> ακολουθεί την κατάσταση (άνοιγμα με showModal για focus trap + Esc).
  React.useEffect(() => {
    const d = ref.current
    if (!d) return
    if (open && !d.open) d.showModal()
    if (!open && d.open) d.close()
  }, [open])
  function show() { setOpen(true) }
  return (
    <>
      <button type="button" className={triggerClassName} onClick={show} disabled={disabled} aria-haspopup="dialog">{trigger}</button>
      <dialog ref={ref} className="p-modal" aria-labelledby={`${id}-t`} onClose={() => setOpen(false)}
        onClick={e => { if (e.target === e.currentTarget) close() }}>
        <div className="p-modal-in">
          <div className="p-modal-head">
            <div>
              <h2 id={`${id}-t`}>{title}</h2>
              {description && <p>{description}</p>}
            </div>
            <button type="button" className="p-modal-x" onClick={close} aria-label="Κλείσιμο"><LuX aria-hidden /></button>
          </div>
          {open && (typeof children === 'function' ? children(close) : children)}
        </div>
      </dialog>
    </>
  )
}
