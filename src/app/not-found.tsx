import Link from 'next/link'
import { AuthShell } from './portal/_components/auth-shell'

export const metadata = { title: 'Η σελίδα δεν βρέθηκε — World Wide Associates', robots: { index: false, follow: true } }

/** 404 για διευθύνσεις εκτός site/εφαρμογής — με το ύφος του site και χρήσιμους συνδέσμους. */
export default function NotFound() {
  return (
    <AuthShell>
      <div className="p-auth-form">
        <h1>Η σελίδα δεν βρέθηκε</h1>
        <p className="p-muted">Ίσως το πρόγραμμα έκλεισε ή η διεύθυνση άλλαξε. Δείτε τα ενεργά προγράμματα ή ελέγξτε δωρεάν αν η επιχείρησή σας δικαιούται επιδότηση.</p>
        <Link className="p-btn" href="/programmata">Ενεργά προγράμματα</Link>
        <Link className="p-btn p-btn-outline" href="/eligibility">Δείτε αν δικαιούστε</Link>
        <p className="p-auth-links"><Link href="/">Αρχική</Link> · <Link href="/nea" style={{ marginLeft: 8 }}>Οδηγοί</Link> · <Link href="/glossari" style={{ marginLeft: 8 }}>Γλωσσάριο</Link></p>
      </div>
    </AuthShell>
  )
}
