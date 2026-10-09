import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { AnswerBox } from '../_components/program-grid'
import { wwaPhoto } from '../_wwa/assets'
import { REGIONS, SECTORS, programsForRegion, programsForSector } from '@/lib/seo-content/hubs'

export const revalidate = 3600
export const metadata: Metadata = {
  title: 'ΕΣΠΑ 2026 ανά περιοχή και κλάδο — World Wide Associates',
  description: 'Βρείτε τα ενεργά προγράμματα ΕΣΠΑ για την περιφέρεια και τον κλάδο της επιχείρησής σας: Αττική, Κεντρική Μακεδονία, Κρήτη, τουρισμός, μεταποίηση, πληροφορική κ.ά.',
  alternates: { canonical: '/espa' },
}

/** Κόμβος: όλες οι περιφέρειες & οι κλάδοι με το πλήθος ενεργών προγραμμάτων. */
export default async function EspaHub() {
  const [regions, sectors] = await Promise.all([
    Promise.all(REGIONS.map(async r => ({ ...r, n: (await programsForRegion(r)).length }))),
    Promise.all(SECTORS.map(async s => ({ ...s, n: (await programsForSector(s)).length }))),
  ])
  return (
    <>
      <SubBanner image={wwaPhoto('team')} crumbs={[{ label: 'ΕΣΠΑ ανά περιοχή & κλάδο' }]} title="ΕΣΠΑ 2026 ανά περιοχή και κλάδο"
        lead="Δείτε ποια προγράμματα είναι ανοιχτά για την περιφέρεια και τον κλάδο της επιχείρησής σας." meta={<EligibilityCta size="lg">Δείτε αν δικαιούστε</EligibilityCta>} />
      <section lang="el">
        <div className="wrap">
          <AnswerBox>Τα προγράμματα ΕΣΠΑ για επιχειρήσεις διαφέρουν ανά <b>περιφέρεια</b> (Περιφερειακά Προγράμματα) και ανά <b>κλάδο</b> (επιλέξιμοι ΚΑΔ). Επιλέξτε περιοχή ή κλάδο για να δείτε τα ενεργά προγράμματα, ή κάντε τον δωρεάν έλεγχο επιλεξιμότητας με τον ΑΦΜ σας.</AnswerBox>
          <div className="hub-grid r">
            <div>
              <h2>Ανά περιφέρεια</h2>
              <ul>{regions.map(r => <li key={r.slug}><Link href={`/espa/${r.slug}`}>{r.short}</Link><span>{r.n ? `${r.n} ενεργ${r.n === 1 ? 'ό' : 'ά'}` : '—'}</span></li>)}</ul>
            </div>
            <div>
              <h2>Ανά κλάδο</h2>
              <ul>{sectors.map(s => <li key={s.slug}><Link href={`/espa/klados/${s.slug}`}>{s.name}</Link><span>{s.n ? `${s.n} ενεργ${s.n === 1 ? 'ό' : 'ά'}` : '—'}</span></li>)}</ul>
            </div>
          </div>
        </div>
      </section>
    </>
  )
}
