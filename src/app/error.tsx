'use client'

import { ErrorCard } from './error-card'

/** Σφάλμα σε σελίδες εκτός (app) — π.χ. /login, /reset-password, portal — αντί της προεπιλεγμένης σελίδας του Next. */
export default function RootError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <div style={{ minHeight: '70dvh', display: 'grid', placeItems: 'center', padding: 16, background: '#F6F7FA' }}>
      <ErrorCard onRetry={unstable_retry} />
    </div>
  )
}
