'use client'

import { ErrorCard } from './error-card'

/**
 * Τελευταία γραμμή άμυνας (σφάλμα και στο root layout): αντικαθιστά τη μαύρη «This page couldn't load» του Next με
 * σελίδα WWA στα ελληνικά. Αυτόνομη (δικό της html/body, inline στυλ) — δεν εξαρτάται από CSS/layout που μπορεί να απέτυχαν.
 */
export default function GlobalError({ unstable_retry }: { error: Error & { digest?: string }; unstable_retry: () => void }) {
  return (
    <html lang="el">
      <body style={{ margin: 0, minHeight: '100dvh', display: 'grid', placeItems: 'center', background: '#F6F7FA', color: '#0B0F2A', fontFamily: 'Roboto, system-ui, Arial, sans-serif', padding: 16 }}>
        <ErrorCard onRetry={unstable_retry} />
      </body>
    </html>
  )
}
