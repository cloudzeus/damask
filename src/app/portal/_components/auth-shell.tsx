/* eslint-disable @next/next/no-img-element -- λογότυπο/φωτογραφία από το CDN */
import Link from 'next/link'
import { wwaLogoDark, wwaPhoto } from '../../(public)/_wwa/assets'
import '../portal.css'

/** Κέλυφος σελίδων σύνδεσης/ανάκτησης κωδικού (ίδιο για προσωπικό & πελάτες) — ύφος δημόσιου site. */
export function AuthShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="wwa-portal p-auth" lang="el">
      <header className="p-top"><div className="p-wrap"><Link href="/" aria-label="World Wide Associates — αρχική"><img src={wwaLogoDark} alt="World Wide Associates" /></Link></div></header>
      <main className="p-auth-main">
        <img className="p-auth-bg" src={wwaPhoto('consulting')} alt="" />
        <div className="p-auth-card">{children}</div>
      </main>
      <footer className="p-foot"><div className="p-wrap"><span>World Wide Associates Ε.Ε. · Αλεξανδρουπόλεως 25, Αθήνα 115 27</span><span><a href="tel:+302107218758">210 721 8758</a> · <a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a></span></div></footer>
    </div>
  )
}
