import type { Metadata } from 'next'
import Link from 'next/link'
import { LuHandshake, LuLayers, LuRadar, LuMessagesSquare, LuClock, LuFileCheck, LuCalculator, LuMailCheck } from 'react-icons/lu'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Button } from '../_components/button'
import { Faq, type FaqItem } from '../_components/faq'
import { AnswerBox } from '../_components/program-grid'
import { IconCheck } from '../_components/icons'
import { ShowAssistant } from '../_components/portal-showcase'
import { wwaPageImage } from '../_wwa/assets'
import { Pic } from '../_components/pic'

export const metadata: Metadata = {
  alternates: { canonical: '/ypiresies' },
  title: 'Υπηρεσίες συμβούλων ΕΣΠΑ & επιδοτήσεων | World Wide Associates',
  description: 'Ο σύμβουλος της επιχείρησής σας για όλα τα προγράμματα: σχεδιασμός, υποβολή, διαχείριση έως την εκταμίευση, παρακολούθηση νέων ευκαιριών και ψηφιακός βοηθός 24/7.',
}

const FAQS: FaqItem[] = [
  { q: 'Τι κάνει ένας σύμβουλος ΕΣΠΑ;', a: 'Ελέγχει αν η επιχείρηση είναι επιλέξιμη, σχεδιάζει το επενδυτικό σχέδιο ώστε να μεγιστοποιεί τη βαθμολογία, συντάσσει και υποβάλλει τον φάκελο και διαχειρίζεται το έργο μέχρι την τελική εκταμίευση: πιστοποιήσεις δαπανών, τροποποιήσεις, επαληθεύσεις.' },
  { q: 'Γιατί να συνεργαστώ μακροχρόνια και όχι για μία αίτηση;', a: 'Γιατί κάθε χρόνο ανοίγουν νέα προγράμματα. Έχοντας ήδη τα στοιχεία της επιχείρησής σας — ΚΑΔ, έδρα, μέγεθος, επενδύσεις που έγιναν — βλέπουμε αμέσως ποιο νέο πρόγραμμα σας ταιριάζει και ετοιμάζουμε τον φάκελο πριν ανοίξει η υποβολή, χωρίς να ξεκινάτε από το μηδέν.' },
  { q: 'Μπορείτε να διαχειριστείτε ταυτόχρονα πολλά προγράμματα της ίδιας επιχείρησης;', a: 'Ναι. Παρακολουθούμε όλα τα έργα σας μαζί — ΕΣΠΑ, Αναπτυξιακό Νόμο, LEADER — ώστε οι δαπάνες να μη συγκρούονται, να τηρούνται τα όρια ενισχύσεων όπως το de minimis και να μη χάνεται καμία προθεσμία.' },
  { q: 'Τι είναι ο Thanos;', a: 'Είναι ο ψηφιακός βοηθός της πύλης πελατών. Απαντά 24 ώρες το 24ωρο για τα δικά σας έργα — τι εκκρεμεί, αν μια δαπάνη είναι επιλέξιμη, πότε λήγει μια προθεσμία — και ετοιμάζει ενέργειες, όπως ένα email προς τον λογιστή σας, που εκτελούνται μόνο με τη δική σας έγκριση.' },
  { q: 'Πόσο κοστίζει η σύνταξη φακέλου;', a: 'Ο έλεγχος επιλεξιμότητας είναι δωρεάν και η αμοιβή σύνταξης είναι αμοιβή επιτυχίας: πληρώνεται μετά την έγκριση του έργου. Στα περισσότερα προγράμματα η αμοιβή του συμβούλου είναι επιλέξιμη δαπάνη και επιδοτείται.' },
  { q: 'Τι γίνεται αν το σχέδιο απορριφθεί;', a: 'Εξετάζουμε τους λόγους απόρριψης και υποβάλλουμε ένσταση όπου υπάρχει βάση. Επειδή αναλαμβάνουμε μόνο σχέδια που μπορούν να εγκριθούν, το ποσοστό εγκρίσεών μας κινείται στο 98–100%. Χωρίς έγκριση δεν υπάρχει αμοιβή σύνταξης.' },
]

