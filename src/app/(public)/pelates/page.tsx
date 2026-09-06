/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Button } from '../_components/button'
import { Faq, type FaqItem } from '../_components/faq'
import { IconCheck } from '../_components/icons'
import { wwaPageImage } from '../_wwa/assets'

export const metadata: Metadata = {
  title: 'Πελάτες — Έργα ΕΣΠΑ ανά κλάδο | World Wide Associates',
  description: 'Μεταποίηση, τουρισμός, λιανεμπόριο, τεχνολογία, καλλυντικά — επιχειρήσεις που χρηματοδοτήθηκαν μέσω ΕΣΠΑ με τη WWA, σε 13 περιφέρειες.',
}

const FAQS: FaqItem[] = [
  { q: 'Ποιες επιχειρήσεις συνεργάζονται με τη WWA;', a: 'Μικρομεσαίες επιχειρήσεις όλων των κλάδων — μεταποίηση, τουρισμός, λιανεμπόριο, τεχνολογία, καλλυντικά, κοινωνική οικονομία — από υπό ίδρυση έως εταιρείες με δεκαετίες λειτουργίας, σε 13 περιφέρειες της χώρας.' },
  { q: 'Μπορώ να μιλήσω με κάποιον πελάτη σας;', a: 'Ναι. Κατόπιν συνεννόησης, σας φέρνουμε σε επαφή με πελάτη του ίδιου κλάδου που έχει ολοκληρώσει έργο μαζί μας.' },
  { q: 'Αναλαμβάνετε πολύ μικρές επιχειρήσεις και ελεύθερους επαγγελματίες;', a: 'Ναι. Πολλά προγράμματα (π.χ. Ξεκινώ Επιχειρηματικά, e‑Λιανικό, Ψηφιακός Μετασχηματισμός — Βασικός) απευθύνονται σε ατομικές και πολύ μικρές επιχειρήσεις.' },
  { q: 'Τι ποσοστό των έργων σας εκταμιεύεται τελικά;', a: 'Το σύνολο των έργων που εντάσσονται φτάνει στην τελική εκταμίευση, εφόσον η επιχείρηση υλοποιήσει το φυσικό αντικείμενο. Η διαχείριση πιστοποιήσεων και τροποποιήσεων γίνεται από εμάς.' },
]

const CLIENTS: [string, string, string][] = [
  ['Αρτοποιία Παπαδόπουλος ΙΚΕ', 'Μεταποίηση · Τρόφιμα', 'Παράγουμε στην Ελλάδα'],
  ['Metalworks Α.Ε.', 'Μεταποίηση · Μεταλλικές κατασκευές', 'Αναπτυξιακός Νόμος'],
  ['Villa Kerkyra Suites', 'Τουρισμός · Κέρκυρα', 'Ενίσχυση Τουριστικών ΜμΕ'],
  ['Ionian Blue Hotel', 'Τουρισμός · Λευκάδα', 'Πράσινη Παραγωγική Επένδυση'],
  ['e‑Shop Αθηναίου', 'Λιανεμπόριο · E‑commerce', 'Ψηφιακός Μετασχηματισμός'],
  ['Οπτικά Νικολάου', 'Λιανεμπόριο', 'e‑Λιανικό'],
  ['Codeline Software Ο.Ε.', 'Τεχνολογία · SaaS', 'Ξεκινώ Επιχειρηματικά'],
  ['DataFlow Analytics', 'Τεχνολογία · Υπηρεσίες', 'Νεοφυής Επιχειρηματικότητα'],
  ['Olea Cosmetics', 'Καλλυντικά · Φυσικά προϊόντα', 'Εξωστρέφεια ΜμΕ'],
  ['Aegean Skin Lab', 'Καλλυντικά · Εργαστήριο', 'Ίδρυση Νέων ΜμΕ'],
  ['Κοιν.Σ.Επ. Ιόνιο', 'Κοινωνική οικονομία', 'Κοινωνική Επιχειρηματικότητα'],
  ['Έπιπλο Δημητρίου', 'Μεταποίηση · Έπιπλο', 'Αναβάθμιση Μικρών Επιχειρήσεων'],
]

const QUOTES: [string, string, string][] = [
  ['«Μας είπαν από την πρώτη μέρα ότι το σχέδιο περνάει και πέρασε. Ο ίδιος άνθρωπος από την αίτηση μέχρι την τελευταία πληρωμή.»', 'Α. Παπαδόπουλος', 'Αρτοποιία Παπαδόπουλος ΙΚΕ'],
  ['«Ο φάκελος ήταν έτοιμος δύο εβδομάδες πριν τη λήξη. Στις διευκρινίσεις των αξιολογητών απάντησαν εκείνοι, εμείς δεν ασχοληθήκαμε.»', 'Μ. Κωνσταντίνου', 'Villa Kerkyra Suites'],
  ['«Πληρώσαμε μετά την έγκριση. Στην υλοποίηση, κάθε πιστοποίηση δαπανών έγινε στην ώρα της χωρίς να χάσουμε ούτε ευρώ.»', 'Ε. Νικολάου', 'Codeline Software Ο.Ε.'],
]

