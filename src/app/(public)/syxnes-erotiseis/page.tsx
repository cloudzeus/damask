import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { JsonLd, breadcrumbJsonLd } from '../_components/json-ld'
import { FaqHubList } from '../_components/faq-hub-list'
import { wwaPhoto } from '../_wwa/assets'
import { absoluteUrl } from '@/lib/site-url'
import { FAQ_HUB, FAQ_HUB_COUNT } from '@/lib/seo-content/faq-hub'

export const metadata: Metadata = {
  title: 'Συχνές ερωτήσεις για ΕΣΠΑ & επιδοτήσεις επιχειρήσεων',
  description: `${FAQ_HUB_COUNT} απαντήσεις για ΕΣΠΑ, Περιφερειακά, LEADER και Αναπτυξιακό: ποιος δικαιούται, ποσοστά, ίδια συμμετοχή, προκαταβολή, δικαιολογητικά, έγκριση, εκταμίευση.`,
  alternates: { canonical: '/syxnes-erotiseis' },
}

export default function FaqHubPage() {
  const ld = {
    '@context': 'https://schema.org', '@type': 'FAQPage', '@id': absoluteUrl('/syxnes-erotiseis#faq'), inLanguage: 'el-GR',
    name: 'Συχνές ερωτήσεις για ΕΣΠΑ & επιδοτήσεις επιχειρήσεων',
    mainEntity: FAQ_HUB.flatMap(g => g.items.map(it => ({ '@type': 'Question', name: it.q, acceptedAnswer: { '@type': 'Answer', text: it.a } }))),
  }
  return (
    <>
      <JsonLd data={[ld, breadcrumbJsonLd([{ label: 'Συχνές ερωτήσεις' }])]} />
      <SubBanner image={wwaPhoto('consulting')} crumbs={[{ label: 'Συχνές ερωτήσεις' }]} title="Συχνές ερωτήσεις"
        sub={<>Όλα όσα ρωτούν οι επιχειρήσεις — <span style={{ color: 'var(--wwa-cyan-400)' }}>{FAQ_HUB_COUNT} απαντήσεις</span></>}
        lead="Από το «δικαιούμαι;» μέχρι την πληρωμή της επιδότησης: ΕΣΠΑ, Περιφερειακά προγράμματα, LEADER και Αναπτυξιακός Νόμος, με απλά λόγια."
        meta={<><EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta><Link className="btn btn-inverse-outline" href="/epikoinonia#contact">Κάντε μας μια ερώτηση</Link></>} />
      <section lang="el">
        <div className="wrap faqhub">
          <FaqHubList groups={FAQ_HUB} />
          <div className="faqhub-cta r">
            <h2>Δεν βρήκατε την απάντηση;</h2>
            <p>Κάθε επιχείρηση είναι διαφορετική. Πείτε μας τι σχεδιάζετε και θα σας απαντήσουμε μέσα σε μία εργάσιμη — ή δείτε αμέσως ποια ενεργά προγράμματα σας ταιριάζουν.</p>
            <div className="faqhub-cta-actions">
              <EligibilityCta variant="inverse">Δωρεάν έλεγχος επιλεξιμότητας</EligibilityCta>
              <Link className="btn btn-inverse-outline" href="/epikoinonia#contact">Επικοινωνία</Link>
            </div>
            <p className="faqhub-more">Δείτε επίσης: <Link href="/glossari">Γλωσσάριο ΕΣΠΑ</Link> · <Link href="/prothesmies-espa">Προθεσμίες</Link> · <Link href="/programmata">Ενεργά προγράμματα</Link></p>
          </div>
        </div>
      </section>
    </>
  )
}
