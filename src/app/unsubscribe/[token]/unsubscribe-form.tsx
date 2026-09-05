'use client'

import { useState, useTransition } from 'react'
import { unsubscribeByToken } from '@/lib/newsletter/actions'

export function UnsubscribeForm({ token }: { token: string }) {
  const [pending, start] = useTransition()
  const [done, setDone] = useState<null | { ok: boolean; email?: string }>(null)

  function submit() {
    start(async () => {
      const res = await unsubscribeByToken(token)
      setDone(res)
    })
  }

  if (done?.ok) {
    return (
      <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
        {done.email ? <><b>{done.email}</b> — η </> : 'Η '}
        διαγραφή σου ολοκληρώθηκε. Δεν θα λαμβάνεις πλέον ενημερώσεις (newsletter) από εμάς.
      </p>
    )
  }
  if (done && !done.ok) {
    return (
      <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
        Ο σύνδεσμος δεν είναι έγκυρος ή έχει ήδη χρησιμοποιηθεί.
      </p>
    )
  }

  return (
    <div style={{ display: 'grid', gap: '1rem' }}>
      <p style={{ margin: 0, fontSize: '0.95rem', lineHeight: 1.6 }}>
        Θέλεις να διαγραφείς από τις ενημερώσεις (newsletter) της World Wide Associates;
      </p>
      <button
        type="button"
        onClick={submit}
        disabled={pending}
        style={{
          minHeight: '2.9rem', borderRadius: '999px', border: 'none',
          background: 'var(--coral, #e11d48)', color: '#fff', fontWeight: 700, fontSize: '0.92rem', cursor: 'pointer', padding: '0 1.4rem',
        }}
      >
        {pending ? 'Γίνεται διαγραφή…' : 'Επιβεβαίωση διαγραφής'}
      </button>
    </div>
  )
}
