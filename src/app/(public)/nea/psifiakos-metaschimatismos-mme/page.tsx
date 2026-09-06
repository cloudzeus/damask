/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../../_components/sub-banner'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Button } from '../../_components/button'
import { Faq, type FaqItem } from '../../_components/faq'
import { IconInfo, IconLinkedin, IconMail, IconLink } from '../../_components/icons'
import { wwaPhoto } from '../../_wwa/assets'

export const metadata: Metadata = {
  title: 'Ψηφιακός Μετασχηματισμός ΜμΕ: τι φέρνει ο νέος κύκλος | WWA',
  description: 'Τρεις δράσεις, νέες προϋποθέσεις για λογισμικό και cloud, και γιατί αξίζει να προετοιμάσετε φάκελο ΕΣΠΑ από τώρα.',
}

const FAQS: FaqItem[] = [
  { q: 'Πότε ανοίγει ο νέος κύκλος του Ψηφιακού Μετασχηματισμού ΜμΕ;', a: 'Αναμένεται το τέταρτο τρίμηνο του 2026. Η ακριβής ημερομηνία ορίζεται με την προκήρυξη· η προδημοσίευση επιτρέπει την προετοιμασία του φακέλου από τώρα.' },
  { q: 'Ποιο είναι το ποσοστό επιδότησης;', a: 'Έως 50% επί των επιλέξιμων δαπανών, ανάλογα με τη δράση (βασικός, προηγμένος, αιχμής) και την περιφέρεια της επιχείρησης.' },
  { q: 'Είναι επιλέξιμο το λογισμικό ως υπηρεσία (SaaS);', a: 'Ναι, με βάση τα ανακοινωθέντα, έως 24 μήνες συνδρομής. Οι δαπάνες cloud και φιλοξενίας αναγνωρίζονται ως λειτουργικές δαπάνες.' },
  { q: 'Μπορεί μια επιχείρηση χωρίς e‑shop να ενταχθεί;', a: 'Ναι — αυτές ακριβώς αφορά ο Βασικός Ψηφιακός Μετασχηματισμός: ERP, e‑shop, ηλεκτρονική τιμολόγηση για επιχειρήσεις χωρίς βασικές ψηφιακές υποδομές.' },
]

