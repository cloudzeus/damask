import type { Metadata } from 'next'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Faq, type FaqItem } from '../_components/faq'
import { IconCheck, IconPhone, IconMail, IconPin } from '../_components/icons'
import { wwaPageImage } from '../_wwa/assets'

export const metadata: Metadata = {
  title: 'Επικοινωνία — World Wide Associates, Σύμβουλοι ΕΣΠΑ',
  description: 'Τηλέφωνο 210 721 8758, email info@wwa-espa.com, Αλεξανδρουπόλεως 25 Αθήνα. Δωρεάν έλεγχος επιλεξιμότητας ΕΣΠΑ, απάντηση σε μία εργάσιμη.',
}

const FAQS: FaqItem[] = [
  { q: 'Τι χρειάζεται για τον δωρεάν έλεγχο επιλεξιμότητας;', a: 'ΑΦΜ, email και τηλέφωνο. Σε μία εργάσιμη σας λέμε ποια προγράμματα σας αφορούν και με τι ποσοστό ενίσχυσης.' },
  { q: 'Εξυπηρετείτε επιχειρήσεις εκτός Αθήνας;', a: 'Ναι, σε όλη την Ελλάδα. Η επικοινωνία γίνεται ηλεκτρονικά και τηλεφωνικά· επιτόπιες επισκέψεις όπου απαιτούνται από το πρόγραμμα.' },
  { q: 'Πόσο κοστίζει η υπηρεσία;', a: 'Η αξιολόγηση είναι δωρεάν. Η αμοιβή σύνταξης είναι αμοιβή επιτυχίας και πληρώνεται μετά την έγκριση του έργου.' },
  { q: 'Ποιες ώρες μπορώ να καλέσω;', a: 'Δευτέρα έως Παρασκευή 09:00–18:00 στο 210 721 8758. Εκτός ωραρίου, στείλτε τη φόρμα ή email στο info@wwa-espa.com και θα σας καλέσουμε την επόμενη εργάσιμη.' },
  { q: 'Είναι υποχρεωτική η επίσκεψη στα γραφεία σας;', a: 'Όχι. Όλη η διαδικασία μπορεί να γίνει εξ αποστάσεως, με ηλεκτρονική ανταλλαγή εγγράφων και υπογραφών.' },
]

export default function ContactPage() {
  return (
    <>
      <SubBanner
        image={wwaPageImage('contact-banner')}
        crumbs={[{ label: 'Επικοινωνία' }]}
        title="ΕΠΙΚΟΙΝΩΝΙΑ"
        sub={<>Απάντηση σε <span style={{ color: 'var(--wwa-cyan-400)' }}>μία εργάσιμη</span></>}
        lead="Τηλέφωνο, email ή ο δωρεάν έλεγχος επιλεξιμότητας — όπως σας βολεύει. Δεν δεσμεύει σε τίποτα."
      />

      <section lang="el" className="alt" id="contact">
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow"><span className="idx">01</span>Επικοινωνία</span><h2>Πείτε μας για την επιχείρησή σας</h2><p>Ξεκινήστε τον δωρεάν έλεγχο ή καλέστε μας. Χωρίς δέσμευση, χωρίς χρέωση.</p></div>
          <div className="contact-grid">
            <div className="info-card" style={{ display: 'grid', gap: 16, alignContent: 'start' }}>
              <h3>Ζητήστε δωρεάν αξιολόγηση</h3>
              <p style={{ color: 'var(--fg-2)', fontSize: 15 }}>Χρειαζόμαστε μόνο ΑΦΜ, email και τηλέφωνο. Επιβεβαιώνετε με έναν κωδικό μιας χρήσης και βλέπετε αμέσως τα προγράμματα που σας αφορούν — και η ομάδα μας ειδοποιείται για να επικοινωνήσει μαζί σας.</p>
              <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, fontSize: 15, color: 'var(--fg-1)' }}>
                <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ color: 'var(--brand)', flex: 'none', width: 20, height: 20 }}><IconCheck /></span>Απάντηση σε μία εργάσιμη</li>
                <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ color: 'var(--brand)', flex: 'none', width: 20, height: 20 }}><IconCheck /></span>Χωρίς χρέωση — αμοιβή επιτυχίας</li>
                <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ color: 'var(--brand)', flex: 'none', width: 20, height: 20 }}><IconCheck /></span>Τα στοιχεία σας δεν κοινοποιούνται σε τρίτους</li>
              </ul>
              <EligibilityCta size="lg" className="btn-block">Ξεκινήστε τον δωρεάν έλεγχο</EligibilityCta>
              <span style={{ fontSize: 13, color: 'var(--fg-3)' }}>Προτιμάτε email; Γράψτε μας στο <a href="mailto:info@wwa-espa.com" style={{ color: 'var(--brand)', fontWeight: 500 }}>info@wwa-espa.com</a>.</span>
            </div>

            <div style={{ display: 'grid', gap: 24, alignContent: 'start' }}>
              <div className="info-card">
                <h3>Στοιχεία επικοινωνίας</h3>
                <div className="row"><IconPhone /><div><b><a href="tel:+302107218758" style={{ textDecoration: 'none', color: 'inherit' }}>210 721 8758</a></b><span>Δευτέρα–Παρασκευή 09:00–18:00</span></div></div>
                <div className="row"><IconMail /><div><b><a href="mailto:info@wwa-espa.com" style={{ textDecoration: 'none', color: 'inherit' }}>info@wwa-espa.com</a></b><span>Απάντηση εντός μίας εργάσιμης</span></div></div>
                <div className="row"><IconPin /><div><b>Αλεξανδρουπόλεως 25, Αθήνα 115 27</b><span>Ιλίσια · 5΄ από το μετρό Ευαγγελισμός</span></div></div>
              </div>
              <div className="map"><div className="grid" /><div className="pin"><IconPin /><b>World Wide Associates · Αλεξανδρουπόλεως 25</b></div></div>
            </div>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="02" title="Πριν επικοινωνήσετε" subtitle="Οι πιο συχνές ερωτήσεις πριν την πρώτη επικοινωνία." />
    </>
  )
}
