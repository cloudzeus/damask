/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * WWA sub-banner (εσωτερικές σελίδες): φωτογραφία 320px+ με navy overlay,
 * breadcrumbs, h1, προαιρετικό subtitle/meta. Entrance animation μέσω .anim-in.
 */
export type Crumb = { label: string; href?: string }

export function SubBanner({
  image, imageAlt = '', crumbs, title, sub, lead, meta, typewrite, badges,
}: {
  image: string
  /** Περιγραφή της φωτογραφίας όταν είναι το κύριο οπτικό του περιεχομένου (άρθρα/προγράμματα — Google Images). */
  imageAlt?: string
  crumbs: Crumb[]
  title: ReactNode
  sub?: ReactNode
  lead?: ReactNode
  meta?: ReactNode
  badges?: ReactNode
  typewrite?: boolean
}) {
  return (
    <section className="sub-banner" lang="el">
      <img src={image} alt={imageAlt} fetchPriority="high" />
      <div className="wrap"><div className="content anim-in">
        <div className="crumbs">
          <Link href="/">Αρχική</Link>
          {crumbs.map((c, i) => (
            <span key={i} style={{ display: 'contents' }}>
              <span aria-hidden>›</span>
              {c.href ? <Link href={c.href}>{c.label}</Link> : <span>{c.label}</span>}
            </span>
          ))}
        </div>
        {badges && <div className="hero-badges">{badges}</div>}
        <h1 {...(typewrite ? { 'data-typewrite': true } : {})}>{title}</h1>
        {sub && <p className="sub">{sub}</p>}
        {lead && <p className="lead">{lead}</p>}
        {meta && <div className="meta">{meta}</div>}
      </div></div>
      <span className="sub-banner-rule" aria-hidden />
    </section>
  )
}