export default function ArticlePage() {
  return (
    <>
      <SubBanner
        image={wwaPhoto('ecommerce')}
        crumbs={[{ label: 'Νέα', href: '/nea' }, { label: 'Ψηφιακός Μετασχηματισμός ΜμΕ' }]}
        title="ΨΗΦΙΑΚΟΣ ΜΕΤΑΣΧΗΜΑΤΙΣΜΟΣ ΜμΕ"
        sub={<>Τι φέρνει ο <span style={{ color: 'var(--wwa-cyan-400)' }}>νέος κύκλος</span></>}
        lead="Τρεις δράσεις, νέες προϋποθέσεις για λογισμικό και cloud, και ένας λόγος να προετοιμάσετε φάκελο από τώρα."
        meta={<><span className="badge badge-upcoming">Αναμένεται</span><span className="badge badge-nodot">04/09/2026</span><span className="badge badge-nodot">6 λεπτά ανάγνωση</span></>}
      />

      <section lang="el">
        <div className="wrap layout">
          <div className="article">
            <div className="art-meta"><span>Από την ομάδα WWA</span><span>·</span><span>Προκηρύξεις</span><span>·</span><span>Ενημερώθηκε 05/09/2026</span></div>
            <p className="lead">Ο νέος κύκλος του Ψηφιακού Μετασχηματισμού ΜμΕ αναμένεται το τέταρτο τρίμηνο του 2026 με τρεις διακριτές δράσεις. Οι αλλαγές στις επιλέξιμες δαπάνες αφορούν κυρίως το λογισμικό ως υπηρεσία και τις δαπάνες cloud.</p>
            <h2>Οι τρεις δράσεις</h2>
            <p><b>Βασικός Ψηφιακός Μετασχηματισμός</b> για επιχειρήσεις που δεν έχουν ακόμη βασικές ψηφιακές υποδομές: ERP, e‑shop, ηλεκτρονική τιμολόγηση. <b>Προηγμένος</b> για επιχειρήσεις που θέλουν να ολοκληρώσουν συστήματα και να αυτοματοποιήσουν διαδικασίες. <b>Αιχμής</b> για επενδύσεις σε τεχνητή νοημοσύνη, IoT και ρομποτική.</p>
            <div className="photo"><img src={wwaPhoto('ecommerce')} alt="" /></div>
            <p className="caption">Αποθήκη e‑shop πελάτη μετά την ένταξη στον προηγμένο ψηφιακό μετασχηματισμό.</p>
            <h2>Τι αλλάζει στις δαπάνες</h2>
            <ul>
              <li>Λογισμικό ως υπηρεσία (SaaS) επιλέξιμο έως 24 μήνες συνδρομής</li>
              <li>Δαπάνες cloud και φιλοξενίας επιλέξιμες ως λειτουργικές</li>
              <li>Υποχρεωτική διασύνδεση με ηλεκτρονική τιμολόγηση</li>
              <li>Ανώτατο όριο για hardware στο 30% του προϋπολογισμού</li>
            </ul>
            <h2>Ποιοι πρέπει να προετοιμαστούν από τώρα</h2>
            <p>Επιχειρήσεις λιανεμπορίου με φυσικό κατάστημα και χωρίς e‑shop, μεταποιητικές μονάδες χωρίς ERP, και εταιρείες υπηρεσιών που θέλουν CRM και αυτοματισμούς. Η συγκριτική αξιολόγηση ευνοεί όσους υποβάλουν πλήρη φάκελο τις πρώτες ημέρες.</p>
            <div className="note"><IconInfo /><span>Θέλετε να μάθετε σε ποια δράση ταιριάζει η επιχείρησή σας; Ο δωρεάν έλεγχος επιλεξιμότητας απαντά σε μία εργάσιμη.</span></div>
            <div style={{ display: 'flex', gap: '12px 24px', alignItems: 'center', flexWrap: 'wrap', marginTop: 24 }}>
              <EligibilityCta>Δείτε αν δικαιούστε</EligibilityCta>
              <div className="share">
                <a href="#" aria-label="LinkedIn"><IconLinkedin /></a>
                <a href="#" aria-label="Email"><IconMail /></a>
                <a href="#" aria-label="Αντιγραφή συνδέσμου"><IconLink /></a>
              </div>
            </div>
          </div>

          <aside>
            <div className="aside-box"><h4>Σχετικό πρόγραμμα</h4><ul><li><Link href="/programmata">Ψηφιακός Μετασχηματισμός ΜμΕ — νέος κύκλος</Link><span>Αναμένεται Q4 2026 · έως 50%</span></li></ul><Button href="/epikoinonia" size="sm" variant="outline" style={{ marginTop: 14 }}>Ενημερώστε με όταν ανοίξει</Button></div>
            <div className="aside-box"><h4>Σχετικά άρθρα</h4><ul>
              <li><Link href="/nea">Παράγουμε στην Ελλάδα: οδηγός επιλέξιμων δαπανών</Link><span>28/08/2026</span></li>
              <li><Link href="/nea">Ξεκινώ Επιχειρηματικά 2026: οι 7 πιο συχνές αιτίες απόρριψης</Link><span>12/08/2026</span></li>
              <li><Link href="/nea">Πώς βαθμολογείται ένα επενδυτικό σχέδιο</Link><span>02/07/2026</span></li>
            </ul></div>
            <div className="aside-box" style={{ background: 'var(--navy-50)', boxShadow: 'none' }}><h4>Newsletter</h4><p style={{ fontSize: 14, color: 'var(--fg-2)', marginBottom: 12 }}>Ένα email τον μήνα για νέες προκηρύξεις.</p><div style={{ display: 'grid', gap: 8 }}><input className="input" type="email" placeholder="email@epixeirisi.gr" aria-label="Email" /><Button href="/epikoinonia" size="sm">Εγγραφή</Button></div></div>
          </aside>
        </div>
      </section>

      <Faq items={FAQS} idx="03" title="Συχνές ερωτήσεις για το άρθρο" subtitle="Οι απαντήσεις βασίζονται στην προδημοσίευση και ενημερώνονται με την προκήρυξη." />
    </>
  )
}
