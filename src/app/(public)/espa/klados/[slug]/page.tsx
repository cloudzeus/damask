import type { Metadata } from 'next'
import { NotifyBanner } from '../../../_components/notify-banner'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SubBanner } from '../../../_components/sub-banner'
import { EligibilityCta } from '../../../_components/eligibility-cta'
import { Faq } from '../../../_components/faq'
import { ProgramGrid, AnswerBox } from '../../../_components/program-grid'
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from '../../../_components/json-ld'
import { wwaPhotoFor } from '../../../_wwa/assets'
import { SECTORS, programsForSector, guidesMatching, nProgramms, hubCounts } from '@/lib/seo-content/hubs'

export const revalidate = 3600
export function generateStaticParams() { return SECTORS.map(s => ({ slug: s.slug })) }

const today = () => new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const s = SECTORS.find(x => x.slug === slug)
  if (!s) return {}
  const n = (await programsForSector(s)).length
  return {
    title: `ΕΣΠΑ για ${s.short} 2026: επιδοτήσεις & ενεργά προγράμματα`,
    description: `Επιδοτήσεις ΕΣΠΑ για ${s.about}: ${n ? `${n} ενεργ${n === 1 ? 'ό πρόγραμμα' : 'ά προγράμματα'}, ` : ''}επιλέξιμες δαπάνες, προϋποθέσεις και δωρεάν έλεγχος επιλεξιμότητας.`,
    alternates: { canonical: `/espa/klados/${s.slug}` },
    ...(n ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function SectorPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const s = SECTORS.find(x => x.slug === slug)
  if (!s) notFound()
  const [programs, guides, counts] = await Promise.all([programsForSector(s), guidesMatching([s.short.split(' ')[0], s.name.split(' ')[0]]), hubCounts()])
  // Πρώτα οι περιφέρειες με δικό τους (περιφερειακό) πρόγραμμα.
  const regionLinks = counts.regions.filter(x => x.total > 0).sort((a, b) => b.local - a.local).slice(0, 4)
  const n = programs.length
  const faq = [
    { q: `Υπάρχει ΕΣΠΑ για ${s.short} το 2026;`, a: n ? `Ναι — αυτή τη στιγμή ${n === 1 ? 'ένα ενεργό πρόγραμμα δέχεται' : `${n} ενεργά προγράμματα δέχονται`} επιχειρήσεις του κλάδου (${s.about}): ${programs.map(p => p.title).join('· ')}.` : `Αυτή τη στιγμή δεν υπάρχει ανοιχτή πρόσκληση με επιλέξιμους ΚΑΔ του κλάδου. Νέες δράσεις ανοίγουν τακτικά — κάντε τον δωρεάν έλεγχο και θα σας ενημερώσουμε.` },
    { q: 'Ποιες δαπάνες επιδοτούνται συνήθως;', a: `Για επιχειρήσεις του κλάδου επιδοτούνται συχνά: ${s.examples.join(', ')}. Οι ακριβείς επιλέξιμες δαπάνες και τα όρια ορίζονται σε κάθε πρόσκληση.` },
    { q: 'Πώς ξέρω αν ο ΚΑΔ μου είναι επιλέξιμος;', a: 'Κάθε πρόγραμμα έχει λίστα επιλέξιμων Κωδικών Αριθμών Δραστηριότητας (ΚΑΔ). Με τον δωρεάν έλεγχο επιλεξιμότητας βρίσκουμε αυτόματα τους ΚΑΔ της επιχείρησής σας από την ΑΑΔΕ και τους συγκρίνουμε με τα ενεργά προγράμματα.' },
    { q: 'Μπορεί να επιδοτηθεί νέα επιχείρηση του κλάδου;', a: 'Ορισμένα προγράμματα απευθύνονται και σε νέες ή υπό σύσταση επιχειρήσεις, ενώ άλλα ζητούν συγκεκριμένα έτη λειτουργίας. Σας λέμε ποια ισχύουν για εσάς σε μία εργάσιμη.' },
  ]
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'ΕΣΠΑ ανά κλάδο', href: '/espa' }, { label: s.name }])} />
      {programs.length > 0 && <JsonLd data={itemListJsonLd(`Προγράμματα ΕΣΠΑ για ${s.short}`, programs.map(p => ({ name: p.title, href: `/programmata/${p.slug}` })))} />}
      <SubBanner image={wwaPhotoFor(s.slug)} crumbs={[{ label: 'ΕΣΠΑ ανά κλάδο', href: '/espa' }, { label: s.name }]}
        title={<>ΕΣΠΑ για {s.short} 2026</>} lead={`Επιδοτήσεις και ενεργά προγράμματα για ${s.about}.`}
        meta={<EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta>} />
      <section lang="el">
        <div className="wrap">
          <AnswerBox updated={today()}>
            {n
              ? <>Για επιχειρήσεις του κλάδου <b>{s.name}</b> είναι ανοιχτ{n === 1 ? 'ό' : 'ά'} σήμερα <b>{nProgramms(n)} ΕΣΠΑ</b>, που καλύπτουν δαπάνες όπως {s.examples.slice(0, 3).join(', ')}. Δείτε τους όρους παρακάτω ή ελέγξτε δωρεάν, με τον ΑΦΜ σας, αν ο ΚΑΔ σας είναι επιλέξιμος.</>
              : <>Για τον κλάδο <b>{s.name}</b> δεν υπάρχει αυτή τη στιγμή ανοιχτή πρόσκληση ΕΣΠΑ. Τα προγράμματα για {s.short} επιδοτούν συνήθως {s.examples.slice(0, 3).join(', ')} — κάντε τον δωρεάν έλεγχο και θα σας ειδοποιήσουμε μόλις ανοίξει.</>}
          </AnswerBox>
          <div className="sec-head r" style={{ marginTop: 40 }}><h2>Ενεργά προγράμματα για {s.short}</h2></div>
          <ProgramGrid programs={programs} empty="Μόλις ανοίξει νέα πρόσκληση για τον κλάδο θα εμφανιστεί εδώ." />
          <div className="hub-links r">
            <h3>Δείτε επίσης</h3>
            <ul>
              <li><Link href="/prothesmies-espa">Προθεσμίες προγραμμάτων ΕΣΠΑ</Link></li>
              <li><Link href="/glossari">Γλωσσάριο ΕΣΠΑ: de minimis, ΕΜΕ, ΚΑΔ κ.ά.</Link></li>
              {regionLinks.map(({ hub: r, total }) => <li key={r.slug}><Link href={`/espa/${r.slug}`}>ΕΣΠΑ {r.short}</Link> <span className="hub-n">({total})</span></li>)}
              {guides.map(g => <li key={g.slug}><Link href={`/nea/${g.slug}`}>{g.title}</Link></li>)}
            </ul>
          </div>
        </div>
      </section>
      <NotifyBanner />
      <Faq items={faq} idx="02" title={`ΕΣΠΑ για ${s.short}: συχνές ερωτήσεις`} />
    </>
  )
}
