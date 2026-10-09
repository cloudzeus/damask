import type { Metadata } from 'next'
import Link from 'next/link'
import { LuRoute, LuShieldCheck, LuSparkles, LuBellRing, LuUsers, LuFolderLock, LuCompass, LuMoonStar } from 'react-icons/lu'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Faq } from '../_components/faq'
import { JsonLd, breadcrumbJsonLd } from '../_components/json-ld'
import { wwaPhoto } from '../_wwa/assets'
import { Pic } from '../_components/pic'
import { ShowDashboard, ShowJourney, ShowDocCheck, ShowAssistant, ShowWizard, ShowOpportunity } from '../_components/portal-showcase'

export const metadata: Metadata = {
  title: 'Πύλη Πελατών WWA: το έργο ΕΣΠΑ σας, 24/7',
  description: 'Δείτε πού βρίσκεται το έργο σας, ανεβάστε δικαιολογητικά με έξυπνο έλεγχο και ρωτήστε τον ψηφιακό βοηθό οποιαδήποτε ώρα. Αποκλειστικά για πελάτες της WWA.',
  alternates: { canonical: '/pyli-pelaton' },
}

const FAQS = [
  { q: 'Τι είναι η Πύλη Πελατών της WWA;', a: 'Ένας προσωπικός χώρος για κάθε επιχείρηση-πελάτη: βλέπετε πού βρίσκεται κάθε έργο ΕΣΠΑ, τι χρειάζεται από εσάς, τα ποσά και τις πληρωμές, τα δικαιολογητικά σας και έχετε ψηφιακό βοηθό διαθέσιμο 24 ώρες το 24ωρο.' },
  { q: 'Κοστίζει κάτι η πύλη;', a: 'Όχι. Περιλαμβάνεται σε κάθε συνεργασία με τη WWA, για όλη τη διάρκεια του έργου — από την αξιολόγηση μέχρι την εκταμίευση και μετά.' },
  { q: 'Μπορεί να έχει πρόσβαση και ο λογιστής μου;', a: 'Ναι. Ορίζετε τον λογιστή και τον υπεύθυνο έργου της επιχείρησής σας και καθένας λαμβάνει ό,τι τον αφορά — με δική του πρόσβαση, αν το θέλετε.' },
  { q: 'Τι κάνει ο ψηφιακός βοηθός;', a: 'Απαντά σε απλά ελληνικά, με κείμενο ή φωνή, για τα έργα σας: αν μια αγορά επιδοτείται, τι εκκρεμεί, τι ακολουθεί. Ετοιμάζει και αιτήματα — π.χ. σύνδεσμο για τον λογιστή σας — που στέλνονται μόνο όταν το εγκρίνετε εσείς.' },
  { q: 'Είναι ασφαλή τα έγγραφά μου;', a: 'Τα έγγραφα φυλάσσονται σε κρυπτογραφημένο, ιδιωτικό αρχείο και τα βλέπουν μόνο εσείς, τα άτομα που ορίζετε και ο σύμβουλός σας.' },
]

const FEATURES = [
  { icon: LuRoute, t: 'Το έργο σας, βήμα-βήμα', d: 'Έξι απλά στάδια, από την αξιολόγηση μέχρι την εκταμίευση. Πάντα ξέρετε πού βρίσκεστε και τι ακολουθεί.' },
  { icon: LuShieldCheck, t: 'Έξυπνος έλεγχος εγγράφων', d: 'Κάθε έγγραφο ελέγχεται τη στιγμή που ανεβαίνει. Λάθος αρχείο; Το μαθαίνετε αμέσως — όχι μετά από εβδομάδες.' },
  { icon: LuSparkles, t: 'Ψηφιακός βοηθός 24/7', d: 'Ρωτήστε οτιδήποτε, οποιαδήποτε ώρα, με κείμενο ή φωνή. Απαντά για το δικό σας έργο, σε απλά ελληνικά.' },
  { icon: LuCompass, t: 'Οδηγοί βήμα-βήμα', d: 'Πώς κάνω μια αγορά σωστά; Πώς προετοιμάζομαι για έλεγχο; Καθοδήγηση με απλά βήματα για κάθε διαδικασία.' },
  { icon: LuBellRing, t: 'Ειδοποιήσεις τη σωστή στιγμή', d: 'Προθεσμίες, έγγραφα που λήγουν, πληρωμές που εγκρίθηκαν — μαθαίνετε ό,τι μετράει, χωρίς να ψάχνετε.' },
  { icon: LuUsers, t: 'Η ομάδα σας μαζί', d: 'Ο λογιστής και ο υπεύθυνος έργου λαμβάνουν ό,τι τους αφορά. Τέλος στα «ποιος το έχει;».' },
  { icon: LuFolderLock, t: 'Όλα τα δικαιολογητικά σε ένα σημείο', d: 'Ό,τι ισχύει χρησιμοποιείται σε κάθε νέο πρόγραμμα — δεν σας το ξαναζητάμε.' },
  { icon: LuMoonStar, t: 'Νέες ευκαιρίες για εσάς', d: 'Μόλις ανοίξει πρόγραμμα που ταιριάζει στην επιχείρησή σας, το βλέπετε πρώτοι — με ένα «Ενδιαφέρομαι».' },
]

