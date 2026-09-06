/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Button } from '../_components/button'
import { Faq, type FaqItem } from '../_components/faq'
import { IconCheck } from '../_components/icons'
import { wwaPhoto } from '../_wwa/assets'

export const metadata: Metadata = {
  title: 'Υπηρεσίες — Σύμβουλοι ΕΣΠΑ | World Wide Associates',
  description: 'Σχεδιασμός επενδυτικού σχεδίου, σύνταξη και υποβολή φακέλου ΕΣΠΑ, διαχείριση έργου μέχρι την εκταμίευση. Αμοιβή επιτυχίας μετά την έγκριση.',
}

const FAQS: FaqItem[] = [
  { q: 'Τι κάνει ένας σύμβουλος ΕΣΠΑ;', a: 'Ελέγχει αν η επιχείρηση είναι επιλέξιμη, σχεδιάζει το επενδυτικό σχέδιο ώστε να μεγιστοποιεί τη βαθμολογία, συντάσσει και υποβάλλει τον φάκελο στο ΟΠΣΚΕ και διαχειρίζεται το έργο μέχρι την τελική εκταμίευση: πιστοποιήσεις δαπανών, τροποποιήσεις, επαληθεύσεις.' },
  { q: 'Πόσο κοστίζει η σύνταξη φακέλου ΕΣΠΑ;', a: 'Στη WWA ο έλεγχος επιλεξιμότητας είναι δωρεάν και η αμοιβή σύνταξης είναι αμοιβή επιτυχίας: πληρώνεται μετά την έγκριση του έργου. Στα περισσότερα προγράμματα η αμοιβή του συμβούλου είναι επιλέξιμη δαπάνη και επιδοτείται.' },
  { q: 'Πόσο χρόνο χρειάζεται η προετοιμασία ενός φακέλου;', a: 'Συνήθως 2–4 εβδομάδες από τη συλλογή των δικαιολογητικών, ανάλογα με το πρόγραμμα και το μέγεθος της επένδυσης. Ξεκινώντας πριν την προκήρυξη, ο φάκελος υποβάλλεται τις πρώτες ημέρες — κάτι που μετράει στη συγκριτική αξιολόγηση.' },
  { q: 'Τι γίνεται αν το σχέδιο απορριφθεί;', a: 'Εξετάζουμε τους λόγους απόρριψης και υποβάλλουμε ένσταση όπου υπάρχει βάση. Επειδή αναλαμβάνουμε μόνο σχέδια που μπορούν να εγκριθούν, το ποσοστό εγκρίσεών μας κινείται στο 98–100%. Χωρίς έγκριση δεν υπάρχει αμοιβή σύνταξης.' },
  { q: 'Αναλαμβάνετε και την υλοποίηση μετά την έγκριση;', a: 'Ναι. Το πακέτο «Πλήρης διαχείριση» καλύπτει αιτήματα προκαταβολής, πιστοποιήσεις δαπανών ανά εξάμηνο, τροποποιήσεις φυσικού και οικονομικού αντικειμένου και την τελική επαλήθευση μέχρι την αποπληρωμή.' },
]

function Feature({ idx, stage, title, text, items, photo, primary, link }: {
  idx: string; stage: string; title: string; text: string; items: string[]; photo: string
  primary: string; link: string
}) {
  return (
    <article className="feature">
      <div className="photo"><img src={photo} alt="" /></div>
      <div>
        <span className="eyebrow"><span className="idx">{idx}</span>{stage}</span>
        <h2 style={{ marginTop: 12 }}>{title}</h2>
        <p className="k">{text}</p>
        <ul>{items.map((it, i) => <li key={i}><IconCheck />{it}</li>)}</ul>
        <div className="acts">
          <EligibilityCta>{primary}</EligibilityCta>
          <Button href="/epikoinonia" variant="link">{link}</Button>
        </div>
      </div>
    </article>
  )
}