/** Ενδεικτική πορεία ενός πελάτη στα χρόνια (υποθετικό παράδειγμα — όχι πραγματική επιχείρηση). */
const JOURNEY = [
  { year: 'Έτος 1', tone: 'c0', title: 'Ψηφιακός μετασχηματισμός', note: 'ΕΣΠΑ · λογισμικό & e-shop', state: 'Ολοκληρώθηκε' },
  { year: 'Έτος 2', tone: 'c1', title: 'Εκσυγχρονισμός εξοπλισμού', note: 'Περιφερειακό πρόγραμμα', state: 'Εκταμιεύτηκε' },
  { year: 'Έτος 3', tone: 'c2', title: 'Νέα μονάδα παραγωγής', note: 'Αναπτυξιακός Νόμος', state: 'Σε υλοποίηση' },
  { year: 'Επόμενο', tone: 'c3', title: 'Νέα ευκαιρία εντοπίστηκε', note: 'Σας ειδοποιούμε πριν ανοίξει', state: 'Προετοιμασία' },
]

function Stage({ idx, title, text, items, photo }: { idx: string; title: string; text: string; items: string[]; photo: string }) {
  return (
    <article className="feature">
      <div className="photo"><Pic src={photo} sizes="(min-width: 1024px) 50vw, 100vw" loading="lazy" /></div>
      <div>
        <span className="eyebrow"><span className="idx">{idx}</span>Κάθε έργο</span>
        <h2 style={{ marginTop: 12 }}>{title}</h2>
        <p className="k">{text}</p>
        <ul>{items.map((it, i) => <li key={i}><IconCheck />{it}</li>)}</ul>
      </div>
    </article>
  )
}

