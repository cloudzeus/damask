'use client'

import type { ReactNode } from 'react'
import { openEligibility, type EligibilityMode } from './eligibility-modal'

/**
 * CTA κουμπί που ανοίγει το modal ελέγχου επιλεξιμότητας (WWA .btn classes).
 * Χρησιμοποιείται όπου θέλουμε τη δωρεάν αξιολόγηση σε modal αντί για μετάβαση.
 */
export function EligibilityCta({
  children, size = 'md', variant = 'primary', className, mode = 'check',
}: {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'inverse'
  className?: string
  /** 'notify' = «Ενημερώστε με για νέα προγράμματα». */
  mode?: EligibilityMode
}) {
  const cls = ['btn', variant === 'inverse' ? 'btn-inverse' : '', size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '', className]
    .filter(Boolean).join(' ')
  return <button type="button" className={cls} onClick={() => openEligibility(mode)}>{children}</button>
}