export default function ServicesPage() {
  return (
    <>
      <SubBanner
        image={wwaPhoto('consulting')}
        crumbs={[{ label: 'Υπηρεσίες' }]}
        title="ΥΠΗΡΕΣΙΕΣ"
        sub={<>Από την ιδέα μέχρι την <span style={{ color: 'var(--wwa-cyan-400)' }}>εκταμίευση</span> — μία ομάδα</>}
        lead="Σχεδιασμός επενδυτικού σχεδίου, σύνταξη και υποβολή φακέλου, διαχείριση έργου. Αμοιβή επιτυχίας μετά την έγκριση."
      />

      <section lang="el">
        <div className="wrap">
          <Feature idx="01" stage="Στάδιο 1" title="Σχεδιασμός επενδυτικού σχεδίου"
            text="Ξεκινάμε με δωρεάν έλεγχο επιλεξιμότητας. Αν η επιχείρηση είναι επιλέξιμη, αναλύουμε ανάγκες, προϋπολογισμό και χρονοδιάγραμμα και σχεδιάζουμε πρόταση που μεγιστοποιεί τη βαθμολογία."
            items={['Έλεγχος ΚΑΔ, μεγέθους, περιοχής και προϋποθέσεων', 'Επιλογή κατάλληλου προγράμματος ή συνδυασμού', 'Προϋπολογισμός ανά κατηγορία δαπάνης', 'Εκτίμηση βαθμολογίας πριν την υποβολή']}
            photo={wwaPhoto('consulting')} primary="Δωρεάν αξιολόγηση" link="Πώς βαθμολογείται ένα σχέδιο" />
          <Feature idx="02" stage="Στάδιο 2" title="Σύνταξη και υποβολή φακέλου"
            text="Συλλέγουμε τα δικαιολογητικά, συντάσσουμε το επενδυτικό σχέδιο σύμφωνα με την προκήρυξη και υποβάλλουμε ηλεκτρονικά στο ΟΠΣΚΕ. Απαντάμε εμείς στις διευκρινίσεις των αξιολογητών."
            items={['Checklist δικαιολογητικών με προθεσμίες', 'Τεχνική και οικονομική τεκμηρίωση', 'Ηλεκτρονική υποβολή και παρακολούθηση', 'Ενστάσεις όπου χρειάζεται']}
            photo={wwaPhoto('team')} primary="Ξεκινήστε τον φάκελο" link="Τι περιλαμβάνει ο φάκελος" />
          <Feature idx="03" stage="Στάδιο 3" title="Διαχείριση και παρακολούθηση έργου"
            text="Μετά την ένταξη, διαχειριζόμαστε το έργο μέχρι την τελική εκταμίευση: αιτήματα προκαταβολής και τροποποίησης, πιστοποιήσεις δαπανών, επιτόπιες επαληθεύσεις."
            items={['Αίτημα προκαταβολής 40% με εγγυητική', 'Πιστοποίηση δαπανών ανά εξάμηνο', 'Τροποποιήσεις φυσικού και οικονομικού αντικειμένου', 'Τελική επαλήθευση και εκταμίευση']}
            photo={wwaPhoto('manufacturing')} primary="Ζητήστε προσφορά διαχείρισης" link="Η διαδικασία εκταμίευσης" />
        </div>
      </section>

      <section lang="el" className="alt">
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow"><span className="idx">04</span>Πώς δουλεύουμε</span><h2>Τέσσερα βήματα, μία υπεύθυνη ομάδα</h2></div>
          <div className="steps">
            <article><h3>Αξιολόγηση επιλεξιμότητας</h3><p>Δωρεάν, εντός μίας εργάσιμης.</p></article>
            <article><h3>Επενδυτικό σχέδιο</h3><p>Προϋπολογισμός, χρονοδιάγραμμα, τεκμηρίωση.</p></article>
            <article><h3>Υποβολή και αξιολόγηση</h3><p>ΟΠΣΚΕ, διευκρινίσεις, απόφαση ένταξης.</p></article>
            <article><h3>Υλοποίηση και εκταμίευση</h3><p>Πιστοποιήσεις, τροποποιήσεις, αποπληρωμή.</p></article>
          </div>
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div className="sec-head"><span className="eyebrow"><span className="idx">05</span>Αμοιβή</span><h2>Πληρώνετε όταν εγκριθεί το έργο σας</h2><p>Η αρχική αξιολόγηση είναι δωρεάν. Η αμοιβή σύνταξης συνδέεται με την έγκριση και είναι επιλέξιμη δαπάνη στα περισσότερα προγράμματα.</p></div>
          <div className="pkgs">
            <article className="pkg"><div className="name">Αξιολόγηση</div><div className="amt">Δωρεάν<small>απάντηση σε 1 εργάσιμη</small></div><ul><li><IconCheck />Έλεγχος επιλεξιμότητας</li><li><IconCheck />Εκτίμηση βαθμολογίας</li><li><IconCheck />Πρόταση προγραμμάτων</li></ul><EligibilityCta className="btn-outline">Ζητήστε αξιολόγηση</EligibilityCta></article>
            <article className="pkg featured"><span className="tag">Το πιο συνηθισμένο</span><div className="name">Σύνταξη &amp; υποβολή</div><div className="amt">Αμοιβή επιτυχίας<small>πληρωμή μετά την έγκριση</small></div><ul><li><IconCheck />Επενδυτικό σχέδιο</li><li><IconCheck />Δικαιολογητικά και υποβολή</li><li><IconCheck />Διευκρινίσεις και ενστάσεις</li></ul><EligibilityCta>Ξεκινήστε τον φάκελο</EligibilityCta></article>
            <article className="pkg"><div className="name">Πλήρης διαχείριση</div><div className="amt">Έως την εκταμίευση<small>σύνταξη, υποβολή, υλοποίηση</small></div><ul><li><IconCheck />Όλα τα παραπάνω</li><li><IconCheck />Πιστοποιήσεις δαπανών</li><li><IconCheck />Τελική επαλήθευση</li></ul><Button href="/epikoinonia" variant="outline">Ζητήστε προσφορά</Button></article>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="06" subtitle="Οι πιο συχνές ερωτήσεις για τη συνεργασία με σύμβουλο ΕΣΠΑ." />
    </>
  )
}
