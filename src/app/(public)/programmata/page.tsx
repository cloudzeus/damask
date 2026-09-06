/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { ProgramCard } from '../_components/program-card'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Faq, type FaqItem } from '../_components/faq'
import { wwaPhoto } from '../_wwa/assets'
import { listPublicPrograms } from '@/lib/programs/public'

export const metadata: Metadata = {
  title: 'Ενεργά προγράμματα ΕΣΠΑ — World Wide Associates',
  description: 'Δείτε τα ενεργά επιδοτούμενα προγράμματα ΕΣΠΑ και ελέγξτε δωρεάν σε ποια είναι επιλέξιμη η επιχείρησή σας, σε μία εργάσιμη.',
}

const FAQS: FaqItem[] = [
  { q: 'Ποια προγράμματα ΕΣΠΑ είναι ενεργά τώρα;', a: 'Στη σελίδα εμφανίζονται όλες οι ενεργές προκηρύξεις. Κάθε πρόγραμμα έχει διαφορετικούς όρους (μέγεθος επιχείρησης, ΚΑΔ, περιφέρεια, ύψος επένδυσης) — με τον δωρεάν έλεγχο βλέπετε ποια σας αφορούν.' },
  { q: 'Πώς ξέρω σε ποιο πρόγραμμα ταιριάζει η επιχείρησή μου;', a: 'Κάντε τον δωρεάν έλεγχο επιλεξιμότητας: με ΑΦΜ, email και τηλέφωνο εντοπίζουμε αυτόματα ΚΑΔ και περιφέρεια και σας λέμε σε μία εργάσιμη ποια ενεργά προγράμματα σας αφορούν.' },
  { q: 'Πόσο κοστίζει η υποβολή μέσω της WWA;', a: 'Ο έλεγχος επιλεξιμότητας είναι δωρεάν και η αμοιβή σύνταξης είναι αμοιβή επιτυχίας — πληρώνεται μετά την έγκριση. Στα περισσότερα προγράμματα η αμοιβή συμβούλου είναι επιλέξιμη δαπάνη.' },
]

export default async function ProgrammataPage() {
  const programs = await listPublicPrograms()
  return (
    <>
      <section className="sub-banner" lang="el">
        <img src={wwaPhoto('consulting')} alt="" />
        <div className="wrap"><div className="content">
          <div className="crumbs"><Link href="/">Αρχική</Link><span aria-hidden>›</span><span>Προγράμματα</span></div>
          <h1>Ενεργά προγράμματα ΕΣΠΑ</h1>
          <p style={{ marginTop: 14, fontSize: 17, color: 'rgba(255,255,255,.85)', maxWidth: '52ch' }}>
            Επιλέξτε το πρόγραμμα που σας αφορά ή ελέγξτε δωρεάν την επιλεξιμότητά σας σε όλα τα ενεργά.
          </p>
          <div className="meta"><EligibilityCta size="lg">Δείτε αν δικαιούστε</EligibilityCta></div>
        </div></div>
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

      <Faq items={FAQS} idx="02" subtitle="Τα πιο συχνά ερωτήματα για τα ενεργά προγράμματα." />
    </>
  )
}
