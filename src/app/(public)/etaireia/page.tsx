/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Button } from '../_components/button'
import { Faq, type FaqItem } from '../_components/faq'
import { IconCheck, IconShield, IconChart, IconInfo } from '../_components/icons'
import { wwaPhoto, wwaPageImage } from '../_wwa/assets'

export const metadata: Metadata = {
  title: 'Η εταιρεία — World Wide Associates, Σύμβουλοι ΕΣΠΑ',
  description: 'Σύμβουλοι ΕΣΠΑ με έδρα την Αθήνα και 2.500+ εγκεκριμένα επενδυτικά σχέδια, ποσοστό εγκρίσεων 98–100%. Διαφάνεια, αξιοπιστία, αποτελεσματικότητα.',
}

const FAQS: FaqItem[] = [
  { q: 'Τι είναι η World Wide Associates;', a: 'Η World Wide Associates (WWA) είναι εταιρεία συμβούλων επιχειρήσεων με έδρα την Αθήνα, εξειδικευμένη σε προγράμματα ΕΣΠΑ, Αναπτυξιακού Νόμου και Ταμείου Ανάκαμψης. Έχει υποβάλει περισσότερα από 2.500 επενδυτικά σχέδια με ποσοστό εγκρίσεων 98–100%.' },
  { q: 'Πού βρίσκεται η WWA και ποιες περιοχές εξυπηρετεί;', a: 'Τα γραφεία βρίσκονται στην οδό Αλεξανδρουπόλεως 25, Αθήνα 115 27. Εξυπηρετούμε επιχειρήσεις σε όλη την Ελλάδα, ηλεκτρονικά και τηλεφωνικά, με επιτόπιες επισκέψεις όπου το απαιτεί το πρόγραμμα.' },
  { q: 'Σε ποιους φορείς συμμετέχει η WWA;', a: 'Είμαστε επίσημοι σύμβουλοι του ΣΕΔΕ και μέλη του ΣΥ.Σ.ΕΠ., του GR.EC.A, του ΠΣΒΑΚ και του BNI Greece, καθώς και συνεργάτες του δικτύου Entersoftone.' },
  { q: 'Ποιος θα χειρίζεται τον φάκελό μου;', a: 'Ο ίδιος σύμβουλος από την αξιολόγηση μέχρι την τελική εκταμίευση. Δεν υπάρχει μεταβίβαση σε διαφορετικά τμήματα ανά στάδιο.' },
  { q: 'Με ποιους κλάδους έχετε μεγαλύτερη εμπειρία;', a: 'Μεταποίηση και τρόφιμα, τουρισμός, λιανεμπόριο και ηλεκτρονικό εμπόριο, τεχνολογία και λογισμικό, καλλυντικά, κοινωνική οικονομία.' },
]

const tick = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
)

