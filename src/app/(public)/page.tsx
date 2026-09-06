/* eslint-disable @next/next/no-img-element -- public site φωτογραφίες με object-fit cover· next/image δεν ταιριάζει με .photo/.media */
import type { Metadata } from 'next'
import Link from 'next/link'
import { Button } from './_components/button'
import { Badge } from './_components/badge'
import { ProgramCard, type ProgramCardData } from './_components/program-card'
import { Faq, type FaqItem } from './_components/faq'
import { EligibilityCta } from './_components/eligibility-cta'
import { wwaPhoto } from './_wwa/assets'
import { listPublicPrograms } from '@/lib/programs/public'

export const metadata: Metadata = {
  title: 'World Wide Associates — Σύμβουλοι ΕΣΠΑ & Ευρωπαϊκών Προγραμμάτων',
  description:
    'Δωρεάν έλεγχος επιλεξιμότητας ΕΣΠΑ σε μία εργάσιμη. 2.500+ εγκεκριμένα επενδυτικά σχέδια, εγκρίσεις 98–100%. Σχεδιασμός, υποβολή και διαχείριση φακέλου μέχρι την εκταμίευση.',
}

const FALLBACK_PROGRAMS: ProgramCardData[] = [
  {
    image: wwaPhoto('startup'), title: 'Ξεκινώ Επιχειρηματικά 2026',
    description: 'Για πτυχιούχους που ιδρύουν επιχείρηση στο αντικείμενο των σπουδών τους. Εξοπλισμός, λειτουργικά, μισθολογικό κόστος.',
    budget: 'έως €36.000', rate: 'έως 100%', deadline: '31/10/2026', region: 'Όλη η Ελλάδα', status: 'active', isNew: true,
  },
  {
    image: wwaPhoto('manufacturing'), title: 'Παράγουμε στην Ελλάδα',
    description: 'Ενίσχυση της παραγωγικής βάσης και της διεθνούς ανταγωνιστικότητας μεταποιητικών ΜμΕ.',
    budget: 'έως €1.000.000', rate: '45–60%', deadline: '15/12/2026', region: 'Όλη η Ελλάδα', status: 'active',
  },
  {
    image: wwaPhoto('hotel'), title: 'Κοινωνική Επιχειρηματικότητα — Ιόνια Νησιά',
    description: 'Ενίσχυση φορέων κοινωνικής και αλληλέγγυας οικονομίας στην Περιφέρεια Ιονίων Νήσων.',
    budget: null, rate: 'έως 100%', deadline: '30/11/2026', region: 'Ιόνια Νησιά', status: 'active',
  },
]

const FAQS: FaqItem[] = [
  { q: 'Τι είναι το ΕΣΠΑ και ποιος δικαιούται επιδότηση;', a: 'Το ΕΣΠΑ 2021–2027 είναι το βασικό πλαίσιο ευρωπαϊκής χρηματοδότησης για την Ελλάδα. Επιδότηση μπορούν να λάβουν υφιστάμενες και υπό ίδρυση επιχειρήσεις, ανάλογα με τους όρους κάθε προκήρυξης: μέγεθος, ΚΑΔ, περιφέρεια, έτη λειτουργίας και ύψος επένδυσης.' },
  { q: 'Πώς μαθαίνω αν η επιχείρησή μου είναι επιλέξιμη;', a: 'Με τον δωρεάν έλεγχο επιλεξιμότητας της WWA. Στέλνετε επωνυμία, ΚΑΔ, έτος έναρξης και περιοχή και σε μία εργάσιμη σας λέμε ποια προγράμματα σας αφορούν και με τι ποσοστό ενίσχυσης.' },
  { q: 'Πόσο κοστίζει η συνεργασία με σύμβουλο ΕΣΠΑ;', a: 'Στη WWA ο έλεγχος επιλεξιμότητας είναι δωρεάν και η αμοιβή σύνταξης είναι αμοιβή επιτυχίας: πληρώνεται μετά την έγκριση. Στα περισσότερα προγράμματα η αμοιβή του συμβούλου είναι επιλέξιμη δαπάνη.' },
  { q: 'Πόσο διαρκεί η διαδικασία από την αίτηση μέχρι την εκταμίευση;', a: 'Η προετοιμασία του φακέλου χρειάζεται 2–4 εβδομάδες, η αξιολόγηση από τον φορέα 3–6 μήνες και η υλοποίηση 12–24 μήνες ανάλογα με το πρόγραμμα. Προκαταβολή έως 40% δίνεται με εγγυητική επιστολή μετά την ένταξη.' },
  { q: 'Ποιο είναι το ποσοστό εγκρίσεων της WWA;', a: 'Κινείται σταθερά στο 98–100%, με περισσότερα από 2.500 εγκεκριμένα επενδυτικά σχέδια σε τρεις προγραμματικές περιόδους ΕΣΠΑ. Αναλαμβάνουμε μόνο σχέδια που μπορούν να εγκριθούν.' },
]

