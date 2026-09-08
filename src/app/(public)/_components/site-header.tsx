'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { openEligibility } from './eligibility-modal'
import { wwaLogoDark } from '../_wwa/assets'

/**
 * WWA public header — utility bar (navy-950) + sticky λευκό topbar με λογότυπο,
 * ΚΕΦΑΛΑΙΑ Condensed nav, «Σύνδεση» + pill CTA «Δωρεάν αξιολόγηση». Client για
 * το mobile burger + active nav (usePathname). Το header shadow-on-scroll το
 * χειρίζεται το WwaMotion.
 */
const NAV = [
  { label: 'Αρχική', href: '/' },
  { label: 'Προγράμματα ΕΣΠΑ', href: '/programmata' },
  { label: 'Υπηρεσίες', href: '/ypiresies' },
  { label: 'Εταιρεία', href: '/etaireia' },
  { label: 'Νέα', href: '/nea' },
  { label: 'Επικοινωνία', href: '/epikoinonia' },
]

function useActive() {
  const pathname = usePathname()
  return (href: string) => (href === '/' ? pathname === '/' : pathname === href || pathname.startsWith(`${href}/`))
}

export function SiteHeader() {
  const [open, setOpen] = useState(false)
  const isActive = useActive()
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
            <img src={wwaLogoDark} alt="World Wide Associates" />
          </Link>
          <nav lang="el" aria-label="Κύριο μενού">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined}>{n.label}</Link>
            ))}
          </nav>
          <div className="cta">
            <a className="login" href="/login">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
              Σύνδεση
            </a>
            <button type="button" className="btn btn-sm hide-mobile" onClick={openEligibility}>Δωρεάν αξιολόγηση</button>
            <button className="btn btn-ghost btn-icon btn-sm burger" aria-label="Μενού" aria-expanded={open} onClick={() => setOpen(v => !v)}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
            </button>
          </div>
        </div>
        {open && <div className="wwa-mnav-backdrop" aria-hidden onClick={() => setOpen(false)} />}
        {open && (
          <nav lang="el" aria-label="Κινητό μενού" className="wwa-mobile-nav">
            {NAV.map(n => (
              <Link key={n.href} href={n.href} aria-current={isActive(n.href) ? 'page' : undefined} onClick={() => setOpen(false)}>{n.label}</Link>
            ))}
            <div className="mnav-actions">
              <a className="mnav-login" href="/login" onClick={() => setOpen(false)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" /></svg>
                Σύνδεση
              </a>
              <button type="button" className="btn btn-sm" onClick={() => { setOpen(false); openEligibility() }}>Δωρεάν αξιολόγηση</button>
            </div>
          </nav>
        )}
      </header>
    </>
  )
}
