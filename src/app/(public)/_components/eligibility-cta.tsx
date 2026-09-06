'use client'

import type { ReactNode } from 'react'
import { openEligibility } from './eligibility-modal'

/**
 * CTA κουμπί που ανοίγει το modal ελέγχου επιλεξιμότητας (WWA .btn classes).
 * Χρησιμοποιείται όπου θέλουμε τη δωρεάν αξιολόγηση σε modal αντί για μετάβαση.
 */
export function EligibilityCta({
  children, size = 'md', variant = 'primary', className,
}: {
  children: ReactNode
  size?: 'sm' | 'md' | 'lg'
  variant?: 'primary' | 'inverse'
  className?: string
}) {
  const cls = ['btn', variant === 'inverse' ? 'btn-inverse' : '', size === 'sm' ? 'btn-sm' : size === 'lg' ? 'btn-lg' : '', className]
    .filter(Boolean).join(' ')
  return <button type="button" className={cls} onClick={openEligibility}>{children}</button>
}
