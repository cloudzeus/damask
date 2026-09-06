/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { ReactNode } from 'react'
import Link from 'next/link'

/**
 * WWA sub-banner (εσωτερικές σελίδες): φωτογραφία 320px+ με navy overlay,
 * breadcrumbs, h1, προαιρετικό subtitle/meta. Entrance animation μέσω .anim-in.
 */
export type Crumb = { label: string; href?: string }

export function SubBanner({
  image, crumbs, title, sub, lead, meta,
}: {
  image: string
  crumbs: Crumb[]
  title: ReactNode
  sub?: ReactNode
  lead?: ReactNode
  meta?: ReactNode
}) {
  return (
    <section className="sub-banner" lang="el">
      <img src={image} alt="" />
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
        <h1>{title}</h1>
        {sub && <p className="sub" style={{ marginTop: 8, fontSize: 20, color: '#fff', fontFamily: 'var(--font-display)', fontWeight: 900, textTransform: 'uppercase' }}>{sub}</p>}
        {lead && <p style={{ marginTop: 14, fontSize: 17, color: 'rgba(255,255,255,.85)', maxWidth: '58ch' }}>{lead}</p>}
        {meta && <div className="meta">{meta}</div>}
      </div></div>
    </section>
  )
}