const check = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
)

export default async function HomePage() {
  const active = await listPublicPrograms()
  const programCards: ProgramCardData[] = active.length
    ? active.slice(0, 3).map((p, i) => ({
        image: p.image, title: p.title, description: p.summary, budget: p.budget, rate: p.rate,
        deadline: p.deadline ?? undefined, deadlineOpen: p.deadlineOpen, region: p.region ?? undefined,
        status: 'active' as const, isNew: i === 0, href: `/programmata/${p.slug}`,
      }))
    : FALLBACK_PROGRAMS
  const featured = active[0] ?? null
  const heroDeadline = featured
    ? (featured.deadline ? `υποβολές έως ${featured.deadline}` : featured.deadlineOpen ? 'ανοιχτή πρόσκληση' : 'ενεργό πρόγραμμα')
    : null
  return (
    <>
      {/* HERO */}
      <section lang="el" className="hero" id="top">
        <div className="banner">
          <img src={featured?.image || wwaPhoto('consulting')} alt="" />
          {featured ? (
            <div className="wrap"><div className="content">
              <span className="tag">Πιο πρόσφατο πρόγραμμα · {heroDeadline}</span>
              <h1 data-typewrite>{featured.heroTitle} <span style={{ color: 'var(--wwa-cyan-400)' }}>{featured.heroAmount}</span></h1>
              <p>{featured.heroSubtitle}</p>
              <div className="actions">
                <EligibilityCta size="lg">Δείτε αν δικαιούστε</EligibilityCta>
                <Button href={`/programmata/${featured.slug}`} size="lg" variant="inverse-outline">Δείτε το πρόγραμμα</Button>
              </div>
            </div></div>
          ) : (
            <div className="wrap"><div className="content">
              <span className="tag">Ξεκινώ Επιχειρηματικά 2026 · υποβολές έως 31/10/2026</span>
              <h1 data-typewrite>Επιδότηση έως <span style={{ color: 'var(--wwa-cyan-400)' }}>€36.000</span> για τη νέα σας επιχείρηση</h1>
              <p>100% ενίσχυση για πτυχιούχους που ιδρύουν επιχείρηση στο αντικείμενο των σπουδών τους. Ελέγχουμε δωρεάν αν δικαιούστε — απάντηση σε μία εργάσιμη.</p>
              <div className="actions">
                <EligibilityCta size="lg">Δείτε αν δικαιούστε</EligibilityCta>
                <Button href="/programmata" size="lg" variant="inverse-outline">Όλα τα προγράμματα</Button>
              </div>
            </div></div>
          )}
          <div className="dots"><span className="on" /><span /><span /></div>
        </div>
        <div className="strip"><div className="wrap">
          <div className="item">{check}<div><b>2.500+ επενδυτικά σχέδια</b><span>με εγκρίσεις 98–100%</span></div></div>
          <div className="item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10" /><path d="M12 6v6l4 2" /></svg><div><b>Απάντηση σε 1 εργάσιμη</b><span>δωρεάν έλεγχος επιλεξιμότητας</span></div></div>
          <div className="item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10" /></svg><div><b>Αμοιβή επιτυχίας</b><span>πληρώνετε μετά την έγκριση</span></div></div>
          <div className="item"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M22 10v6M2 10l10-5 10 5-10 5z" /><path d="M6 12v5c3 3 9 3 12 0v-5" /></svg><div><b>Σύμβουλοι ΣΕΔΕ</b><span>μέλη ΣΥ.Σ.ΕΠ., GR.EC.A, BNI</span></div></div>
        </div></div>
      </section>

      {/* PROGRAMS */}
      <section lang="el" className="programs alt" id="programs">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">01</span>Προγράμματα ΕΣΠΑ 2021–2027</span><h2>Ενεργές προκηρύξεις αυτή τη στιγμή</h2><p>Επιλέξτε το πρόγραμμα που σας αφορά και δείτε σε λίγα λεπτά αν η επιχείρησή σας είναι επιλέξιμη.</p></div>
          <div className="toolbar r">
            <button className="chip" aria-pressed="true">Όλα</button>
            <button className="chip">Νέες επιχειρήσεις</button>
            <button className="chip">Μικρομεσαίες</button>
            <button className="chip">Τουρισμός</button>
            <button className="chip">Ψηφιακός μετασχηματισμός</button>
            <button className="chip">Πράσινη μετάβαση</button>
          </div>
          <div className="cards3">
            {programCards.map(p => <ProgramCard key={p.href ?? p.title} {...p} />)}
          </div>
          <div className="sec-foot r"><Button href="/programmata" variant="outline">Όλα τα προγράμματα — ενεργά, σε υλοποίηση, ολοκληρωμένα</Button></div>
        </div>
      </section>

      {/* SERVICES */}
      <section lang="el" className="services" id="services">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">02</span>Υπηρεσίες</span><h2>Ολοκληρωμένη υποστήριξη σε τρία στάδια</h2><p>Μία ομάδα αναλαμβάνει το έργο σας από την ιδέα μέχρι την εκταμίευση. Δεν χρειάζεται να συντονίσετε λογιστή, μηχανικό και σύμβουλο — το κάνουμε εμείς.</p></div>
          <div className="cards3">
            <article className="service r"><div className="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg></div><h3>Σχεδιασμός επενδυτικού σχεδίου</h3><p>Αναλύουμε τις ανάγκες της επιχείρησής σας και σχεδιάζουμε επενδυτική πρόταση που ταιριάζει στις απαιτήσεις του κατάλληλου προγράμματος.</p><Button href="/#services" variant="link">Πώς αξιολογούμε</Button></article>
            <article className="service r"><div className="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M16 13H8M16 17H8M10 9H8" /></svg></div><h3>Σύνταξη και υποβολή φακέλου</h3><p>Πλήρης προετοιμασία της αίτησης σύμφωνα με τις προδιαγραφές της προκήρυξης, ηλεκτρονική υποβολή και παρακολούθηση της αξιολόγησης.</p><Button href="/#services" variant="link">Τι περιλαμβάνει ο φάκελος</Button></article>
            <article className="service r"><div className="icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="m19 9-5 5-4-4-3 3" /></svg></div><h3>Διαχείριση και παρακολούθηση</h3><p>Υποστήριξη στην υλοποίηση, αιτήματα τροποποίησης, πιστοποιήσεις δαπανών, μέχρι την ολοκλήρωση και την εκταμίευση της επιδότησης.</p><Button href="/#services" variant="link">Η διαδικασία εκταμίευσης</Button></article>
          </div>
        </div>
      </section>

      {/* STATS */}
      <section lang="el" className="stats alt">
        <div className="wrap">
          <div className="stat r"><div className="value" data-count="2500" data-suffix="+">2.500+</div><div className="label">επενδυτικά σχέδια με έγκριση</div></div>
          <div className="stat accent r"><div className="value">98–100%</div><div className="label">ποσοστό εγκρίσεων</div></div>
          <div className="stat r"><div className="value" data-count="30" data-suffix="+">30+</div><div className="label">προγράμματα σε υλοποίηση ή ολοκληρωμένα</div></div>
          <div className="stat r"><div className="value">6</div><div className="label">κλαδικοί φορείς — σύμβουλοι ή μέλη</div></div>
        </div>
      </section>

      {/* COMPANY / PROMO */}
      <section lang="el" className="company" id="company">
        <div className="wrap">
          <div className="promo r">
            <div className="photo square"><img src={wwaPhoto('team')} alt="Η ομάδα σε επιχείρηση-πελάτη" /></div>
            <div className="txt">
              <span className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}><span className="idx" style={{ color: 'var(--wwa-cyan-400)' }}>03</span>Η εταιρεία</span>
              <h2>Γιατί οι επιχειρήσεις μάς εμπιστεύονται ξανά</h2>
              <p>Η World Wide Associates Ε.Ε. λειτουργεί από την Αθήνα με πελάτες σε όλη την Ελλάδα. Διαφάνεια, αξιοπιστία και αποτελεσματικότητα σε κάθε στάδιο.</p>
              <ul>
                <li>{check}Αναλαμβάνουμε μόνο σχέδια που μπορούν να εγκριθούν — αν δεν είστε επιλέξιμοι, θα σας το πούμε στην πρώτη επικοινωνία.</li>
                <li>{check}Ο ίδιος σύμβουλος σας συνοδεύει από την αξιολόγηση μέχρι την εκταμίευση.</li>
                <li>{check}Σύμβουλοι του ΣΕΔΕ και μέλη σε ΣΥ.Σ.ΕΠ., GR.EC.A, ΠΣΒΑΚ και BNI Greece.</li>
              </ul>
              <div className="actions"><Button href="/#company" variant="inverse">Η εταιρεία</Button><Button href="/#company" variant="inverse-outline">Πελάτες</Button></div>
            </div>
          </div>
        </div>
      </section>

      {/* PROCESS */}
      <section lang="el" className="process alt">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">04</span>Πώς δουλεύουμε</span><h2>Τέσσερα βήματα, μία υπεύθυνη ομάδα</h2><p>Δεν ξεκινάμε φάκελο πριν βεβαιωθούμε ότι η επιχείρηση είναι επιλέξιμη και ότι το σχέδιο μπορεί να εγκριθεί.</p></div>
          <div className="steps">
            <article className="r"><h3>Αξιολόγηση επιλεξιμότητας</h3><p>Δωρεάν, εντός μίας εργάσιμης. Ελέγχουμε επιχείρηση, ΚΑΔ, μέγεθος, περιοχή και ώριμες δράσεις.</p></article>
            <article className="r"><h3>Επενδυτικό σχέδιο</h3><p>Διαμορφώνουμε προϋπολογισμό, χρονοδιάγραμμα και τεκμηρίωση που μεγιστοποιεί τη βαθμολογία.</p></article>
            <article className="r"><h3>Υποβολή και αξιολόγηση</h3><p>Ηλεκτρονική υποβολή στο ΟΠΣΚΕ, απάντηση σε διευκρινίσεις, παρακολούθηση μέχρι την απόφαση ένταξης.</p></article>
            <article className="r"><h3>Υλοποίηση και εκταμίευση</h3><p>Διαχείριση τροποποιήσεων, πιστοποίηση δαπανών, αίτημα τελικής επαλήθευσης και εκταμίευση.</p></article>
          </div>
        </div>
      </section>

      {/* NEWS */}
      <section lang="el" className="news alt" id="news">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">05</span>Νέα &amp; προκηρύξεις</span><h2>Τι αλλάζει αυτόν τον μήνα</h2></div>
          <div className="cards3">
            <article className="card card-hover ncard r"><div className="media"><img src={wwaPhoto('ecommerce')} alt="" /></div><div className="body"><div className="date"><Badge variant="upcoming">Αναμένεται</Badge>04/09/2026</div><h3><Link href="/#news">Ψηφιακός Μετασχηματισμός ΜμΕ: τι φέρνει ο νέος κύκλος</Link></h3><p>Τρεις δράσεις (βασικός, προηγμένος, αιχμής) με νέες προϋποθέσεις για λογισμικό και υπηρεσίες cloud.</p></div></article>
            <article className="card card-hover ncard r"><div className="media"><img src={wwaPhoto('cosmetics')} alt="" /></div><div className="body"><div className="date"><Badge variant="active">Ενεργό</Badge>28/08/2026</div><h3><Link href="/#news">Παράγουμε στην Ελλάδα: οδηγός επιλέξιμων δαπανών</Link></h3><p>Τι καλύπτεται σε μηχανήματα, κτιριακά, πιστοποιήσεις και τι εξαιρείται ρητά από την προκήρυξη.</p></div></article>
            <article className="card card-hover ncard r"><div className="media"><img src={wwaPhoto('hotel')} alt="" /></div><div className="body"><div className="date"><Badge variant="running">Σε υλοποίηση</Badge>19/08/2026</div><h3><Link href="/#news">Πράσινη Παραγωγική Επένδυση: προθεσμίες ολοκλήρωσης</Link></h3><p>Παράταση 6 μηνών για την ολοκλήρωση φυσικού και οικονομικού αντικειμένου.</p></div></article>
          </div>
          <div className="sec-foot r"><Button href="/#news" variant="outline">Όλα τα νέα</Button></div>
        </div>
      </section>

      {/* AFFILIATIONS */}
      <div className="aff" lang="el">
        <div className="wrap"><span className="lab">Σύμβουλοι και μέλη</span><div className="logo-strip"><span>ΣΕΔΕ</span><span>ΣΥ.Σ.ΕΠ.</span><span>GR.EC.A</span><span>ΠΣΒΑΚ</span><span>BNI Greece</span><span>Entersoftone</span></div></div>
      </div>

      {/* FAQ */}
      <Faq items={FAQS} idx="06" subtitle="Απαντήσεις στα πιο συχνά ερωτήματα — όπως τα απαντάμε και στο τηλέφωνο." />

      {/* CONTACT */}
      <section lang="el" className="contact" id="contact">
        <div className="wrap"><div className="box">
          <div className="r">
            <span className="eyebrow" style={{ color: 'rgba(255,255,255,.7)' }}><span className="idx" style={{ color: 'var(--wwa-cyan-400)' }}>07</span>Δωρεάν αξιολόγηση</span>
            <h2 style={{ marginTop: 12 }}>Μάθετε σε μία εργάσιμη αν δικαιούστε επιδότηση</h2>
            <p>Συμπληρώστε τα βασικά στοιχεία της επιχείρησής σας στον δωρεάν έλεγχο επιλεξιμότητας. Θα σας απαντήσουμε με τα προγράμματα που σας αφορούν και το ποσοστό ενίσχυσης.</p>
            <div className="lines">
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.34 1.85.57 2.81.7A2 2 0 0 1 22 16.92z" /></svg><a href="tel:+302107218758">210 721 8758</a></div>
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><rect width="20" height="16" x="2" y="4" rx="2" /><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" /></svg><a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a></div>
              <div><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 0 1 16 0Z" /><circle cx="12" cy="10" r="3" /></svg><span>Αλεξανδρουπόλεως 25, Αθήνα 115 27</span></div>
            </div>
          </div>
          <div className="r" style={{ background: '#fff', color: 'var(--fg-1)', padding: 32, borderRadius: 'var(--radius-xl)', boxShadow: 'var(--elev-3)', display: 'grid', gap: 16, alignContent: 'start' }}>
            <h3 style={{ fontSize: 20 }}>Ξεκινήστε τον δωρεάν έλεγχο</h3>
            <p style={{ color: 'var(--fg-2)', fontSize: 15 }}>Χρειαζόμαστε μόνο ΑΦΜ, email και τηλέφωνο. Επιβεβαιώνετε με έναν κωδικό μιας χρήσης και βλέπετε αμέσως τα προγράμματα που σας αφορούν.</p>
            <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: 10, fontSize: 15, color: 'var(--fg-1)' }}>
              <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ color: 'var(--brand)', flex: 'none', width: 20, height: 20 }}>{check}</span>Απάντηση σε μία εργάσιμη</li>
              <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ color: 'var(--brand)', flex: 'none', width: 20, height: 20 }}>{check}</span>Χωρίς χρέωση — αμοιβή επιτυχίας</li>
              <li style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}><span style={{ color: 'var(--brand)', flex: 'none', width: 20, height: 20 }}>{check}</span>Τα στοιχεία σας δεν κοινοποιούνται σε τρίτους</li>
            </ul>
            <EligibilityCta size="lg">Ζητήστε αξιολόγηση</EligibilityCta>
          </div>
        </div></div>
      </section>
    </>
  )
}
