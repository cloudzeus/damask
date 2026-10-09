import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Faq, type FaqItem } from '../_components/faq'
import { AnswerBox } from '../_components/program-grid'
import { NotifyBanner } from '../_components/notify-banner'
import { JsonLd, breadcrumbJsonLd } from '../_components/json-ld'
import { wwaPhoto } from '../_wwa/assets'
import { absoluteUrl } from '@/lib/site-url'
import { programsByFamily, nProgramms, rateRangeText } from '@/lib/seo-content/hubs'

export const revalidate = 3600

export const metadata: Metadata = {
  title: 'ΕΣΠΑ, Αναπτυξιακός ή LEADER; Σύγκριση για επιχειρήσεις',
  description: 'Ποιο πρόγραμμα ταιριάζει στην επιχείρησή σας: σύγκριση ΕΣΠΑ, Αναπτυξιακού Νόμου και LEADER σε ύψος επένδυσης, μορφή ενίσχυσης, αξιολόγηση και διαδικασία.',
  alternates: { canonical: '/espa-anaptyxiakos-leader' },
}

/** Γενικοί, επαληθεύσιμοι κανόνες — οι ακριβείς όροι ορίζονται σε κάθε πρόσκληση. */
const ROWS: { k: string; espa: string; an: string; leader: string }[] = [
  { k: 'Για ποιους', espa: 'Υφιστάμενες, νέες και υπό σύσταση επιχειρήσεις όλων των κλάδων — εθνικά ή ανά Περιφέρεια', an: 'Επιχειρήσεις με μεγαλύτερα επενδυτικά σχέδια σε θεματικά καθεστώτα (π.χ. μεταποίηση, αγροδιατροφή)', leader: 'Μικρές επιχειρήσεις σε αγροτικές, ορεινές και νησιωτικές περιοχές του τοπικού προγράμματος' },
  { k: 'Ύψος επένδυσης', espa: 'Από λίγες χιλιάδες έως εκατοντάδες χιλιάδες ευρώ, ανάλογα με τη δράση', an: 'Κατά κανόνα από €100.000 (πολύ μικρές) έως €1.000.000+ (μεγάλες)', leader: 'Συνήθως έως μερικές εκατοντάδες χιλιάδες ευρώ ανά πρόταση' },
  { k: 'Μορφή ενίσχυσης', espa: 'Μη επιστρεπτέα επιχορήγηση', an: 'Επιχορήγηση, φορολογική απαλλαγή, επιδότηση leasing ή μισθολογικού κόστους', leader: 'Μη επιστρεπτέα επιχορήγηση' },
  { k: 'Αξιολόγηση', espa: 'Σειρά προτεραιότητας ή συγκριτική, ανά πρόσκληση', an: 'Συγκριτική, με πίνακες κατάταξης ανά κύκλο', leader: 'Συγκριτική μοριοδότηση από την Ομάδα Τοπικής Δράσης' },
  { k: 'Υποβολή', espa: 'Πληροφοριακό Σύστημα Κρατικών Ενισχύσεων (ΠΣΚΕ)', an: 'Πληροφοριακό σύστημα του Αναπτυξιακού Νόμου', leader: 'Πληροφοριακό σύστημα της ΚΑΠ (ΟΠΣΚΕ)' },
  { k: 'Πότε ανοίγει', espa: 'Προσκλήσεις καθ’ όλη τη διάρκεια του έτους', an: 'Κύκλοι ανά καθεστώς, σε όλη τη διάρκεια του έτους', leader: 'Ανά ΟΤΔ, σε διαφορετικούς χρόνους για κάθε περιοχή' },
]

