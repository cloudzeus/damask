import type { Metadata } from 'next'
import { SiteNav } from '../site-nav'
import { EligibilityWizard } from './eligibility-wizard'

export const metadata: Metadata = {
  title: 'Έλεγχος επιλεξιμότητας — World Wide Associates',
  description:
    'Δες άμεσα σε ποια ενεργά επιδοτούμενα προγράμματα μπορεί να ενταχθεί η επιχείρησή σου. Συμπλήρωσε ΑΦΜ, email και τηλέφωνο.',
}

export default function EligibilityPage() {
  return (
    <>
      <SiteNav />
      <main
        style={{
          minHeight: '70vh',
          display: 'grid',
          gridTemplateColumns: '1fr',
          gap: '2rem',
          alignItems: 'center',
          justifyItems: 'center',
          padding: 'clamp(1.5rem, 5vw, 4rem) 1.25rem 3rem',
        }}
      >
        <div className="grid w-full max-w-5xl grid-cols-1 items-center gap-8 md:grid-cols-2">
          <section style={{ display: 'grid', gap: '1rem', alignContent: 'center' }}>
            <span className="eyebrow">Επιδοτούμενα προγράμματα · ΕΣΠΑ</span>
            <h1 style={{ margin: 0, fontFamily: 'var(--font-display)', fontSize: 'clamp(1.8rem, 4vw, 2.8rem)', lineHeight: 1.1 }}>
              Δες αν η επιχείρησή σου είναι επιλέξιμη.
            </h1>
            <p style={{ margin: 0, maxWidth: '32rem', fontSize: '1rem', lineHeight: 1.6, opacity: 0.9 }}>
              Με το ΑΦΜ σου εντοπίζουμε αυτόματα τους ΚΑΔ και την Περιφέρειά σου και ελέγχουμε όλα τα ενεργά
              προγράμματα. Η διαδικασία είναι δωρεάν και διαρκεί λιγότερο από ένα λεπτό.
            </p>
            <ul style={{ display: 'grid', gap: '0.5rem', margin: 0, padding: 0, listStyle: 'none', fontSize: '0.9rem', opacity: 0.85 }}>
              <li>✓ Άμεσος εντοπισμός στοιχείων μέσω ΑΑΔΕ</li>
              <li>✓ Επιβεβαίωση με κωδικό στο email σου</li>
              <li>✓ Εξατομικευμένη λίστα επιλέξιμων προγραμμάτων</li>
            </ul>
          </section>

          <section style={{ display: 'flex', justifyContent: 'center' }}>
            <EligibilityWizard />
          </section>
        </div>
      </main>
    </>
  )
}
