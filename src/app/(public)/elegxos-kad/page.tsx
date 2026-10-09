import type { Metadata } from 'next'
import Link from 'next/link'
import { LuFileSearch, LuMapPin, LuUsers, LuCalendarRange, LuLayers } from 'react-icons/lu'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { JsonLd, breadcrumbJsonLd } from '../_components/json-ld'
import { Faq, type FaqItem } from '../_components/faq'
import { NotifyBanner } from '../_components/notify-banner'
import { wwaPhoto } from '../_wwa/assets'
import { absoluteUrl } from '@/lib/site-url'
import { KadTool } from './kad-tool'

export const metadata: Metadata = {
  title: 'Έλεγχος ΚΑΔ για ΕΣΠΑ: είναι επιλέξιμη η επιχείρησή μου;',
  description: 'Δείτε αν ο ΚΑΔ σας είναι επιλέξιμος στα ενεργά προγράμματα ΕΣΠΑ — και κάντε δωρεάν τον πλήρη έλεγχο με ΑΦΜ: όλοι οι ΚΑΔ, περιφέρεια, μέγεθος και έτη λειτουργίας αυτόματα.',
  alternates: { canonical: '/elegxos-kad' },
}

const FAQS: FaqItem[] = [
  { q: 'Πώς βρίσκω τον ΚΑΔ της επιχείρησής μου;', a: 'Οι ΚΑΔ εμφανίζονται στο Taxisnet (Στοιχεία Μητρώου), στο πιστοποιητικό του ΓΕΜΗ και στη βεβαίωση έναρξης δραστηριότητας. Με τον δωρεάν έλεγχο της WWA δεν χρειάζεται να τους ψάξετε: με τον ΑΦΜ τους αντλούμε αυτόματα από την ΑΑΔΕ.' },
  { q: 'Μετράει μόνο ο κύριος ΚΑΔ ή και οι δευτερεύοντες;', a: 'Εξαρτάται από το πρόγραμμα. Συνήθως η επένδυση πρέπει να αφορά επιλέξιμο ΚΑΔ, κύριο ή δευτερεύοντα, που να είναι ενεργός πριν την υποβολή. Ο πλήρης έλεγχος με ΑΦΜ εξετάζει όλους τους ΚΑΔ σας ταυτόχρονα.' },
  { q: 'Αν ο ΚΑΔ μου δεν είναι επιλέξιμος, τι κάνω;', a: 'Σε πολλές περιπτώσεις μπορεί να προστεθεί νέος ΚΑΔ στην εφορία πριν την υποβολή, εφόσον αντιστοιχεί σε πραγματική δραστηριότητα της επένδυσης. Ορισμένα προγράμματα ζητούν να έχει προστεθεί πριν από συγκεκριμένη ημερομηνία — γι’ αυτό ο έλεγχος γίνεται έγκαιρα.' },
  { q: 'Αρκεί ένας επιλέξιμος ΚΑΔ για να ενταχθώ;', a: 'Όχι. Ο ΚΑΔ είναι το πρώτο κριτήριο· ελέγχονται επίσης η περιφέρεια της επένδυσης, το μέγεθος της επιχείρησης, τα έτη λειτουργίας, οι ενισχύσεις de minimis και η νομική μορφή. Ο έλεγχος με ΑΦΜ τα εξετάζει όλα μαζί.' },
  { q: 'Πόσο κοστίζει ο έλεγχος;', a: 'Είναι δωρεάν και χωρίς δέσμευση. Χρειάζεται μόνο ΑΦΜ, email και τηλέφωνο· επιβεβαιώνετε με κωδικό μιας χρήσης και βλέπετε αμέσως τα προγράμματα που σας αφορούν.' },
]

const WHY = [
  { icon: <LuLayers />, t: 'Όλοι οι ΚΑΔ σας', d: 'Κύριος και δευτερεύοντες, απευθείας από την ΑΑΔΕ — χωρίς να ψάξετε τίποτα.' },
  { icon: <LuMapPin />, t: 'Περιφέρεια', d: 'Πανελλαδικά και περιφερειακά προγράμματα με βάση την έδρα σας.' },
  { icon: <LuUsers />, t: 'Μέγεθος', d: 'Πολύ μικρή, μικρή ή μεσαία — επηρεάζει όρια και ποσοστά.' },
  { icon: <LuCalendarRange />, t: 'Έτη λειτουργίας', d: 'Νέες, υπό σύσταση ή υφιστάμενες — κάθε πρόγραμμα έχει άλλο κανόνα.' },
]