const FAQS: FaqItem[] = [
  { q: 'Ποια είναι η διαφορά ΕΣΠΑ και Αναπτυξιακού Νόμου;', a: 'Το ΕΣΠΑ χρηματοδοτεί συνήθως μικρότερα επενδυτικά σχέδια με μη επιστρεπτέα επιχορήγηση και απλούστερες διαδικασίες. Ο Αναπτυξιακός Νόμος απευθύνεται σε μεγαλύτερες επενδύσεις, με ελάχιστο ύψος ανάλογα με το μέγεθος της επιχείρησης, συγκριτική αξιολόγηση και περισσότερες μορφές ενίσχυσης, όπως η φορολογική απαλλαγή.' },
  { q: 'Τι είναι το LEADER και σε τι διαφέρει από το ΕΣΠΑ;', a: 'Το LEADER είναι μέτρο τοπικής ανάπτυξης της Κοινής Αγροτικής Πολιτικής για αγροτικές, ορεινές και νησιωτικές περιοχές. Το υλοποιούν οι Ομάδες Τοπικής Δράσης, η καθεμία μόνο στη δική της περιοχή, ενώ το ΕΣΠΑ καλύπτει εθνικά και περιφερειακά προγράμματα.' },
  { q: 'Μπορώ να ενταχθώ σε περισσότερα από ένα;', a: 'Συνήθως ναι, για διαφορετικές δαπάνες — η ίδια δαπάνη δεν χρηματοδοτείται δύο φορές — και εφόσον δεν ξεπερνιούνται τα όρια κρατικών ενισχύσεων, όπως το de minimis. Ορισμένες προσκλήσεις έχουν ειδικούς αποκλεισμούς.' },
  { q: 'Ποιο είναι καλύτερο για μια μικρή επιχείρηση;', a: 'Για μικρά σχέδια ταιριάζουν συνήθως τα προγράμματα ΕΣΠΑ και, σε αγροτικές ή νησιωτικές περιοχές, το LEADER. Ο Αναπτυξιακός Νόμος έχει υψηλότερο ελάχιστο ύψος επένδυσης. Η επιλογή εξαρτάται από τον ΚΑΔ, την περιοχή και το είδος της επένδυσης — ο δωρεάν έλεγχος με ΑΦΜ τα εξετάζει όλα μαζί.' },
]

