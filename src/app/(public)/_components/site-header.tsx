'use client'

import { useState } from 'react'
import Link from 'next/link'

/**
 * WWA public header — utility bar (navy-950) + sticky λευκό topbar με λογότυπο,
 * ΚΕΦΑΛΑΙΑ Condensed nav, «Σύνδεση» + pill CTA «Δωρεάν αξιολόγηση». Client για
 * το mobile burger. Το header shadow-on-scroll το χειρίζεται το WwaMotion.
 */
const NAV = [
  { label: 'Αρχική', href: '/' },
  { label: 'Προγράμματα ΕΣΠΑ', href: '/#programs' },
  { label: 'Υπηρεσίες', href: '/#services' },
  { label: 'Εταιρεία', href: '/#company' },
  { label: 'Νέα', href: '/#news' },
  { label: 'Επικοινωνία', href: '/#contact' },
]

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  return (
    <>
      <div className="util" lang="el">
        <div className="wrap">
          <Link href="/#programs">Επιχειρήσεις</Link>
          <Link href="/#company">Εταιρεία</Link>
          <Link href="/#news">Ανακοινώσεις</Link>
          <div className="right">
            <a href="tel:+302107218758">210 721 8758</a>
            <a href="mailto:info@wwa-espa.com">info@wwa-espa.com</a>
            <Link href="/#contact">Αλεξανδρουπόλεως 25, Αθήνα</Link>
          </div>
        </div>
      </div>

      <header lang="el" className="topbar">
        <div className="wrap">
          <Link href="/" aria-label="World Wide Associates — Αρχική">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/wwa/wwa-logo-dark-text.svg" alt="World Wide Associates" />
          </Link>
          <nav lang="el" aria-label="Κύριο μενού">
            {NAV.map((n, i) => (
              <Link key={n.href} href={n.href} aria-current={i === 0 ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="cta">
            <a className="login" href="/login">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Σύνδεση
            </a>
            <Link className="btn btn-sm" href="/eligibility">Δωρεάν αξιολόγηση</Link>
            <button className="btn btn-ghost btn-icon btn-sm burger" aria-label="Μενού" aria-expanded={open} onClick={() => setOpen(v => !v)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>
        {open && (
          <nav lang="el" aria-label="Κινητό μενού" className="wwa-mobile-nav">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} onClick={() => setOpen(false)}>{n.label}</Link>
            ))}
            <Link className="btn btn-sm" href="/eligibility" onClick={() => setOpen(false)}>Δωρεάν αξιολόγηση</Link>
          </nav>
        )}
      </header>
    </>
  )
}
