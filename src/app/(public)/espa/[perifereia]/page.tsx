import type { Metadata } from 'next'
import { NotifyBanner } from '../../_components/notify-banner'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { SubBanner } from '../../_components/sub-banner'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Faq } from '../../_components/faq'
import { ProgramGrid, AnswerBox } from '../../_components/program-grid'
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from '../../_components/json-ld'
import { wwaPhotoFor } from '../../_wwa/assets'
import { REGIONS, programsForRegion, guidesMatching, nProgramms, hubCounts, rateRangeText } from '@/lib/seo-content/hubs'

export const revalidate = 3600
export function generateStaticParams() { return REGIONS.map(r => ({ perifereia: r.slug })) }

const today = () => new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

export async function generateMetadata({ params }: { params: Promise<{ perifereia: string }> }): Promise<Metadata> {
  const { perifereia } = await params
  const r = REGIONS.find(x => x.slug === perifereia)
  if (!r) return {}
  const n = (await programsForRegion(r)).length
  return {
    // ≤ ~60 χαρακτήρες ώστε να μη «κόβεται» στο Google· οι μακριές περιφέρειες παίρνουν τη σύντομη μορφή.
    title: [`ΕΣΠΑ ${r.short} 2026: ενεργά προγράμματα για επιχειρήσεις`, `ΕΣΠΑ ${r.short} 2026: ενεργά προγράμματα`, `ΕΣΠΑ ${r.short} 2026`].find(t => t.length <= 60) ?? `ΕΣΠΑ ${r.short}`,
    description: `${n ? `${n} ενεργ${n === 1 ? 'ό πρόγραμμα' : 'ά προγράμματα'}` : 'Νέα προγράμματα'} ΕΣΠΑ για επιχειρήσεις ${r.in}: ποσοστά επιδότησης, προθεσμίες, προϋποθέσεις. Δωρεάν έλεγχος επιλεξιμότητας.`,
    alternates: { canonical: `/espa/${r.slug}` },
    // Χωρίς ενεργό πρόγραμμα η σελίδα είναι «λεπτή» — δεν ευρετηριάζεται μέχρι να υπάρξει.
    ...(n ? {} : { robots: { index: false, follow: true } }),
  }
}

