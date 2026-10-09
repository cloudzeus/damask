import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { EligibilityCta } from '../_components/eligibility-cta'
import { Faq } from '../_components/faq'
import { AnswerBox } from '../_components/program-grid'
import { JsonLd, breadcrumbJsonLd, organizationRef } from '../_components/json-ld'
import { wwaPhoto } from '../_wwa/assets'
import { listDeadlines } from '@/lib/seo-content/hubs'
import { absoluteUrl } from '@/lib/site-url'

export const revalidate = 3600
export const metadata: Metadata = {
  title: 'Προθεσμίες προγραμμάτων ΕΣΠΑ 2026 — ημερολόγιο υποβολών',
  description: 'Όλες οι προθεσμίες υποβολής των ενεργών προγραμμάτων ΕΣΠΑ για επιχειρήσεις, ταξινομημένες κατά ημερομηνία. Προσθέστε τις στο ημερολόγιό σας.',
  alternates: { canonical: '/prothesmies-espa' },
}

const fmt = (d: Date) => d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Europe/Athens' })

export default async function DeadlinesPage() {
  const rows = await listDeadlines()
  const next = rows.find(r => r.deadline)
  const events = rows.filter(r => r.deadline).map(r => ({
    '@context': 'https://schema.org', '@type': 'Event', name: `Λήξη υποβολών: ${r.title}`,
    startDate: r.deadline!.toISOString().slice(0, 10), endDate: r.deadline!.toISOString().slice(0, 10),
    eventStatus: 'https://schema.org/EventScheduled', eventAttendanceMode: 'https://schema.org/OnlineEventAttendanceMode',
    location: { '@type': 'VirtualLocation', url: absoluteUrl(`/programmata/${r.slug}`) },
    description: `Τελευταία ημέρα υποβολής αιτήσεων στο πρόγραμμα «${r.title}» (επιδότηση ${r.rate}).`,
    organizer: organizationRef, url: absoluteUrl(`/programmata/${r.slug}`),
  }))
  const faq = [
    { q: 'Πότε λήγει η επόμενη προθεσμία ΕΣΠΑ;', a: next ? `Η πλησιέστερη προθεσμία είναι στις ${fmt(next.deadline!)} για το πρόγραμμα «${next.title}». Η λίστα ενημερώνεται αυτόματα με κάθε νέα πρόσκληση ή παράταση.` : 'Αυτή τη στιγμή τα ενεργά προγράμματα δεν έχουν ορισμένη ημερομηνία λήξης ή υποβάλλονται έως εξάντλησης του προϋπολογισμού.' },
    { q: 'Τι σημαίνει «έως εξάντλησης»;', a: 'Ορισμένα προγράμματα αξιολογούν τις αιτήσεις με σειρά προτεραιότητας (FIFO): κλείνουν όταν καλυφθεί ο προϋπολογισμός, ακόμα και πριν από την επίσημη λήξη. Σε αυτά η έγκαιρη υποβολή μετράει.' },
    { q: 'Πόσο νωρίς πρέπει να ξεκινήσω την προετοιμασία;', a: 'Ιδανικά 3–4 εβδομάδες πριν: χρειάζονται ενημερότητες, προσφορές προμηθευτών, οικονομικά στοιχεία και Υπεύθυνες Δηλώσεις. Με τον δωρεάν έλεγχο σας λέμε τι λείπει.' },
    { q: 'Μπορώ να λαμβάνω τις προθεσμίες στο ημερολόγιό μου;', a: 'Ναι — με τον σύνδεσμο «Προσθήκη στο ημερολόγιο» (αρχείο .ics) οι προθεσμίες εμφανίζονται σε Google Calendar, Outlook ή Apple Calendar και ενημερώνονται αυτόματα.' },
  ]
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'Προθεσμίες ΕΣΠΑ' }])} />
      {events.map((e, i) => <JsonLd key={i} data={e} />)}
      <SubBanner image={wwaPhoto('consulting')} crumbs={[{ label: 'Προθεσμίες ΕΣΠΑ' }]} title="Προθεσμίες προγραμμάτων ΕΣΠΑ 2026"
        lead="Πότε λήγει η υποβολή σε κάθε ενεργό πρόγραμμα για επιχειρήσεις." meta={<EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta>} />
      <section lang="el">
        <div className="wrap">
          <AnswerBox updated={fmt(new Date())}>
            {next
              ? <>Η <b>επόμενη προθεσμία ΕΣΠΑ</b> λήγει στις <b>{fmt(next.deadline!)}</b> ({next.daysLeft} ημέρ{next.daysLeft === 1 ? 'α' : 'ες'}) για το «{next.title}». Συνολικά {rows.length} ενεργ{rows.length === 1 ? 'ό πρόγραμμα δέχεται' : 'ά προγράμματα δέχονται'} αιτήσεις — δείτε όλες τις ημερομηνίες παρακάτω.</>
              : <>Αυτή τη στιγμή {rows.length} ενεργ{rows.length === 1 ? 'ό πρόγραμμα δέχεται' : 'ά προγράμματα δέχονται'} αιτήσεις χωρίς ορισμένη ημερομηνία λήξης (έως εξάντλησης του προϋπολογισμού).</>}
          </AnswerBox>
          <div className="dl-wrap r">
            <table className="dl-table">
              <thead><tr><th>Πρόγραμμα</th><th>Λήξη υποβολών</th><th>Επιδότηση</th><th>Περιοχή</th></tr></thead>
              <tbody>
                {rows.map(r => (
                  <tr key={r.slug}>
                    <td><Link href={`/programmata/${r.slug}`}>{r.title}</Link></td>
                    <td className="num">{r.deadline ? <><time dateTime={r.deadline.toISOString().slice(0, 10)}>{fmt(r.deadline)}</time>{r.daysLeft != null && <><br /><span className={r.daysLeft <= 14 ? 'dl-soon' : ''}>σε {r.daysLeft} ημέρ{r.daysLeft === 1 ? 'α' : 'ες'}</span></>}</> : 'Έως εξάντλησης'}</td>
                    <td className="num">{r.rate}</td>
                    <td>{r.region}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="r" style={{ textAlign: 'center', marginTop: 24 }}>
            <a className="btn btn-outline" href="/prothesmies-espa.ics">Προσθήκη στο ημερολόγιο (.ics)</a>
          </p>
        </div>
      </section>
      <Faq items={faq} idx="02" title="Προθεσμίες ΕΣΠΑ: συχνές ερωτήσεις" />
    </>
  )
}
