import type { Metadata } from 'next'
import { UnsubscribeForm } from './unsubscribe-form'

export const metadata: Metadata = {
  title: 'Διαγραφή από newsletter — World Wide Associates',
  robots: { index: false, follow: false },
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  return (
    <main
      style={{
        minHeight: '100dvh',
        display: 'grid',
        placeItems: 'center',
        padding: '1.5rem',
        background: '#0d1b22',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '28rem',
          background: 'var(--card, #fff)',
          color: 'var(--foreground, #0f172a)',
          border: '1px solid var(--border, #e2e8f0)',
          borderRadius: '1rem',
          padding: '1.75rem',
          boxShadow: '0 18px 50px rgba(2,20,32,0.35)',
        }}
      >
        <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.7, marginBottom: '0.9rem' }}>
          World Wide Associates
        </div>
        <UnsubscribeForm token={token} />
      </div>
    </main>
  )
}
