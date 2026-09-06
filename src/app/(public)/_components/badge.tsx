import type { ReactNode } from 'react'

/**
 * WWA public Badge — pill status chip (.badge + variants) από _wwa/components.css.
 * `dot=false` κρύβει την τελεία. variant «new» = το μοναδικό magenta tag ανά σελίδα.
 */
type Variant = 'default' | 'active' | 'upcoming' | 'running' | 'closed' | 'brand' | 'solid' | 'new'

const VARIANT_CLASS: Record<Variant, string> = {
  default: '',
  active: 'badge-active',
  upcoming: 'badge-upcoming',
  running: 'badge-running',
  closed: 'badge-closed',
  brand: 'badge-brand',
  solid: 'badge-solid',
  new: 'badge-new',
}

export function Badge({
  children, variant = 'default', dot = true, className,
}: { children: ReactNode; variant?: Variant; dot?: boolean; className?: string }) {
  return (
    <span className={['badge', VARIANT_CLASS[variant], dot ? '' : 'badge-nodot', className].filter(Boolean).join(' ')}>
      {children}
    </span>
  )
}
