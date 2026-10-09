import { LuBellRing, LuCheck, LuMapPin, LuSparkles } from 'react-icons/lu'
import { EligibilityCta } from './eligibility-cta'

/**
 * Εμβόλιμο CTA «Ενημερωθείτε πρώτοι»: ανοίγει το modal σε mode 'notify' (ΑΦΜ + email + τηλέφωνο, επιβεβαίωση
 * email, ρητή συναίνεση). Χρώματα από τις «κορδέλες» του λογότυπου, πάνω σε navy — δεξιά ένα ΕΝΔΕΙΚΤΙΚΟ
 * παράδειγμα ειδοποίησης ώστε να φαίνεται τι θα λάβει ο χρήστης.
 */
export function NotifyBanner({ title = 'Μη χάσετε το επόμενο πρόγραμμα', compact = false }: { title?: string; compact?: boolean }) {
  return (
    <section lang="el" className={`notifyb-sec${compact ? ' is-compact' : ''}`} aria-labelledby="notifyb-t">
      <div className="wrap">
        <div className="notifyb r">
          <span className="notifyb-ribbons" aria-hidden><i /><i /><i /><i /></span>
          <div className="notifyb-body">
            <span className="notifyb-eyebrow"><span className="dot" aria-hidden />Ειδοποιήσεις νέων προγραμμάτων</span>
            <h2 id="notifyb-t">{title}</h2>
            <p>Αφήστε ΑΦΜ, email και τηλέφωνο. Μόλις ανοίξει πρόγραμμα που ταιριάζει στον ΚΑΔ και την περιοχή της επιχείρησής σας, σας ειδοποιούμε <b>πρώτους</b> — πριν τρέξουν οι προθεσμίες.</p>
            <ul className="notifyb-checks">
              <li><LuCheck aria-hidden />Δωρεάν, χωρίς δέσμευση</li>
              <li><LuCheck aria-hidden />Μόνο ό,τι σας αφορά</li>
              <li><LuCheck aria-hidden />Διαγραφή με ένα κλικ</li>
            </ul>
            <EligibilityCta mode="notify" variant="inverse" size="lg" className="notifyb-btn"><LuBellRing aria-hidden /> Ενημερώστε με</EligibilityCta>
          </div>
          <div className="notifyb-demo" aria-hidden>
            <div className="notifyb-card">
              <span className="notifyb-card-ic"><LuBellRing /></span>
              <div>
                <small>Μόλις τώρα · World Wide Associates</small>
                <b>Άνοιξε νέο πρόγραμμα για την επιχείρησή σας</b>
                <span className="tags"><em><LuSparkles /> Ταιριάζει στον ΚΑΔ σας</em><em><LuMapPin /> Η περιοχή σας</em></span>
              </div>
            </div>
            <div className="notifyb-card is-back"><span className="notifyb-card-ic"><LuBellRing /></span><div><small>Υπενθύμιση</small><b>Λήγει σε 10 ημέρες η υποβολή</b></div></div>
            <span className="notifyb-demo-cap">Παράδειγμα ειδοποίησης</span>
          </div>
        </div>
      </div>
    </section>
  )
}