const initials = (name: string) => name.split(' ').filter(w => /[Α-ΩA-Z]/.test(w[0])).slice(0, 2).map(w => w[0]).join('')

export default function ClientsPage() {
  return (
    <>
      <SubBanner
        image={wwaPageImage('cl-banner')}
        crumbs={[{ label: 'Εταιρεία', href: '/etaireia' }, { label: 'Πελάτες' }]}
        title="ΠΕΛΑΤΕΣ"
        sub={<>Επιχειρήσεις που <span style={{ color: 'var(--wwa-cyan-400)' }}>εμπιστεύτηκαν</span> τη WWA</>}
        lead="Μεταποίηση, τουρισμός, λιανεμπόριο, τεχνολογία, καλλυντικά — σε όλη την Ελλάδα. Ενδεικτικά έργα ανά κλάδο."
      />

      <section lang="el" className="alt">
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow"><span className="idx">01</span>Ενδεικτικοί πελάτες</span><h2>Έργα ανά κλάδο</h2><p>Ενδεικτικές επιχειρήσεις‑πελάτες και το πρόγραμμα από το οποίο χρηματοδοτήθηκαν.</p></div>
          <div className="page-tabs">
            {['Όλοι', 'Μεταποίηση', 'Τουρισμός', 'Λιανεμπόριο', 'Τεχνολογία', 'Καλλυντικά'].map((t, i) => (
              <button key={t} className="chip" aria-pressed={i === 0}>{t}</button>
            ))}
          </div>
          <div className="client-grid">
            {CLIENTS.map(([name, sector, prog]) => (
              <div key={name} className="client"><b>{name}</b><span>{sector}</span><span className="tag">{prog}</span></div>
            ))}
          </div>
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow"><span className="idx">02</span>Ενδεικτικό έργο</span><h2>Από την αίτηση στην εκταμίευση σε 14 μήνες</h2></div>
          <article className="feature" style={{ paddingTop: 0 }}>
            <div className="photo"><img src={wwaPageImage('cl-hotel')} alt="" /></div>
            <div>
              <span className="badge badge-closed">Ολοκληρωμένο</span>
              <h2 style={{ marginTop: 14 }}>Villa Kerkyra Suites — Ενίσχυση Τουριστικών ΜμΕ</h2>
              <p className="k">Ανακαίνιση 12 σουιτών, ενεργειακή αναβάθμιση και νέο σύστημα κρατήσεων. Το σχέδιο εγκρίθηκε με βαθμολογία 89/100 και η επιχείρηση έλαβε προκαταβολή 40% τρεις μήνες μετά την ένταξη.</p>
              <ul>
                <li><IconCheck />Επιδότηση 45% σε προϋπολογισμό €280.000</li>
                <li><IconCheck />Δύο πιστοποιήσεις δαπανών, μία τροποποίηση</li>
                <li><IconCheck />Τελική εκταμίευση 14 μήνες μετά την υποβολή</li>
              </ul>
              <div className="acts"><EligibilityCta>Δείτε αν δικαιούστε</EligibilityCta><Button href="/programmata" variant="link">Τα προγράμματα</Button></div>
            </div>
          </article>
        </div>
      </section>

      <section lang="el" className="alt">
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow"><span className="idx">03</span>Τι λένε οι πελάτες</span><h2>Η γνώμη τους μετά την εκταμίευση</h2></div>
          <div className="cards3">
            {QUOTES.map(([text, name, org]) => (
              <article key={name} className="quote-card"><p>{text}</p><div className="who"><span className="avatar">{initials(name)}</span><span><b>{name}</b>{org}</span></div></article>
            ))}
          </div>
        </div>
      </section>

      <section lang="el" className="stats">
        <div className="wrap">
          <div className="stat"><div className="value" data-count="2500" data-suffix="+">2.500+</div><div className="label">επενδυτικά σχέδια με έγκριση</div></div>
          <div className="stat accent"><div className="value">98–100%</div><div className="label">ποσοστό εγκρίσεων</div></div>
          <div className="stat"><div className="value">6</div><div className="label">κλάδοι με εξειδίκευση</div></div>
          <div className="stat"><div className="value">13</div><div className="label">περιφέρειες με έργα</div></div>
        </div>
      </section>

      <Faq items={FAQS} idx="04" subtitle="Τα πιο συχνά ερωτήματα από νέους πελάτες." />
    </>
  )
}