function Row({ idx, eyebrow, title, text, points, children, flip }: { idx: string; eyebrow: string; title: string; text: string; points: string[]; children: React.ReactNode; flip?: boolean }) {
  return (
    <article className={`pv-row r${flip ? ' flip' : ''}`}>
      <div className="pv-copy">
        <span className="eyebrow"><span className="idx">{idx}</span>{eyebrow}</span>
        <h2>{title}</h2>
        <p>{text}</p>
        <ul>{points.map(p => <li key={p}>{p}</li>)}</ul>
      </div>
      <div className="pv-shot">{children}</div>
    </article>
  )
}

export default function CustomerPortalPage() {
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'Πύλη πελατών' }])} />
      <SubBanner image={wwaPhoto('team')} crumbs={[{ label: 'Πύλη πελατών' }]} title="Η Πύλη Πελατών της WWA"
        sub={<>Το έργο σας ΕΣΠΑ, <span style={{ color: 'var(--wwa-cyan-400)' }}>24 ώρες το 24ωρο</span></>}
        lead="Δείτε πού βρίσκεται κάθε έργο, ανεβάστε δικαιολογητικά με έξυπνο έλεγχο και ρωτήστε τον ψηφιακό σας βοηθό — οποιαδήποτε ώρα, από υπολογιστή ή κινητό."
        meta={<><EligibilityCta size="lg">Γίνετε πελάτης</EligibilityCta><Link className="pill" href="/portal/syndesi">Σύνδεση πελατών →</Link></>} />

      <section lang="el">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">01</span>Γιατί είναι διαφορετικό</span>
            <h2>Τέλος στα «πού είναι ο φάκελός μου;»</h2>
            <p>Οι περισσότεροι σύμβουλοι σάς ενημερώνουν όταν τους τηλεφωνήσετε. Εμείς σας δίνουμε το έργο σας στην οθόνη σας — ζωντανά, κάθε στιγμή.</p>
          </div>
          <div className="pv-features">
            {FEATURES.map(f => <div key={f.t} className="pv-feature r"><f.icon aria-hidden /><h3>{f.t}</h3><p>{f.d}</p></div>)}
          </div>
        </div>
      </section>

      <section lang="el" className="alt">
        <div className="wrap pv-rows">
          <Row idx="02" eyebrow="Επισκόπηση" title="Όλα τα έργα σας με μια ματιά"
            text="Η πρώτη οθόνη σας λέει ό,τι χρειάζεται να ξέρετε σήμερα: τι περιμένουμε από εσάς, τι λήγει, τι πληρώθηκε."
            points={['Ειδοποιήσεις με προτεραιότητα — τα επείγοντα πρώτα', 'Ποσά, δόσεις και εισπράξεις σε πραγματικό χρόνο', 'Ιδανικό για επιχειρήσεις με πολλά έργα']}>
            <ShowDashboard />
          </Row>
          <Row idx="03" eyebrow="Πορεία έργου" title="Ξέρετε πάντα πού βρίσκεστε — και τι ακολουθεί" flip
            text="Κάθε έργο σε έξι κατανοητά βήματα, με απλή εξήγηση για το τώρα και το επόμενο. Χωρίς ορολογία, χωρίς αναμονή."
            points={['Προϋπολογισμός, επιδότηση και πρόοδος δαπανών', 'Προθεσμίες και ημερομηνίες σε ένα σημείο', 'Ο σύμβουλός σας ένα κλικ μακριά']}>
            <ShowJourney />
          </Row>
          <Row idx="04" eyebrow="Έξυπνος έλεγχος" title="Το σωστό έγγραφο, με την πρώτη"
            text="Κάθε αρχείο ελέγχεται τη στιγμή που το ανεβάζετε — εσείς ή ο λογιστής σας. Αν δεν είναι αυτό που ζητήσαμε, το μαθαίνετε αμέσως, με εξήγηση για το σωστό."
            points={['Ελέγχει τι έγγραφο είναι και αν αφορά την επιχείρησή σας', 'Εντοπίζει ληγμένα έγγραφα πριν γίνουν πρόβλημα', 'Λιγότερα «πήγαινε-έλα», ταχύτερες εγκρίσεις']}>
            <ShowDocCheck />
          </Row>
          <Row idx="05" eyebrow="Ψηφιακός βοηθός" title="Ένας ειδικός στο πλευρό σας, 24/7" flip
            text="Είναι 11 το βράδυ και σκέφτεστε μια αγορά; Ρωτήστε. Ο ψηφιακός βοηθός της WWA ξέρει το δικό σας έργο και απαντά αμέσως, με κείμενο ή φωνή."
            points={['«Επιδοτείται αυτή η αγορά;» — απάντηση σε δευτερόλεπτα', 'Ετοιμάζει αιτήματα για τον λογιστή σας με ένα μήνυμα', 'Τίποτα δεν στέλνεται χωρίς τη δική σας έγκριση']}>
            <ShowAssistant />
          </Row>
          <Row idx="06" eyebrow="Οδηγοί" title="Καθοδήγηση βήμα-βήμα σε κάθε διαδικασία"
            text="Από τη σωστή αγορά μέχρι τον επιτόπιο έλεγχο: οδηγοί που σας παίρνουν από το χέρι, με απλές εξηγήσεις και πρακτικές συμβουλές."
            points={['Οδηγός για το δικό σας έργο, από το στάδιο που βρίσκεστε', 'Λίστες ελέγχου για να μην ξεχάσετε τίποτα', 'Διαθέσιμοι όποτε τους χρειαστείτε']}>
            <ShowWizard />
          </Row>
          <Row idx="07" eyebrow="Ευκαιρίες" title="Το επόμενο πρόγραμμα σας βρίσκει πρώτο" flip
            text="Όταν ανοίγει πρόγραμμα που ταιριάζει στην επιχείρησή σας, εμφανίζεται στην πύλη σας. Ένα κλικ στο «Ενδιαφέρομαι» και ο σύμβουλός σας αναλαμβάνει."
            points={['Εξατομικευμένες προτάσεις για τη δική σας επιχείρηση', 'Χωρίς να ψάχνετε σε ανακοινώσεις και προσκλήσεις', 'Πρώτοι στην υποβολή, πρώτοι στην έγκριση']}>
            <ShowOpportunity />
          </Row>
          <p className="pv-note r">Οι οθόνες είναι ενδεικτικές, με υποθετικά στοιχεία.</p>
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div className="promo r">
            <div className="photo"><Pic src={wwaPhoto('consulting')} sizes="(min-width: 1024px) 50vw, 100vw" loading="lazy" /></div>
            <div className="txt">
              <span className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}><span className="idx" style={{ color: 'var(--wwa-cyan-400)' }}>08</span>Ξεκινήστε</span>
              <h2>Αποκτήστε τη δική σας πύλη</h2>
              <p>Η Πύλη Πελατών περιλαμβάνεται σε κάθε συνεργασία με τη WWA, χωρίς επιπλέον κόστος. Ξεκινήστε με τον δωρεάν έλεγχο επιλεξιμότητας — απάντηση σε μία εργάσιμη.</p>
              <div className="actions"><EligibilityCta size="lg" variant="inverse">Δείτε αν δικαιούστε</EligibilityCta><Link href="/portal/syndesi" className="btn btn-inverse-outline btn-lg">Είμαι ήδη πελάτης</Link></div>
            </div>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="09" title="Πύλη πελατών: συχνές ερωτήσεις" />
    </>
  )
}
