'use client'

import { LuSparkles } from 'react-icons/lu'

/** Κουμπί που ανοίγει τον βοηθό Thanos (πλωτό widget) — event `thanos:ask` χωρίς ερώτηση. */
export function AskThanosButton({ className, label = 'Ρωτήστε τον Thanos' }: { className?: string; label?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new CustomEvent('thanos:ask', { detail: {} }))}>
      <LuSparkles aria-hidden /> {label}
    </button>
  )
}