export default async function ComparePage() {
  const fam = await programsByFamily()
  const col = [
    { key: 'espa', title: 'ΕΣΠΑ & Περιφερειακά', href: '/espa', programs: fam.espa },
    { key: 'an', title: 'Αναπτυξιακός Νόμος', href: '/anaptyxiakos-nomos', programs: fam.anaptyxiakos },
    { key: 'leader', title: 'LEADER & ΣΣ ΚΑΠ', href: '/leader', programs: fam.kap },
  ] as const
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'Προγράμματα', href: '/programmata' }, { label: 'ΕΣΠΑ, Αναπτυξιακός ή LEADER' }])} />
      <SubBanner image={wwaPhoto('consulting')} crumbs={[{ label: 'Προγράμματα', href: '/programmata' }, { label: 'Σύγκριση' }]}
        title="ΕΣΠΑ, Αναπτυξιακός ή LEADER;" sub={<span style={{ color: 'var(--wwa-cyan-400)' }}>Ποιο ταιριάζει στην επιχείρησή σας</span>}
        lead="Τρία διαφορετικά «κανάλια» χρηματοδότησης, με άλλους κανόνες, ποσά και διαδικασίες. Δείτε τις διαφορές με μια ματιά — και ποια είναι ανοιχτά τώρα."
        meta={<EligibilityCta variant="inverse">Δείτε ποιο σας ταιριάζει</EligibilityCta>} />

      <section lang="el">
        <div className="wrap">
          <AnswerBox updated={today}>
            Με απλά λόγια: το <b>ΕΣΠΑ</b> χρηματοδοτεί συνήθως μικρότερα σχέδια με επιχορήγηση, ο <b>Αναπτυξιακός Νόμος</b> μεγαλύτερες επενδύσεις (κατά κανόνα από €100.000) και με φορολογική απαλλαγή ή leasing, ενώ το <b>LEADER</b> στηρίζει μικρές επιχειρήσεις σε αγροτικές και νησιωτικές περιοχές. Αυτή τη στιγμή είναι ανοιχτά {nProgramms(fam.espa.length)} ΕΣΠΑ, {nProgramms(fam.anaptyxiakos.length)} του Αναπτυξιακού και {nProgramms(fam.kap.length)} LEADER/ΚΑΠ.
          </AnswerBox>

          <div className="cmpx r" role="region" aria-label="Σύγκριση ΕΣΠΑ, Αναπτυξιακού Νόμου και LEADER" tabIndex={0}>
            <table>
              <caption className="sr-only">Σύγκριση ΕΣΠΑ, Αναπτυξιακού Νόμου και LEADER για επιχειρήσεις</caption>
              <thead>
                <tr><th scope="col"><span className="sr-only">Κριτήριο</span></th>{col.map(c => <th key={c.key} scope="col">{c.title}</th>)}</tr>
              </thead>
              <tbody>
                <tr className="live">
                  <th scope="row">Ανοιχτά τώρα</th>
                  {col.map(c => {
                    const r = rateRangeText(c.programs.map(p => p.rate))
                    return <td key={c.key}><b>{nProgramms(c.programs.length)}</b>{r ? <span> · επιδότηση {r}</span> : null}<Link href={c.href}>Δείτε τα →</Link></td>
                  })}
                </tr>
                {ROWS.map(r => (
                  <tr key={r.k}><th scope="row">{r.k}</th><td>{r.espa}</td><td>{r.an}</td><td>{r.leader}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="cmpx-note r">Γενικοί κανόνες για σύγκριση — οι ακριβείς όροι (ποσά, ποσοστά, δικαιούχοι) ορίζονται σε κάθε πρόσκληση.</p>
        </div>
      </section>

      <section lang="el" className="alt">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">01</span>Οδηγός επιλογής</span>
            <h2>Ποιο να κοιτάξετε πρώτα</h2>
          </div>
          <div className="famx-about r">
            <article><h3>Επένδυση έως ~€100.000</h3><p>Ξεκινήστε από τα προγράμματα <Link href="/espa">ΕΣΠΑ της περιφέρειάς σας</Link>. Αν η επιχείρηση είναι σε αγροτική, ορεινή ή νησιωτική περιοχή, δείτε και το <Link href="/leader">LEADER</Link> της περιοχής σας.</p></article>
            <article><h3>Μεγαλύτερη επένδυση</h3><p>Από περίπου €100.000 και πάνω, εξετάστε τα καθεστώτα του <Link href="/anaptyxiakos-nomos">Αναπτυξιακού Νόμου</Link> — ειδικά αν σας ενδιαφέρει φορολογική απαλλαγή ή leasing εξοπλισμού.</p></article>
            <article><h3>Δεν είστε σίγουροι;</h3><p>Ο δωρεάν έλεγχος με τον ΑΦΜ σας εξετάζει ΚΑΔ, περιοχή, μέγεθος και έτη λειτουργίας σε όλα τα ανοιχτά προγράμματα μαζί. Δείτε επίσης τις <Link href="/syxnes-erotiseis">συχνές ερωτήσεις</Link>.</p></article>
          </div>
        </div>
      </section>

      <NotifyBanner />
      <Faq items={FAQS} idx="02" title="Σύγκριση προγραμμάτων: συχνές ερωτήσεις" />
      <JsonLd data={{ '@context': 'https://schema.org', '@type': 'WebPage', '@id': absoluteUrl('/espa-anaptyxiakos-leader'), name: 'ΕΣΠΑ, Αναπτυξιακός ή LEADER;', inLanguage: 'el-GR', about: ['ΕΣΠΑ 2021-2027', 'Αναπτυξιακός Νόμος 4887/2022', 'LEADER / ΣΣ ΚΑΠ 2023-2027'], dateModified: new Date().toISOString() }} />
    </>
  )
}
