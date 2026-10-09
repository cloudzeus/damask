import Link from 'next/link'

/** 404 μέσα στο website (με header/footer), με χρήσιμους συνδέσμους αντί για αδιέξοδο. */
export default function PublicNotFound() {
  return (
    <section lang="el" style={{ padding: '96px 0' }}>
      <div className="wrap" style={{ maxWidth: 720, textAlign: 'center' }}>
        <h1>Η σελίδα δεν βρέθηκε</h1>
        <p style={{ margin: '16px 0 28px', color: 'var(--fg-2)' }}>Ίσως το πρόγραμμα έκλεισε ή η διεύθυνση άλλαξε. Δείτε τα ενεργά προγράμματα ή ελέγξτε δωρεάν αν η επιχείρησή σας δικαιούται επιδότηση.</p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link href="/programmata" className="btn">Ενεργά προγράμματα</Link>
          <Link href="/eligibility" className="btn btn-outline">Δείτε αν δικαιούστε</Link>
          <Link href="/nea" className="btn btn-outline">Νέα & οδηγοί</Link>
        </div>
      </div>
    </section>
  )
}