export default function ServicesPage() {
  return (
    <>
      <SubBanner
        image={wwaPageImage('svc-banner')}
        crumbs={[{ label: 'Υπηρεσίες' }]}
        title="ΥΠΗΡΕΣΙΕΣ"
        sub={<>Ο σύμβουλος της επιχείρησής σας — <span style={{ color: 'var(--wwa-cyan-400)' }}>για όλα τα προγράμματα, για χρόνια</span></>}
        lead="Δεν αναλαμβάνουμε απλώς μια αίτηση. Γνωρίζουμε την επιχείρησή σας, διαχειριζόμαστε όλα τα έργα της μαζί και σας ειδοποιούμε για κάθε νέα ευκαιρία — με σύστημα παρακολούθησης αιχμής και ψηφιακό βοηθό 24/7."
        meta={<><EligibilityCta variant="inverse">Δωρεάν αξιολόγηση</EligibilityCta><Link className="btn btn-inverse-outline" href="/pyli-pelaton">Η πύλη πελατών</Link></>}
      />

      <section lang="el" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <AnswerBox>
            Η World Wide Associates σχεδιάζει, υποβάλλει και διαχειρίζεται επιδοτούμενα επενδυτικά σχέδια επιχειρήσεων — ΕΣΠΑ, Αναπτυξιακός Νόμος, LEADER — από τον <b>δωρεάν έλεγχο επιλεξιμότητας</b> έως την <b>εκταμίευση</b>, με αμοιβή επιτυχίας μετά την έγκριση. Με <b>μακροχρόνια συνεργασία</b> παρακολουθούμε όλα τα έργα σας μαζί και εντοπίζουμε έγκαιρα κάθε νέο πρόγραμμα που σας ταιριάζει.
          </AnswerBox>
        </div>
      </section>

      {/* ── Το μοντέλο μας ── */}
      <section lang="el" className="sband svcm" aria-labelledby="svcm-t">
        <span className="sband-ribbons" aria-hidden><i /><i /><i /><i /></span>
        <div className="wrap">
          <div className="sband-head r">
            <span className="sband-eyebrow">Το μοντέλο μας</span>
            <h2 id="svcm-t">Μια συνεργασία που δουλεύει κάθε χρόνο</h2>
            <p className="svcm-lead">Οι περισσότεροι σύμβουλοι αναλαμβάνουν μία αίτηση και φεύγουν. Εμείς μένουμε δίπλα σας — και αυτό σας δίνει πλεονέκτημα σε κάθε νέο πρόγραμμα.</p>
          </div>
          <div className="svcm-pillars">
            <article className="sband-item c0 r">
              <span className="sband-ic" aria-hidden><LuHandshake /></span>
              <h3>Μακροχρόνια συνεργασία</h3>
              <p>Ένας σύμβουλος που γνωρίζει την επιχείρησή σας, τις επενδύσεις της και τα σχέδιά της — όχι κάθε φορά από την αρχή.</p>
            </article>
            <article className="sband-item c1 r">
              <span className="sband-ic" aria-hidden><LuLayers /></span>
              <h3>Όλα τα προγράμματα μαζί</h3>
              <p>ΕΣΠΑ, Αναπτυξιακός, LEADER: διαχειριζόμαστε παράλληλα όλα τα έργα σας, ώστε δαπάνες, όρια ενισχύσεων και προθεσμίες να μη συγκρούονται ποτέ.</p>
            </article>
            <article className="sband-item c2 r">
              <span className="sband-ic" aria-hidden><LuRadar /></span>
              <h3>Ευκαιρίες πριν ανοίξουν</h3>
              <p>Αφού έχουμε ήδη τα στοιχεία σας, κάθε νέο πρόγραμμα ελέγχεται αμέσως για εσάς. Σας ειδοποιούμε πρώτους και ο φάκελος είναι σχεδόν έτοιμος.</p>
            </article>
            <article className="sband-item c3 r">
              <span className="sband-ic" aria-hidden><LuMessagesSquare /></span>
              <h3>Παρακολούθηση 24/7</h3>
              <p>Πύλη πελατών με την πορεία κάθε έργου και ο ψηφιακός βοηθός Thanos, που απαντά για τα δικά σας έργα οποιαδήποτε ώρα.</p>
            </article>
          </div>

          <div className="svcm-journey r" aria-label="Ενδεικτική πορεία πελάτη">
            <div className="svcm-journey-head"><b>Ένας πελάτης, πολλά προγράμματα</b><span>Ενδεικτικό παράδειγμα</span></div>
            <ol>
              {JOURNEY.map(j => (
                <li key={j.year} className={j.tone}>
                  <span className="yr">{j.year}</span>
                  <span className="dot" aria-hidden />
                  <b>{j.title}</b>
                  <small>{j.note}</small>
                  <em>{j.state}</em>
                </li>
              ))}
            </ol>
          </div>
        </div>
      </section>

      {/* ── Τα στάδια κάθε έργου ── */}
      <section lang="el">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">01</span>Από την ιδέα στην εκταμίευση</span>
            <h2>Τι αναλαμβάνουμε σε κάθε έργο</h2>
          </div>
          <Stage idx="01" title="Σχεδιασμός επενδυτικού σχεδίου"
            text="Ξεκινάμε με δωρεάν έλεγχο επιλεξιμότητας και σχεδιάζουμε πρόταση που μεγιστοποιεί τη βαθμολογία — επιλέγοντας το σωστό πρόγραμμα ή συνδυασμό προγραμμάτων."
            items={['Έλεγχος ΚΑΔ, μεγέθους, περιοχής και προϋποθέσεων', 'Επιλογή προγράμματος ή συνδυασμού', 'Προϋπολογισμός ανά κατηγορία δαπάνης', 'Εκτίμηση βαθμολογίας πριν την υποβολή']}
            photo={wwaPageImage('svc-plan')} />
          <Stage idx="02" title="Σύνταξη και υποβολή φακέλου"
            text="Συλλέγουμε τα δικαιολογητικά με έξυπνο έλεγχο κάθε εγγράφου, συντάσσουμε την πρόταση σύμφωνα με την προκήρυξη και την υποβάλλουμε ηλεκτρονικά. Απαντάμε εμείς στους αξιολογητές."
            items={['Λίστα δικαιολογητικών με προθεσμίες', 'Τεχνική και οικονομική τεκμηρίωση', 'Ηλεκτρονική υποβολή και παρακολούθηση', 'Ενστάσεις όπου χρειάζεται']}
            photo={wwaPageImage('svc-submit')} />
          <Stage idx="03" title="Διαχείριση έως την εκταμίευση"
            text="Μετά την ένταξη διαχειριζόμαστε το έργο μέχρι την τελευταία πληρωμή — και συνεχίζουμε να παρακολουθούμε τις υποχρεώσεις που ακολουθούν."
            items={['Αίτημα προκαταβολής όπου προβλέπεται', 'Πιστοποιήσεις δαπανών και τροποποιήσεις', 'Προετοιμασία για τον επιτόπιο έλεγχο', 'Υποχρεώσεις μετά την ολοκλήρωση']}
            photo={wwaPageImage('svc-manage')} />
        </div>
      </section>

      {/* ── Thanos ── */}
      <section lang="el" className="alt">
        <div className="wrap svct">
          <div className="svct-copy r">
            <span className="eyebrow"><span className="idx">02</span>Ψηφιακός βοηθός</span>
            <h2>Thanos: απαντήσεις για το έργο σας, 24/7</h2>
            <p>Στην πύλη πελατών, ο Thanos γνωρίζει τα δικά σας έργα και απαντά αμέσως — ακόμα και Κυριακή βράδυ. Ό,τι χρειάζεται εμάς, το ετοιμάζει για να το εγκρίνετε με ένα κλικ.</p>
            <ul className="svct-list">
              <li><LuClock aria-hidden /><span><b>Τι εκκρεμεί και έως πότε</b> για κάθε έργο σας</span></li>
              <li><LuCalculator aria-hidden /><span><b>Αν μια δαπάνη επιδοτείται</b> πριν την πληρώσετε</span></li>
              <li><LuFileCheck aria-hidden /><span><b>Ποιο έγγραφο λείπει</b> και πώς το βρίσκετε</span></li>
              <li><LuMailCheck aria-hidden /><span><b>Μηνύματα προς τον λογιστή σας</b>, έτοιμα για αποστολή</span></li>
            </ul>
            <div className="svct-acts"><Button href="/pyli-pelaton">Δείτε την πύλη πελατών</Button></div>
          </div>
          <div className="svct-demo r"><ShowAssistant /></div>
        </div>
      </section>

      {/* ── Αμοιβή ── */}
      <section lang="el">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">03</span>Αμοιβή</span><h2>Πληρώνετε όταν εγκριθεί το έργο σας</h2><p>Η αρχική αξιολόγηση είναι δωρεάν. Η αμοιβή σύνταξης συνδέεται με την έγκριση και είναι επιλέξιμη δαπάνη στα περισσότερα προγράμματα.</p></div>
          <div className="pkgs">
            <article className="pkg"><div className="name">Αξιολόγηση</div><div className="amt">Δωρεάν<small>απάντηση σε 1 εργάσιμη</small></div><ul><li><IconCheck />Έλεγχος επιλεξιμότητας</li><li><IconCheck />Εκτίμηση βαθμολογίας</li><li><IconCheck />Πρόταση προγραμμάτων</li></ul><EligibilityCta className="btn-outline">Ζητήστε αξιολόγηση</EligibilityCta></article>
            <article className="pkg featured"><span className="tag">Το πιο συνηθισμένο</span><div className="name">Σύνταξη &amp; υποβολή</div><div className="amt">Αμοιβή επιτυχίας<small>πληρωμή μετά την έγκριση</small></div><ul><li><IconCheck />Επενδυτικό σχέδιο</li><li><IconCheck />Δικαιολογητικά και υποβολή</li><li><IconCheck />Διευκρινίσεις και ενστάσεις</li></ul><EligibilityCta>Ξεκινήστε τον φάκελο</EligibilityCta></article>
            <article className="pkg"><div className="name">Μακροχρόνια συνεργασία</div><div className="amt">Όλα τα έργα σας<small>διαχείριση & νέες ευκαιρίες</small></div><ul><li><IconCheck />Διαχείριση έως την εκταμίευση</li><li><IconCheck />Ειδοποίηση για κάθε νέο πρόγραμμα</li><li><IconCheck />Πύλη πελατών & Thanos 24/7</li></ul><Button href="/epikoinonia" variant="outline">Ζητήστε προσφορά</Button></article>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="04" subtitle="Οι πιο συχνές ερωτήσεις για τη συνεργασία μαζί μας." />
    </>
  )
}
