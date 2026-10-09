import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../../_components/sub-banner'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Faq } from '../../_components/faq'
import { AnswerBox, ProgramGrid } from '../../_components/program-grid'
import { JsonLd, breadcrumbJsonLd } from '../../_components/json-ld'
import { wwaPhoto } from '../../_wwa/assets'
import { listPublicPrograms } from '@/lib/programs/public'
import { guidesMatching } from '@/lib/seo-content/hubs'

export const revalidate = 3600
export const metadata: Metadata = {
  title: 'Νέα & Αναμενόμενα Προγράμματα ΕΣΠΑ 2026 για επιχειρήσεις',
  description: 'Ποια νέα προγράμματα ΕΣΠΑ 2026 ανοίγουν για επιχειρήσεις, τι αναμένεται τους επόμενους μήνες και πώς να προετοιμαστείτε ώστε να υποβάλετε από την πρώτη ημέρα.',
  alternates: { canonical: '/programmata/nea-2026' },
}

const FAQ = [
  { q: 'Ποια νέα προγράμματα ΕΣΠΑ ανοίγουν το 2026;', a: 'Στο ΕΣΠΑ 2021–2027 ανοίγουν σταδιακά δράσεις των Περιφερειακών Προγραμμάτων και του «Ανταγωνιστικότητα» για ψηφιακό μετασχηματισμό, μεταποίηση, καινοτομία, τουρισμό και νέες επιχειρήσεις. Μόλις δημοσιευτεί προδημοσίευση ή πρόσκληση, εμφανίζεται εδώ.' },
  { q: 'Πώς προετοιμάζομαι πριν ανοίξει ένα πρόγραμμα;', a: 'Ελέγξτε ότι οι ΚΑΔ της επιχείρησης είναι σωστοί, ότι έχετε φορολογική και ασφαλιστική ενημερότητα, το ιστορικό de minimis και προσφορές για τις δαπάνες που σχεδιάζετε. Έτσι υποβάλλετε από την πρώτη ημέρα.' },
  { q: 'Τι είναι η προδημοσίευση;', a: 'Είναι το σχέδιο της πρόσκλησης που δημοσιεύεται πριν ανοίξουν οι αιτήσεις. Δίνει τους βασικούς όρους (δικαιούχοι, ποσοστά, δαπάνες) ώστε οι επιχειρήσεις να προετοιμαστούν· οι τελικοί όροι μπορεί να αλλάξουν.' },
  { q: 'Πώς θα ενημερωθώ μόλις ανοίξει πρόγραμμα για εμένα;', a: 'Κάντε τον δωρεάν έλεγχο επιλεξιμότητας με τον ΑΦΜ σας: κρατάμε το προφίλ της επιχείρησης (ΚΑΔ, περιοχή, μέγεθος) και σας ειδοποιούμε όταν ανοίξει δράση που σας ταιριάζει.' },
]

export default async function NewPrograms2026() {
  const [programs, guides] = await Promise.all([listPublicPrograms(), guidesMatching(['αναμενόμενα', 'Νέα προγράμματα', '2026'], 6)])
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'Προγράμματα', href: '/programmata' }, { label: 'Νέα 2026' }])} />
      <SubBanner image={wwaPhoto('startup')} crumbs={[{ label: 'Προγράμματα', href: '/programmata' }, { label: 'Νέα 2026' }]}
        title="Νέα & αναμενόμενα προγράμματα ΕΣΠΑ 2026" lead="Τι ανοίγει για επιχειρήσεις και πώς να είστε έτοιμοι από την πρώτη ημέρα."
        meta={<EligibilityCta size="lg">Ενημερωθείτε πρώτοι</EligibilityCta>} />
      <section lang="el">
        <div className="wrap">
          <AnswerBox updated={new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}>
            Το 2026 ανοίγουν σταδιακά νέες δράσεις ΕΣΠΑ για <b>ψηφιακό μετασχηματισμό, μεταποίηση, καινοτομία, τουρισμό και νέες επιχειρήσεις</b>. Σήμερα δέχ{programs.length === 1 ? 'εται αιτήσεις 1 πρόγραμμα' : `ονται αιτήσεις ${programs.length} προγράμματα`}· για τα επόμενα, ετοιμάστε από τώρα ενημερότητες, ΚΑΔ και προσφορές ώστε να υποβάλετε από την πρώτη ημέρα.
          </AnswerBox>
          <div className="sec-head r" style={{ marginTop: 40 }}><h2>Ανοιχτά τώρα</h2></div>
          <ProgramGrid programs={programs} empty="Μόλις ανοίξει νέα πρόσκληση θα εμφανιστεί εδώ." />
          {guides.length > 0 && (
            <div className="hub-links r">
              <h3>Οδηγοί για τα νέα προγράμματα</h3>
              <ul>{guides.map(g => <li key={g.slug}><Link href={`/nea/${g.slug}`}>{g.title}</Link></li>)}<li><Link href="/prothesmies-espa">Προθεσμίες ΕΣΠΑ</Link></li></ul>
            </div>
          )}
        </div>
      </section>
      <Faq items={FAQ} idx="02" title="Νέα προγράμματα ΕΣΠΑ 2026: συχνές ερωτήσεις" />
    </>
  )
}
