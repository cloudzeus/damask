/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { Button } from '../_components/button'
import { Faq, type FaqItem } from '../_components/faq'
import { wwaPhoto, type WwaPhoto } from '../_wwa/assets'

export const metadata: Metadata = {
  title: 'Νέα & προκηρύξεις ΕΣΠΑ — World Wide Associates',
  description: 'Νέες προκηρύξεις, τροποποιήσεις, παρατάσεις και οδηγοί επιλέξιμων δαπανών ΕΣΠΑ. Ένα email τον μήνα για όσους εγγραφούν.',
}

const FAQS: FaqItem[] = [
  { q: 'Πόσο συχνά ανοίγουν νέα προγράμματα ΕΣΠΑ;', a: 'Σε ολόκληρη την περίοδο 2021–2027 προκηρύσσονται συνεχώς δράσεις, εθνικές και περιφερειακές. Συνήθως ανοίγουν 4–8 νέες προκηρύξεις τον χρόνο που αφορούν ΜμΕ, με ανοιχτές περιόδους υποβολής 1–3 μηνών.' },
  { q: 'Πώς θα μάθω έγκαιρα για μια νέα προκήρυξη;', a: 'Εγγραφείτε στο μηνιαίο newsletter της WWA ή ζητήστε ενημέρωση σε συγκεκριμένο πρόγραμμα με την ένδειξη «Αναμένεται». Ενημερώνουμε την ημέρα της προδημοσίευσης, ώστε να προλάβετε την προετοιμασία.' },
  { q: 'Τι σημαίνει προδημοσίευση προγράμματος;', a: 'Είναι η επίσημη ανακοίνωση των βασικών όρων (δικαιούχοι, δαπάνες, ποσοστά) πριν την προκήρυξη. Επιτρέπει την προετοιμασία του φακέλου ώστε η υποβολή να γίνει τις πρώτες ημέρες.' },
  { q: 'Ενημερώνετε για παρατάσεις και τροποποιήσεις;', a: 'Ναι. Κάθε παράταση προθεσμίας ή τροποποίηση όρων δημοσιεύεται εδώ και αποστέλλεται στους πελάτες που έχουν έργο στο συγκεκριμένο πρόγραμμα.' },
]

type Post = { photo: WwaPhoto; badgeCls: string; badge: string; date: string; title: string; text: string; href?: string }
const POSTS: Post[] = [
  { photo: 'manufacturing', badgeCls: 'badge-active', badge: 'Ενεργό', date: '28/08/2026', title: 'Παράγουμε στην Ελλάδα: οδηγός επιλέξιμων δαπανών', text: 'Τι καλύπτεται σε μηχανήματα, κτιριακά, πιστοποιήσεις και τι εξαιρείται ρητά από την προκήρυξη.' },
  { photo: 'hotel', badgeCls: 'badge-running', badge: 'Σε υλοποίηση', date: '19/08/2026', title: 'Πράσινη Παραγωγική Επένδυση: παράταση 6 μηνών', text: 'Νέα προθεσμία ολοκλήρωσης φυσικού και οικονομικού αντικειμένου — τι πρέπει να κάνετε τώρα.' },
  { photo: 'startup', badgeCls: 'badge-active', badge: 'Ενεργό', date: '12/08/2026', title: 'Ξεκινώ Επιχειρηματικά 2026: οι 7 πιο συχνές αιτίες απόρριψης', text: 'ΚΑΔ, ημερομηνία έναρξης, μη επιλέξιμες δαπάνες — πώς να τις αποφύγετε πριν την υποβολή.' },
  { photo: 'cosmetics', badgeCls: 'badge-upcoming', badge: 'Αναμένεται', date: '30/07/2026', title: 'Εξωστρέφεια ΜμΕ 2027: τι γνωρίζουμε μέχρι τώρα', text: 'Εκθέσεις, πιστοποιήσεις εξαγωγών και branding — ποιες δαπάνες θα είναι επιλέξιμες.' },
  { photo: 'team', badgeCls: 'badge-closed', badge: 'Εταιρικά', date: '15/07/2026', title: 'Η WWA επίσημος σύμβουλος του ΣΕΔΕ', text: 'Νέα συνεργασία για τις επιχειρήσεις‑μέλη του Συνδέσμου Επιχειρήσεων Διαδικτύου.' },
  { photo: 'consulting', badgeCls: 'badge-closed', badge: 'Οδηγός', date: '02/07/2026', title: 'Πώς βαθμολογείται ένα επενδυτικό σχέδιο', text: 'Τα κριτήρια αξιολόγησης του ΕΣΠΑ 2021–2027 και πώς να κερδίσετε μονάδες πριν την υποβολή.' },
]

