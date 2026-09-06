/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SubBanner } from '../../_components/sub-banner'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Button } from '../../_components/button'
import { IconLinkedin, IconMail, IconLink } from '../../_components/icons'
import { wwaPhoto } from '../../_wwa/assets'
import { getPublishedPostBySlug, listPublishedPosts } from '@/lib/cms/public-posts'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPublishedPostBySlug(slug)
  if (!p) return { title: 'Νέα — World Wide Associates' }
  return {
    title: p.seoTitle || `${p.title} — World Wide Associates`,
    description: p.seoDescription || p.excerpt || undefined,
  }
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getPublishedPostBySlug(slug)
  if (!p) notFound()

  const related = (await listPublishedPosts(6)).filter(r => r.slug !== slug).slice(0, 3)

  return (
    <>
      <SubBanner
        image={p.image || wwaPhoto('ecommerce')}
        crumbs={[{ label: 'Νέα', href: '/nea' }, { label: p.title }]}
        title={p.title}
        meta={<>{p.category && <span className="badge badge-active">{p.category}</span>}<span className="badge badge-nodot">{p.date}</span></>}
      />

      <section lang="el">
        <div className="wrap layout">
          <div className="article">
            <div className="art-meta">
              {p.author && <><span>Από {p.author}</span><span>·</span></>}
              {p.category && <><span>{p.category}</span><span>·</span></>}
              <span>Δημοσιεύτηκε {p.date}</span>
            </div>
            {p.excerpt && <p className="lead">{p.excerpt}</p>}
            <div className="post-body">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
            </div>

            {p.otherImages.length > 0 && (
              <div className="post-gallery">
                {p.otherImages.map((src, i) => <img key={i} src={src} alt="" />)}
              </div>
            )}

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
            <div className="aside-box"><h4>Ζητήστε δωρεάν αξιολόγηση</h4><p style={{ fontSize: 14, color: 'var(--fg-2)', marginBottom: 12 }}>Δείτε σε μία εργάσιμη σε ποια ενεργά προγράμματα είναι επιλέξιμη η επιχείρησή σας.</p><EligibilityCta size="sm" className="btn-block">Έλεγχος επιλεξιμότητας</EligibilityCta></div>
            {related.length > 0 && (
              <div className="aside-box"><h4>Σχετικά άρθρα</h4><ul>
                {related.map(r => <li key={r.slug}><Link href={`/nea/${r.slug}`}>{r.title}</Link><span>{r.date}</span></li>)}
              </ul></div>
            )}
            <div className="aside-box" style={{ background: 'var(--navy-50)', boxShadow: 'none' }}><h4>Newsletter</h4><p style={{ fontSize: 14, color: 'var(--fg-2)', marginBottom: 12 }}>Ένα email τον μήνα για νέες προκηρύξεις.</p><div style={{ display: 'grid', gap: 8 }}><input className="input" type="email" placeholder="email@epixeirisi.gr" aria-label="Email" /><Button href="/epikoinonia" size="sm">Εγγραφή</Button></div></div>
          </aside>
        </div>
      </section>

      {related.length > 0 && (
        <section lang="el" className="alt">
          <div className="wrap">
            <div className="sec-head"><span className="eyebrow"><span className="idx">02</span>Διαβάστε επίσης</span><h2>Σχετικά άρθρα</h2></div>
            <div className="cards3">
              {related.map(r => (
                <article key={r.slug} className="card card-hover ncard r">
                  <div className="media"><img src={r.image || wwaPhoto('consulting')} alt="" /></div>
                  <div className="body"><div className="date">{r.category && <span className="badge badge-active">{r.category}</span>}{r.date}</div><h3><Link href={`/nea/${r.slug}`}>{r.title}</Link></h3></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
