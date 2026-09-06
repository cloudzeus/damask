/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { SubBanner } from '../../_components/sub-banner'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Button } from '../../_components/button'
import { IconLinkedin, IconMail, IconLink, IconCalendar, IconClock, IconUser, IconTag } from '../../_components/icons'
import { PostMeta } from '../../_components/post-meta'
import { wwaPhoto } from '../../_wwa/assets'
import { getPublishedPostBySlug, listPublishedPosts } from '@/lib/cms/public-posts'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPublishedPostBySlug(slug)
  if (!p) return { title: 'Νέα — World Wide Associates' }
  return {
    title: p.seoTitle || `${p.title} — World Wide Associates`,
    description: p.seoDescription || p.excerpt || undefined,
    openGraph: p.image ? { images: [p.image], title: p.title, description: p.excerpt } : undefined,
  }
}

function readingTime(body: string): number {
  const words = body.replace(/[#>*_`\-]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.round(words / 180))
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getPublishedPostBySlug(slug)
  if (!p) notFound()

  const related = (await listPublishedPosts(6)).filter(r => r.slug !== slug).slice(0, 3)
  const mins = readingTime(p.body)

  return (
    <>
      <SubBanner
        image={p.image || wwaPhoto('ecommerce')}
        crumbs={[{ label: 'Νέα', href: '/nea' }, { label: p.title }]}
        title={p.title}
        typewrite
        lead={p.excerpt || undefined}
        badges={
          <>
            {p.category && <span className="hbadge hbadge-cat"><IconTag />{p.category}</span>}
            <span className="hbadge hbadge-date"><IconCalendar />{p.date}</span>
            <span className="hbadge hbadge-read"><IconClock />{mins}′ ανάγνωση</span>
            {p.author && <span className="hbadge hbadge-author"><IconUser />{p.author}</span>}
          </>
        }
      />

      <section lang="el">
        <div className="wrap layout">
          <article className="article">
            <div className="post-body dropcap r">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
            </div>

            {p.otherImages.length > 0 && (
              <div className="post-gallery r">
                {p.otherImages.map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
              </div>
            )}

            <div className="post-cta r">
              <div>
                <h3>Δικαιούστε επιδότηση;</h3>
                <p>Δωρεάν έλεγχος επιλεξιμότητας — απάντηση σε μία εργάσιμη.</p>
              </div>
              <EligibilityCta size="lg">Δείτε αν δικαιούστε</EligibilityCta>
            </div>

            <div className="post-share r">
              <span>Κοινοποίηση</span>
              <div className="share">
                <a href="#" aria-label="Κοινοποίηση στο LinkedIn"><IconLinkedin /></a>
                <a href="#" aria-label="Κοινοποίηση με email"><IconMail /></a>
                <a href="#" aria-label="Αντιγραφή συνδέσμου"><IconLink /></a>
              </div>
            </div>
          </article>

          <aside>
            <div className="aside-box aside-cta r">
              <h4>Ζητήστε δωρεάν αξιολόγηση</h4>
              <p>Δείτε σε μία εργάσιμη σε ποια ενεργά προγράμματα είναι επιλέξιμη η επιχείρησή σας.</p>
              <EligibilityCta size="sm" variant="inverse" className="btn-block">Έλεγχος επιλεξιμότητας</EligibilityCta>
            </div>
            {related.length > 0 && (
              <div className="aside-box aside-related r"><h4>Σχετικά άρθρα</h4><ul>
                {related.map(r => (
                  <li key={r.slug}>
                    {r.image && <Link href={`/nea/${r.slug}`} className="thumb"><img src={r.image} alt="" loading="lazy" /></Link>}
                    <div className="rl-body">
                      <Link href={`/nea/${r.slug}`}>{r.title}</Link>
                      <PostMeta category={r.category} date={r.date} />
                    </div>
                  </li>
                ))}
              </ul></div>
            )}
            <div className="aside-box aside-news r"><h4>Newsletter</h4><p>Ένα email τον μήνα για νέες προκηρύξεις.</p><div className="nl"><input className="input" type="email" placeholder="email@epixeirisi.gr" aria-label="Email" /><Button href="/epikoinonia" size="sm">Εγγραφή</Button></div></div>
          </aside>
        </div>
      </section>

      {related.length > 0 && (
        <section lang="el" className="alt">
          <div className="wrap">
            <div className="sec-head r"><span className="eyebrow"><span className="idx">02</span>Διαβάστε επίσης</span><h2>Σχετικά άρθρα</h2></div>
            <div className="cards3">
              {related.map(r => (
                <article key={r.slug} className="card card-hover ncard r">
                  <div className="media"><img src={r.image || wwaPhoto('consulting')} alt="" loading="lazy" /></div>
                  <div className="body"><PostMeta category={r.category} date={r.date} /><h3><Link href={`/nea/${r.slug}`}>{r.title}</Link></h3></div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}
    </>
  )
}