function NCard({ photo, badgeCls, badge, date, title, text, href = '#' }: Post) {
  return (
    <article className="card card-hover ncard r">
      <div className="media"><img src={wwaPhoto(photo)} alt="" /></div>
      <div className="body">
        <div className="date"><span className={`badge ${badgeCls}`}>{badge}</span>{date}</div>
        <h3><Link href={href}>{title}</Link></h3>
        <p>{text}</p>
      </div>
    </article>
  )
}

export default function NewsPage() {
  return (
    <>
      <SubBanner
        image={wwaPhoto('ecommerce')}
        crumbs={[{ label: 'Νέα' }]}
        title="ΝΕΑ & ΠΡΟΚΗΡΥΞΕΙΣ"
        sub={<>Ό,τι αλλάζει στο ΕΣΠΑ, <span style={{ color: 'var(--wwa-cyan-400)' }}>πριν</span> λήξει η προθεσμία</>}
        lead="Νέες προκηρύξεις, τροποποιήσεις, παρατάσεις και οδηγοί επιλέξιμων δαπανών. Ένα email τον μήνα για όσους εγγραφούν."
      />

      <section lang="el" className="alt">
        <div className="wrap">
          <article className="feat-post">
            <div className="photo square"><img src={wwaPhoto('ecommerce')} alt="" /></div>
            <div className="b">
              <div className="date" style={{ display: 'flex', gap: 10, alignItems: 'center', fontSize: 13, color: 'var(--fg-3)' }}><span className="badge badge-upcoming">Αναμένεται</span>04/09/2026</div>
              <h2>Ψηφιακός Μετασχηματισμός ΜμΕ: τι φέρνει ο νέος κύκλος</h2>
              <p>Τρεις δράσεις (βασικός, προηγμένος, αιχμής) με νέες προϋποθέσεις για λογισμικό, cloud και αυτοματισμούς. Ποιες επιχειρήσεις πρέπει να προετοιμάσουν φάκελο από τώρα.</p>
              <div><Button href="/nea/psifiakos-metaschimatismos-mme">Διαβάστε το άρθρο</Button></div>
            </div>
          </article>

          <div className="page-tabs">
            {['Όλα', 'Προκηρύξεις', 'Παρατάσεις', 'Οδηγοί', 'Εταιρικά'].map((t, i) => (
              <button key={t} className="chip" aria-pressed={i === 0}>{t}</button>
            ))}
          </div>

          <div className="cards3 cards-2rows">
            {POSTS.map(p => <NCard key={p.title} {...p} />)}
          </div>

          <div className="pager-wrap"><div className="pager"><a href="#">‹</a><a href="#" aria-current="page">1</a><a href="#">2</a><a href="#">3</a><span>…</span><a href="#">8</a><a href="#">›</a></div></div>
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--navy-50)', borderRadius: 'var(--radius-xl)', padding: 36, textAlign: 'center' }}>
            <span className="eyebrow"><span className="idx">02</span>Ενημερώσεις</span>
            <h2 style={{ marginTop: 10 }}>Μάθετε πρώτοι για κάθε νέα προκήρυξη</h2>
            <p style={{ color: 'var(--fg-2)', marginTop: 8 }}>Ένα email τον μήνα. Καμία διαφήμιση.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
              <input className="input" style={{ maxWidth: 320 }} type="email" placeholder="email@epixeirisi.gr" aria-label="Email" />
              <Button href="/epikoinonia">Εγγραφή</Button>
            </div>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="03" subtitle="Τα πιο συχνά ερωτήματα για τις προκηρύξεις και τις ενημερώσεις." />
    </>
  )
}
