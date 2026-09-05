import type { Metadata } from 'next'
import { FileWarning, Clock, Ban } from 'lucide-react'
import { resolveFileRequestByToken } from '@/lib/file-requests/public'
import { CustomerUploader } from '@/components/file-requests/customer-uploader'

/**
 * Δημόσια σελίδα «αίτημα δικαιολογητικών» (one-time link, token-gated ΧΩΡΙΣ session).
 * Top-level route (εκτός (app)/(public) groups, όπως /portal, /go, /unsubscribe)·
 * ο proxy επιτρέπει ήδη το /r/. noindex.
 */
export const metadata: Metadata = {
  title: 'Αίτημα δικαιολογητικών — World Wide Associates',
  robots: { index: false, follow: false },
}

export const dynamic = 'force-dynamic'

const REASON: Record<'not_found' | 'expired' | 'cancelled', { icon: typeof FileWarning; title: string; body: string }> = {
  not_found: { icon: FileWarning, title: 'Ο σύνδεσμος δεν βρέθηκε', body: 'Ο σύνδεσμος δεν είναι έγκυρος ή έχει αλλάξει. Επικοινώνησε με την ομάδα μας για νέο σύνδεσμο.' },
  expired: { icon: Clock, title: 'Ο σύνδεσμος έληξε', body: 'Το αίτημα δικαιολογητικών έχει λήξει. Ζήτησε από την ομάδα μας να σου στείλει έναν νέο σύνδεσμο.' },
  cancelled: { icon: Ban, title: 'Το αίτημα ακυρώθηκε', body: 'Αυτό το αίτημα δικαιολογητικών ακυρώθηκε. Αν πρόκειται για λάθος, επικοινώνησε μαζί μας.' },
}

export default async function FileRequestPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const req = await resolveFileRequestByToken(token)

  return (
    <main style={{ minHeight: '100dvh', display: 'grid', placeItems: 'center', padding: '1.5rem', background: '#0d1b22' }}>
      <div
        style={{
          width: '100%', maxWidth: '38rem', background: 'var(--card, #fff)', color: 'var(--foreground, #0f172a)',
          border: '1px solid var(--border, #e2e8f0)', borderRadius: '1rem', padding: '1.75rem',
          boxShadow: '0 18px 50px rgba(2,20,32,0.35)',
        }}
      >
        <div style={{ fontSize: '0.8rem', fontWeight: 700, letterSpacing: '0.14em', textTransform: 'uppercase', opacity: 0.7, marginBottom: '1rem' }}>
          World Wide Associates
        </div>

        {!req.ok ? (
          <Invalid reason={req.reason} />
        ) : (
          <div style={{ display: 'grid', gap: '1.25rem' }}>
            <header style={{ display: 'grid', gap: '0.35rem' }}>
              <h1 style={{ margin: 0, fontSize: '1.3rem', fontFamily: 'var(--font-display)' }}>{req.title}</h1>
              {req.message && <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--muted-foreground, #475569)' }}>{req.message}</p>}
              <p style={{ margin: '0.15rem 0 0', fontSize: '0.76rem', color: 'var(--muted-foreground, #94a3b8)', display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                <Clock size={13} aria-hidden />
                Λήγει: {new Date(req.expiresAt).toLocaleString('el-GR', { dateStyle: 'long', timeStyle: 'short' })}
              </p>
            </header>

            <CustomerUploader token={token} request={req} />
          </div>
        )}
      </div>
    </main>
  )
}

function Invalid({ reason }: { reason: 'not_found' | 'expired' | 'cancelled' }) {
  const { icon: Icon, title, body } = REASON[reason]
  return (
    <div style={{ display: 'grid', gap: '0.75rem', textAlign: 'center', padding: '1rem 0.5rem' }}>
      <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', width: '3rem', height: '3rem', margin: '0 auto', borderRadius: '999px', background: 'color-mix(in srgb, var(--muted-foreground, #64748b) 14%, transparent)', color: 'var(--muted-foreground, #64748b)' }}>
        <Icon size={24} aria-hidden />
      </span>
      <h1 style={{ margin: 0, fontSize: '1.15rem', fontFamily: 'var(--font-display)' }}>{title}</h1>
      <p style={{ margin: 0, fontSize: '0.9rem', lineHeight: 1.55, color: 'var(--muted-foreground, #475569)' }}>{body}</p>
    </div>
  )
}
