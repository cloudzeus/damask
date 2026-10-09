import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { JsonLd, breadcrumbJsonLd } from '../_components/json-ld'
import { wwaPhoto } from '../_wwa/assets'
import { absoluteUrl } from '@/lib/site-url'
import { GLOSSARY as TERMS } from '@/lib/seo-content/glossary'

export const metadata: Metadata = {
  title: 'Γλωσσάριο ΕΣΠΑ: de minimis, ΕΜΕ, ΚΑΔ & άλλοι όροι',
  description: 'Οι όροι των επιδοτήσεων με απλά λόγια: de minimis, ΕΜΕ, ΚΑΔ, ίδια συμμετοχή, επιλέξιμη δαπάνη, ενημερότητες, εκταμίευση και άλλοι.',
  alternates: { canonical: '/glossari' },
}

export default function GlossaryPage() {
  const ld = {
    '@context': 'https://schema.org', '@type': 'DefinedTermSet', '@id': absoluteUrl('/glossari#set'), name: 'Γλωσσάριο ΕΣΠΑ & επιδοτήσεων', inLanguage: 'el-GR',
    hasDefinedTerm: TERMS.map(t => ({ '@type': 'DefinedTerm', '@id': absoluteUrl(`/glossari#${t.id}`), name: t.term, description: t.def, inDefinedTermSet: absoluteUrl('/glossari#set') })),
  }
  return (
    <>
      <JsonLd data={[ld, breadcrumbJsonLd([{ label: 'Γλωσσάριο ΕΣΠΑ' }])]} />
      <SubBanner image={wwaPhoto('consulting')} crumbs={[{ label: 'Γλωσσάριο ΕΣΠΑ' }]} title="Γλωσσάριο ΕΣΠΑ"
        lead="Οι όροι των επιδοτήσεων με απλά λόγια — από το de minimis μέχρι την εκταμίευση." meta={<EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta>} />
      <section lang="el">
        <div className="wrap">
          <nav className="r" aria-label="Όροι" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, justifyContent: 'center', maxWidth: 900, margin: '0 auto 32px' }}>
            {TERMS.map(t => <a key={t.id} href={`#${t.id}`} className="pill" style={{ background: 'var(--navy-50)', color: 'var(--brand)' }}>{t.term.split(' (')[0]}</a>)}
          </nav>
          <dl style={{ maxWidth: 820, margin: '0 auto' }}>
            {TERMS.map(t => (
              <div key={t.id} id={t.id} className="r" style={{ padding: '20px 0', borderBottom: '1px solid var(--rule)', scrollMarginTop: 110 }}>
                <dt><h2 style={{ fontSize: '1.25rem', textAlign: 'left' }}>{t.term}</h2></dt>
                <dd style={{ margin: '8px 0 0', color: 'var(--fg-2)', lineHeight: 1.65 }}>
                  {t.def}
                  {t.link && <> <Link href={t.link.href} style={{ color: 'var(--brand)', fontWeight: 500 }}>{t.link.label} →</Link></>}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      </section>
    </>
  )
}