export default async function RegionPage({ params }: { params: Promise<{ perifereia: string }> }) {
  const { perifereia } = await params
  const r = REGIONS.find(x => x.slug === perifereia)
  if (!r) notFound()
  const [programs, guides, counts] = await Promise.all([programsForRegion(r), guidesMatching([r.short.split(' ')[0], 'ΕΣΠΑ 2026']), hubCounts()])
  // Μόνο κλάδοι με ενεργό πρόγραμμα (όχι σύνδεσμοι σε άδειες σελίδες).
  const sectorLinks = counts.sectors.filter(x => x.total > 0).sort((a, b) => b.total - a.total).slice(0, 5)
  const n = programs.length
  const faq = [
    { q: `Ποια προγράμματα ΕΣΠΑ είναι ανοιχτά ${r.in};`, a: n ? `Αυτή τη στιγμή είναι ανοιχτ${n === 1 ? 'ό ένα πρόγραμμα' : `ά ${n} προγράμματα`} για επιχειρήσεις ${r.of}: ${programs.map(p => p.title).join('· ')}. Η λίστα ενημερώνεται μόλις δημοσιευτεί νέα πρόσκληση.` : `Αυτή τη στιγμή δεν υπάρχει ανοιχτή πρόσκληση ειδικά για επιχειρήσεις ${r.of}. Νέες δράσεις των Περιφερειακών Προγραμμάτων ανακοινώνονται τακτικά — κάντε τον δωρεάν έλεγχο και θα σας ενημερώσουμε.` },
    { q: `Ποιες επιχειρήσεις ${r.of} μπορούν να πάρουν επιδότηση;`, a: 'Συνήθως μικρομεσαίες επιχειρήσεις (ΜμΕ) με επιλέξιμο Κωδικό Αριθμό Δραστηριότητας (ΚΑΔ), έδρα ή εγκατάσταση στην περιφέρεια και, ανάλογα με το πρόγραμμα, συγκεκριμένα έτη λειτουργίας. Οι ακριβείς όροι διαφέρουν ανά πρόσκληση.' },
    { q: 'Πόση είναι η επιδότηση;', a: n ? `Στα ανοιχτά προγράμματα της περιοχής η ενίσχυση είναι ${rateRangeText(programs.map(p => p.rate)) ?? 'σε υψηλά ποσοστά'} του επιλέξιμου προϋπολογισμού, ανάλογα με το μέγεθος της επιχείρησης και το είδος της δαπάνης.` : 'Στα περιφερειακά προγράμματα ΕΣΠΑ η επιδότηση κυμαίνεται συνήθως από 40% έως 75% του επιλέξιμου προϋπολογισμού, ανάλογα με την περιφέρεια, το μέγεθος της επιχείρησης και τη δράση.' },
    { q: 'Πώς ξέρω αν η επιχείρησή μου είναι επιλέξιμη;', a: 'Με τον δωρεάν έλεγχο επιλεξιμότητας: με τον ΑΦΜ της επιχείρησης βρίσκουμε ΚΑΔ, έδρα και ενεργά προγράμματα που ταιριάζουν και σας απαντάμε σε μία εργάσιμη.' },
  ]
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'ΕΣΠΑ ανά περιοχή', href: '/espa' }, { label: r.short }])} />
      {programs.length > 0 && <JsonLd data={itemListJsonLd(`Προγράμματα ΕΣΠΑ ${r.short}`, programs.map(p => ({ name: p.title, href: `/programmata/${p.slug}` })))} />}
      <SubBanner image={wwaPhotoFor(r.slug)} crumbs={[{ label: 'ΕΣΠΑ ανά περιοχή', href: '/espa' }, { label: r.short }]}
        title={<>ΕΣΠΑ {r.short} 2026</>} lead={`Ενεργά προγράμματα και επιδοτήσεις για επιχειρήσεις ${r.of}.`}
        meta={<EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta>} />
      <section lang="el">
        <div className="wrap">
          <AnswerBox updated={today()}>
            {n
              ? <>{r.in.charAt(0).toUpperCase() + r.in.slice(1)} είναι ανοιχτ{n === 1 ? 'ό' : 'ά'} σήμερα <b>{nProgramms(n)}</b> για επιχειρήσεις, με επιδότηση {rateRangeText(programs.map(p => p.rate)) ?? 'σε υψηλά ποσοστά'}. Δείτε προϋποθέσεις και προθεσμίες παρακάτω ή ελέγξτε δωρεάν, με τον ΑΦΜ σας, αν η επιχείρησή σας είναι επιλέξιμη.</>
              : <>Για επιχειρήσεις <b>{r.of}</b> δεν υπάρχει αυτή τη στιγμή ανοιχτή πρόσκληση ΕΣΠΑ για επιχειρήσεις. Νέες δράσεις ανακοινώνονται τακτικά — κάντε τον δωρεάν έλεγχο επιλεξιμότητας και θα σας ειδοποιήσουμε μόλις ανοίξει πρόγραμμα που σας αφορά.</>}
          </AnswerBox>
          <div className="sec-head r" style={{ marginTop: 40 }}><h2>Ενεργά προγράμματα {r.in}</h2></div>
          <ProgramGrid programs={programs} empty="Μόλις ανοίξει νέα πρόσκληση για την περιοχή θα εμφανιστεί εδώ." />
          <div className="hub-links r">
            <h3>Δείτε επίσης</h3>
            <ul>
              <li><Link href="/prothesmies-espa">Προθεσμίες προγραμμάτων ΕΣΠΑ</Link></li>
              {sectorLinks.map(({ sector: s, total }) => <li key={s.slug}><Link href={`/espa/klados/${s.slug}`}>ΕΣΠΑ για {s.short}</Link> <span className="hub-n">({total})</span></li>)}
              {guides.map(g => <li key={g.slug}><Link href={`/nea/${g.slug}`}>{g.title}</Link></li>)}
            </ul>
          </div>
        </div>
      </section>
      <NotifyBanner />
      <Faq items={faq} idx="02" title={`ΕΣΠΑ ${r.short}: συχνές ερωτήσεις`} />
    </>
  )
}
