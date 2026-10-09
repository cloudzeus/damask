'use client'

/** Κάρτα σφάλματος WWA (inline στυλ — δουλεύει και χωρίς CSS). Κοινή για error.tsx / global-error.tsx. */
export function ErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div translate="no" style={{ maxWidth: 460, width: '100%', background: '#fff', borderRadius: 16, boxShadow: '0 4px 12px rgba(0,0,34,.08), 0 12px 32px rgba(0,0,34,.10)', padding: '32px 28px', textAlign: 'center' }}>
      <div aria-hidden style={{ width: 56, height: 56, margin: '0 auto 16px', borderRadius: 16, display: 'grid', placeItems: 'center', background: '#EEF1FA', color: '#001B72', fontSize: 28, fontWeight: 700 }}>!</div>
      <h1 style={{ margin: '0 0 8px', fontFamily: '"Roboto Condensed", Arial Narrow, Arial, sans-serif', fontWeight: 900, fontSize: 24, textTransform: 'uppercase', letterSpacing: '.01em' }}>Κάτι δεν φόρτωσε σωστά</h1>
      <p style={{ margin: '0 0 20px', color: '#474C60', lineHeight: 1.6, fontSize: 15 }}>
        Δοκιμάστε ξανά. Αν έχετε ενεργή την <b>αυτόματη μετάφραση</b> του browser, απενεργοποιήστε την για αυτή τη σελίδα — συχνά προκαλεί αυτό το πρόβλημα.
      </p>
      <div style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap' }}>
        <button type="button" onClick={onRetry} style={{ height: 48, padding: '0 28px', border: 0, borderRadius: 999, background: '#001B72', color: '#fff', font: '700 15px Roboto, system-ui, sans-serif', cursor: 'pointer' }}>Δοκιμάστε ξανά</button>
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages -- πλήρης επαναφόρτωση μετά από σφάλμα */}
        <a href="/" style={{ height: 48, padding: '0 24px', display: 'inline-flex', alignItems: 'center', borderRadius: 999, border: '1px solid #001B72', color: '#001B72', font: '700 15px Roboto, system-ui, sans-serif', textDecoration: 'none' }}>Αρχική</a>
      </div>
      <p style={{ margin: '18px 0 0', fontSize: 13, color: '#666C80' }}>Χρειάζεστε βοήθεια; <a href="tel:+302107218758" style={{ color: '#001B72' }}>210 721 8758</a></p>
    </div>
  )
}