export default function CompanyPage() {
  return (
    <>
      <SubBanner
        image={wwaPageImage('co-banner')}
        crumbs={[{ label: 'Εταιρεία' }]}
        title="Η ΕΤΑΙΡΕΙΑ"
        sub={<>Σύμβουλοι ΕΣΠΑ με <span style={{ color: 'var(--wwa-cyan-400)' }}>2.500+</span> εγκεκριμένα σχέδια</>}
        lead="Λειτουργούμε από την Αθήνα με πελάτες σε όλη την Ελλάδα. Διαφάνεια, αξιοπιστία και αποτελεσματικότητα σε κάθε στάδιο."
      />

      {/* ΠΟΙΟΙ ΕΙΜΑΣΤΕ — promo panel (navy + φωτο) */}
      <section lang="el" className="company">
        <div className="wrap">
          <div className="promo r">
            <div className="photo square"><img src={wwaPageImage('promo-team')} alt="Συνάντηση με επιχείρηση-πελάτη" /></div>
            <div className="txt">
              <span className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}><span className="idx" style={{ color: 'var(--wwa-cyan-400)' }}>01</span>Ποιοι είμαστε</span>
              <h2>Μια ομάδα δίπλα σε κάθε ελληνική επιχείρηση</h2>
              <p>Η World Wide Associates ιδρύθηκε για έναν λόγο: να κάνει τα ευρωπαϊκά και εθνικά χρηματοδοτικά εργαλεία — ΕΣΠΑ, Αναπτυξιακό Νόμο, Ταμείο Ανάκαμψης — προσιτά και κατανοητά για κάθε μικρομεσαία επιχείρηση.</p>
              <ul>
                <li>{tick}Ο ίδιος σύμβουλος σας συνοδεύει από την ιδέα μέχρι την εκταμίευση — χωρίς μεταβιβάσεις ανά τμήμα.</li>
                <li>{tick}Αναλαμβάνουμε μόνο σχέδια που μπορούν να εγκριθούν — αν δεν είστε επιλέξιμοι, θα το μάθετε από την πρώτη κουβέντα.</li>
                <li>{tick}Πληρώνετε με αμοιβή επιτυχίας, μετά την έγκριση.</li>
              </ul>
              <div className="actions"><EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta><Button href="/pelates" variant="inverse-outline">Πελάτες</Button></div>
            </div>
          </div>
        </div>
      </section>

      {/* ΑΞΙΕΣ */}
      <section lang="el" className="alt">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">02</span>Αξίες</span><h2>Αυτά που μας κρατούν στο 98–100%</h2><p>Δεν είναι σύνθημα — είναι ο τρόπος που δουλεύουμε κάθε φάκελο.</p></div>
          <div className="values">
            <div className="value r"><IconShield /><h3>Διαφάνεια</h3><p>Λέμε από την πρώτη επικοινωνία αν ένα σχέδιο έχει πιθανότητες. Καμία υπόσχεση που δεν μπορούμε να κρατήσουμε.</p></div>
            <div className="value r"><IconCheck /><h3>Αξιοπιστία</h3><p>Φάκελος έτοιμος πριν από τη λήξη, πιστοποιήσεις στην ώρα τους, καμία χαμένη εκταμίευση.</p></div>
            <div className="value r"><IconChart /><h3>Αποτελεσματικότητα</h3><p>Μετράμε τη δουλειά μας σε εγκρίσεις και εκταμιεύσεις, όχι σε υποβολές.</p></div>
          </div>
        </div>
      </section>

      {/* Η ΠΡΟΣΕΓΓΙΣΗ ΜΑΣ — feature row (φωτο | κείμενο) */}
      <section lang="el">
        <div className="wrap">
          <article className="feature">
            <div className="photo"><img src={wwaPhoto('consulting')} alt="" /></div>
            <div>
              <span className="eyebrow"><span className="idx">03</span>Η προσέγγισή μας</span>
              <h2 style={{ marginTop: 12 }}>Λιγότερο άγχος για εσάς, περισσότερη δουλειά για εμάς</h2>
              <p className="k">Πίσω από κάθε εγκεκριμένο έργο βρίσκεται μια πολυεπιστημονική ομάδα — οικονομολόγοι, μηχανικοί και νομικοί — με εμπειρία σε τρεις προγραμματικές περιόδους ΕΣΠΑ. Συντονίζουμε εμείς λογιστή, μηχανικό και σύμβουλο· εσείς εστιάζετε στην επιχείρησή σας.</p>
              <ul>
                <li>{tick}Δωρεάν έλεγχος επιλεξιμότητας, με απάντηση σε μία εργάσιμη</li>
                <li>{tick}Σχεδιασμός που μεγιστοποιεί τη βαθμολογία του σχεδίου σας</li>
                <li>{tick}Υποβολή, διευκρινίσεις και πλήρης διαχείριση μέχρι την εκταμίευση</li>
              </ul>
              <div className="acts"><EligibilityCta>Δωρεάν αξιολόγηση</EligibilityCta><Button href="/ypiresies" variant="link">Οι υπηρεσίες μας</Button></div>
            </div>
          </article>
          <div className="note" style={{ maxWidth: 760 }}><IconInfo /><span>Έδρα: Αλεξανδρουπόλεως 25, Αθήνα 115 27 · Εξυπηρετούμε επιχειρήσεις σε όλη την Ελλάδα, με επιτόπιες επισκέψεις όπου χρειάζεται.</span></div>
        </div>
      </section>

      {/* ΣΕ ΑΡΙΘΜΟΥΣ */}
      <section lang="el" className="stats alt">
        <div className="wrap">
          <div className="stat r"><div className="value" data-count="2500" data-suffix="+">2.500+</div><div className="label">επενδυτικά σχέδια με έγκριση</div></div>
          <div className="stat r"><div className="value">98–100%</div><div className="label">ποσοστό εγκρίσεων</div></div>
          <div className="stat r"><div className="value" data-count="30" data-suffix="+">30+</div><div className="label">προγράμματα σε υλοποίηση ή ολοκληρωμένα</div></div>
          <div className="stat r"><div className="value">3</div><div className="label">προγραμματικές περίοδοι ΕΣΠΑ</div></div>
        </div>
      </section>

      {/* ΦΟΡΕΙΣ */}
      <section lang="el">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">04</span>Φορείς &amp; συνεργασίες</span><h2>Δεν δουλεύουμε μόνοι μας</h2><p>Επίσημοι σύμβουλοι του ΣΕΔΕ και μέλη σε κορυφαίους κλαδικούς φορείς — γιατί οι σωστές συνεργασίες φέρνουν καλύτερα αποτελέσματα.</p></div>
          <div className="aff" style={{ marginTop: 8 }}><div className="wrap" style={{ padding: 0 }}><div className="logo-strip"><span>ΣΕΔΕ</span><span>ΣΥ.Σ.ΕΠ.</span><span>GR.EC.A</span><span>ΠΣΒΑΚ</span><span>BNI Greece</span><span>Entersoftone</span></div></div></div>
        </div>
      </section>

      <Faq items={FAQS} idx="05" subtitle="Τα πιο συχνά ερωτήματα για την εταιρεία." />
    </>
  )
}
