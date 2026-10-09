import Link from 'next/link'
import { wwaLogoLight } from '../_wwa/assets'

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
            <img src={wwaLogoLight} alt="World Wide Associates" style={{ height: 40 }} />
            <p>World Wide Associates Ε.Ε. — σύμβουλοι διαχείρισης και αξιοποίησης ΕΣΠΑ και ευρωπαϊκών χρηματοδοτικών εργαλείων. Έδρα: Αθήνα.</p>
          </div>
          <div>
            <h4>Εταιρεία</h4>
            <ul>
              <li><Link href="/etaireia">Η εταιρεία</Link></li>
              <li><Link href="/ypiresies">Υπηρεσίες</Link></li>
              <li><Link href="/pelates">Πελάτες</Link></li>
              <li><Link href="/nea">Οδηγοί & νέα</Link></li>
              <li><Link href="/typos">Η WWA στον Τύπο</Link></li>
              <li><Link href="/glossari">Γλωσσάριο ΕΣΠΑ</Link></li>
            </ul>
          </div>
          <div>
            <h4>Προγράμματα</h4>
            <ul>
              <li><Link href="/programmata">Ενεργά προγράμματα</Link></li>
              <li><Link href="/programmata/nea-2026">Νέα προγράμματα 2026</Link></li>
              <li><Link href="/prothesmies-espa">Προθεσμίες ΕΣΠΑ</Link></li>
              <li><Link href="/espa">ΕΣΠΑ ανά περιοχή & κλάδο</Link></li>
              <li><Link href="/ypiresies">Υπηρεσίες ΕΣΠΑ</Link></li>
              <li><Link href="/epikoinonia">Δωρεάν αξιολόγηση</Link></li>
            </ul>
          </div>
          <div>
            <h4>Επικοινωνία</h4>
            <ul>
              <li>Αλεξανδρουπόλεως 25, Αθήνα 115 27</li>
              <li><a href="tel:+302107218758">210 721 8758</a></li>
              <li><a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a></li>
              <li><a href="https://www.facebook.com/p/World-Wide-Associates-61568828876859/" target="_blank" rel="noopener me">Facebook</a></li>
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
