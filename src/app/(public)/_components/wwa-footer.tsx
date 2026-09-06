import Link from 'next/link'

/**
 * WWA public footer — λευκό, 4 στήλες + legal bar. Δομή από ui_kits/wwa-web.
 * (Διαφορετικό από το admin site-footer.tsx — αυτό είναι μόνο για το public site.)
 */
export function WwaFooter() {
  return (
    <footer lang="el" className="footer">
      <div className="wrap">
        <div className="cols">
          <div className="about">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wwa/wwa-logo-dark-text.svg" alt="World Wide Associates" style={{ height: 40 }} />
            <p>World Wide Associates Ε.Ε. — σύμβουλοι διαχείρισης και αξιοποίησης ΕΣΠΑ και ευρωπαϊκών χρηματοδοτικών εργαλείων. Έδρα: Αθήνα.</p>
          </div>
          <div>
            <h4>Εταιρεία</h4>
            <ul>
              <li><Link href="/#company">Η εταιρεία</Link></li>
              <li><Link href="/#services">Υπηρεσίες</Link></li>
              <li><Link href="/#company">Πελάτες</Link></li>
              <li><Link href="/#news">Νέα</Link></li>
            </ul>
          </div>
          <div>
            <h4>Προγράμματα</h4>
            <ul>
              <li><Link href="/programmata">Ενεργά</Link></li>
              <li><Link href="/programmata">Σε υλοποίηση</Link></li>
              <li><Link href="/programmata">Ολοκληρωμένα</Link></li>
              <li><Link href="/programmata">Αναπτυξιακός Νόμος</Link></li>
            </ul>
          </div>
          <div>
            <h4>Επικοινωνία</h4>
            <ul>
              <li>Αλεξανδρουπόλεως 25, Αθήνα 115 27</li>
              <li><a href="tel:+302107218758">210 721 8758</a></li>
              <li><a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a></li>
            </ul>
          </div>
        </div>
        <div className="legal">
          <span>© {new Date().getFullYear()} World Wide Associates Ε.Ε.</span>
          <span><Link href="/legal/privacy">Πολιτική απορρήτου</Link> · <Link href="/legal/cookies">Πολιτική cookies</Link> · <Link href="/legal/terms">Όροι χρήσης</Link></span>
        </div>
      </div>
    </footer>
  )
}