export default function KadCheckPage() {
  const ld = {
    '@context': 'https://schema.org', '@type': 'WebApplication', name: 'Έλεγχος ΚΑΔ & επιλεξιμότητας ΕΣΠΑ', url: absoluteUrl('/elegxos-kad'),
    applicationCategory: 'BusinessApplication', operatingSystem: 'Web', inLanguage: 'el-GR', isAccessibleForFree: true,
    offers: { '@type': 'Offer', price: '0', priceCurrency: 'EUR' },
    provider: { '@id': absoluteUrl('/#organization') },
  }
  return (
    <>
      <JsonLd data={[ld, breadcrumbJsonLd([{ label: 'Έλεγχος ΚΑΔ' }])]} />
      <SubBanner image={wwaPhoto('consulting')} crumbs={[{ label: 'Έλεγχος ΚΑΔ' }]} title="Έλεγχος ΚΑΔ για ΕΣΠΑ"
        sub={<>Όχι μόνο ο ΚΑΔ — <span style={{ color: 'var(--wwa-cyan-400)' }}>όλα τα κριτήρια με τον ΑΦΜ σας</span></>}
        lead="Ο ΚΑΔ είναι το πρώτο που ελέγχει κάθε πρόγραμμα, όχι το μόνο. Με τον ΑΦΜ σας βρίσκουμε αυτόματα όλους τους ΚΑΔ, την περιφέρεια, το μέγεθος και τα έτη λειτουργίας, και σας δείχνουμε σε ποια ενεργά προγράμματα ταιριάζετε."
        meta={<><EligibilityCta variant="inverse">Πλήρης έλεγχος με ΑΦΜ</EligibilityCta><a className="btn btn-inverse-outline" href="#kad">Μόνο τον ΚΑΔ μου</a></>} />

      <section lang="el">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">01</span>Γιατί με ΑΦΜ</span>
            <h2>Ένας έλεγχος, όλα τα κριτήρια</h2>
            <p>Τα εργαλεία που ελέγχουν μόνο ΚΑΔ απαντούν στο μισό ερώτημα. Ο δικός μας έλεγχος εξετάζει ό,τι εξετάζει και ο φορέας.</p>
          </div>
          <ul className="kadw r">
            {WHY.map(w => <li key={w.t}><span className="ic" aria-hidden>{w.icon}</span><b>{w.t}</b><span>{w.d}</span></li>)}
          </ul>
          <div className="kadw-cta r"><EligibilityCta size="lg">Δωρεάν έλεγχος με ΑΦΜ</EligibilityCta><span>Χρειάζεται μόνο ΑΦΜ, email και τηλέφωνο · αποτέλεσμα αμέσως</span></div>
        </div>
      </section>

      <section lang="el" className="alt" id="kad">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">02</span>Γρήγορη αναζήτηση</span>
            <h2>Ξέρετε μόνο τον ΚΑΔ σας;</h2>
            <p>Γράψτε τον κωδικό ή τη δραστηριότητα και δείτε αμέσως πώς αντιμετωπίζεται στα ενεργά προγράμματα.</p>
          </div>
          <div className="r" style={{ maxWidth: 820, margin: '0 auto' }}>
            <KadTool />
            <p className="kadt-fine"><LuFileSearch aria-hidden /> Δεν ξέρετε τον ΚΑΔ σας; Τον βρίσκετε στο Taxisnet ή στο ΓΕΜΗ — ή <Link href="/eligibility">αφήστε τον πλήρη έλεγχο να τον βρει για εσάς</Link>.</p>
          </div>
        </div>
      </section>

      <NotifyBanner />
      <Faq items={FAQS} idx="03" title="ΚΑΔ & ΕΣΠΑ: συχνές ερωτήσεις" />
    </>
  )
}
