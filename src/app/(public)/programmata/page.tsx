/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { ProgramCard } from '../_components/program-card'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Faq, type FaqItem } from '../_components/faq'
import { wwaPhoto } from '../_wwa/assets'
import { listPublicPrograms } from '@/lib/programs/public'
import { AnswerBox } from '../_components/program-grid'
import { REGIONS, SECTORS, listDeadlines, nProgramms } from '@/lib/seo-content/hubs'
import { JsonLd, itemListJsonLd } from '../_components/json-ld'

export const revalidate = 3600

export const metadata: Metadata = {
  alternates: { canonical: '/programmata' },
  title: 'Ενεργά Προγράμματα ΕΣΠΑ 2026 για Επιχειρήσεις',
  description: 'Τα ενεργά προγράμματα ΕΣΠΑ 2026 για επιχειρήσεις: επιδότηση, προθεσμίες, περιοχές. Δωρεάν έλεγχος επιλεξιμότητας σε μία εργάσιμη.',
}

const FAQS: FaqItem[] = [
  { q: 'Ποια προγράμματα ΕΣΠΑ είναι ενεργά τώρα;', a: 'Στη σελίδα εμφανίζονται όλες οι ενεργές προκηρύξεις. Κάθε πρόγραμμα έχει διαφορετικούς όρους (μέγεθος επιχείρησης, ΚΑΔ, περιφέρεια, ύψος επένδυσης) — με τον δωρεάν έλεγχο βλέπετε ποια σας αφορούν.' },
  { q: 'Πώς ξέρω σε ποιο πρόγραμμα ταιριάζει η επιχείρησή μου;', a: 'Κάντε τον δωρεάν έλεγχο επιλεξιμότητας: με ΑΦΜ, email και τηλέφωνο εντοπίζουμε αυτόματα ΚΑΔ και περιφέρεια και σας λέμε σε μία εργάσιμη ποια ενεργά προγράμματα σας αφορούν.' },
  { q: 'Πόσο κοστίζει η υποβολή μέσω της WWA;', a: 'Ο έλεγχος επιλεξιμότητας είναι δωρεάν και η αμοιβή σύνταξης είναι αμοιβή επιτυχίας — πληρώνεται μετά την έγκριση. Στα περισσότερα προγράμματα η αμοιβή συμβούλου είναι επιλέξιμη δαπάνη.' },
]

export default async function ProgrammataPage() {
  const [programs, deadlines] = await Promise.all([listPublicPrograms(), listDeadlines()])
  const next = deadlines.find(d => d.deadline)
  const n = programs.length
  return (
    <>
      <JsonLd data={itemListJsonLd('Ενεργά προγράμματα ΕΣΠΑ 2026', programs.map(p => ({ name: p.title, href: `/programmata/${p.slug}` })))} />
      <section className="sub-banner" lang="el">
        <img src={wwaPhoto('consulting')} alt="" />
        <div className="wrap"><div className="content">
          <div className="crumbs"><Link href="/">Αρχική</Link><span aria-hidden>›</span><span>Προγράμματα</span></div>
          <h1>Ενεργά Προγράμματα ΕΣΠΑ 2026</h1>
          <p style={{ marginTop: 14, fontSize: 17, color: 'rgba(255,255,255,.85)', maxWidth: '52ch' }}>
            Επιλέξτε το πρόγραμμα που σας αφορά ή ελέγξτε δωρεάν την επιλεξιμότητά σας σε όλα τα ενεργά.
          </p>
          <div className="meta"><EligibilityCta size="lg">Δείτε αν δικαιούστε</EligibilityCta></div>
        </div></div>
      </section>

      <section lang="el" style={{ paddingBottom: 0 }}>
        <div className="wrap">
          <AnswerBox updated={new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}>
            Αυτή τη στιγμή είναι ανοιχτ{n === 1 ? 'ό' : 'ά'} <b>{nProgramms(n)} ΕΣΠΑ για επιχειρήσεις</b>
            {programs.some(p => p.rate) && <>, με επιδότηση {programs.map(p => p.rate).filter(Boolean).join(' / ')}</>}.
            {next?.deadline && <> Η πλησιέστερη προθεσμία λήγει στις <b>{next.deadline.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</b> (<Link href="/prothesmies-espa">όλες οι προθεσμίες</Link>).</>}
            {' '}Ελέγξτε δωρεάν, με τον ΑΦΜ σας, σε ποια είναι επιλέξιμη η επιχείρησή σας.
          </AnswerBox>
        </div>
      </section>

      <section className="alt" lang="el">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">01</span>Προγράμματα ΕΣΠΑ 2021–2027</span>
            <h2>Ενεργές προκηρύξεις</h2>
            <p>{programs.length} ενεργά προγράμματα αυτή τη στιγμή.</p>
          </div>
          {programs.length === 0 ? (
            <p className="r" style={{ textAlign: 'center', color: 'var(--fg-3)' }}>Δεν υπάρχουν ενεργά προγράμματα αυτή τη στιγμή. Κάντε τον δωρεάν έλεγχο και θα σας ενημερώσουμε μόλις ανοίξει σχετική δράση.</p>
          ) : (
            <div className="cards3">
              {programs.map((p, i) => (
                <ProgramCard
                  key={p.slug}
                  image={p.image}
                  title={p.title}
                  description={p.summary}
                  budget={p.budget}
                  rate={p.rate}
                  deadline={p.deadline ?? undefined}
                  deadlineOpen={p.deadlineOpen}
                  region={p.region ?? undefined}
                  status="active"
                  isNew={i === 0}
                  href={`/programmata/${p.slug}`}
                />
              ))}
            </div>
          )}
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div className="hub-links r" style={{ marginTop: 0 }}>
            <h3>Βρείτε προγράμματα για την περιοχή και τον κλάδο σας</h3>
            <ul>
              <li><Link href="/programmata/nea-2026">Νέα & αναμενόμενα προγράμματα 2026</Link></li>
              <li><Link href="/prothesmies-espa">Προθεσμίες ΕΣΠΑ</Link></li>
              {REGIONS.map(r => <li key={r.slug}><Link href={`/espa/${r.slug}`}>ΕΣΠΑ {r.short}</Link></li>)}
              {SECTORS.map(s => <li key={s.slug}><Link href={`/espa/klados/${s.slug}`}>ΕΣΠΑ για {s.short}</Link></li>)}
            </ul>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="02" subtitle="Τα πιο συχνά ερωτήματα για τα ενεργά προγράμματα." />
    </>
  )
}
