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
import { wwaPhotoFor } from '../../_wwa/assets'
import { getPublishedPostBySlug, listPublishedPosts } from '@/lib/cms/public-posts'
import { JsonLd, breadcrumbJsonLd, organizationRef } from '../../_components/json-ld'
import { KeyFacts, splitGlance } from '../../_components/key-facts'
import { absoluteUrl } from '@/lib/site-url'
import { listPublicPrograms } from '@/lib/programs/public'

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPublishedPostBySlug(slug)
  if (!p) return { title: 'Νέα — World Wide Associates' }
  const description = p.seoDescription || p.excerpt || undefined
  return {
    title: p.seoTitle || `${p.title} — World Wide Associates`,
    description,
    alternates: { canonical: `/nea/${p.slug}` },
    openGraph: {
      type: 'article', title: p.title, description, url: `/nea/${p.slug}`,
      publishedTime: p.dateIso, modifiedTime: p.updatedIso, authors: p.author ? [p.author] : undefined, section: p.category ?? undefined,
      images: p.image ? [p.image] : undefined,
    },
    twitter: { card: 'summary_large_image', title: p.title, description, images: p.image ? [p.image] : undefined },
  }
}

/** Ενότητα «Συχνές ερωτήσεις» του markdown (### ερώτηση + απάντηση) → FAQPage schema (ίδιο κείμενο με το ορατό). */
function faqFromMarkdown(body: string): { q: string; a: string }[] {
  const sec = body.split(/^##\s+/m).find(x => /^(Συχνές ερωτήσεις|Συχνές Ερωτήσεις|FAQ)/.test(x))
  if (!sec) return []
  return sec.split(/^###\s+/m).slice(1).map(block => {
    const [q, ...rest] = block.split('\n')
    return { q: q.replace(/[*_`]/g, '').trim(), a: rest.join(' ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim() }
  }).filter(x => x.q.length > 5 && x.a.length > 10).slice(0, 10)
}

function readingTime(body: string): number {
  const words = body.replace(/[#>*_`\-]/g, ' ').split(/\s+/).filter(Boolean).length
  return Math.max(2, Math.round(words / 180))
}

export default async function NewsArticlePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getPublishedPostBySlug(slug)
  if (!p) notFound()

  const [relatedAll, programsAll] = await Promise.all([listPublishedPosts(6, { press: false }), listPublicPrograms()])
  const related = relatedAll.filter(r => r.slug !== slug).slice(0, 3)
  // Σχετικά προγράμματα: πρώτα όσα αναφέρει το άρθρο, μετά τα υπόλοιπα ενεργά.
  const programs = [...programsAll].sort((a, b) => Number(p.body.includes(`/programmata/${b.slug}`)) - Number(p.body.includes(`/programmata/${a.slug}`))).slice(0, 3)
  const mins = readingTime(p.body)
  const url = absoluteUrl(`/nea/${p.slug}`)
  const faq = faqFromMarkdown(p.body)
  const glance = splitGlance(p.body)
  const ld: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org', '@type': 'NewsArticle', mainEntityOfPage: url, headline: p.title.slice(0, 110),
      description: p.seoDescription || p.excerpt || undefined, image: p.image ? [p.image] : undefined,
      datePublished: p.dateIso, dateModified: p.updatedIso, inLanguage: 'el-GR',
      author: p.author ? { '@type': 'Person', name: p.author, ...(p.authorBio ? { description: p.authorBio } : {}) } : organizationRef,
      publisher: organizationRef, articleSection: p.category ?? undefined, wordCount: p.body.split(/\s+/).length,
    },
    breadcrumbJsonLd([{ label: 'Νέα', href: '/nea' }, { label: p.title }]),
  ]
  if (faq.length) ld.push({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity: faq.map(f => ({ '@type': 'Question', name: f.q, acceptedAnswer: { '@type': 'Answer', text: f.a } })) })

  return (
    <>
      <JsonLd data={ld} />
      <SubBanner
        image={p.image || wwaPhotoFor(p.slug)}
        crumbs={[{ label: 'Νέα', href: '/nea' }, { label: p.title }]}
        title={p.title}
        typewrite
        lead={p.excerpt || undefined}
        badges={
          <>
            {p.category && <span className="hbadge hbadge-cat"><IconTag />{p.category}</span>}
            <span className="hbadge hbadge-date"><IconCalendar /><time dateTime={p.dateIso}>{p.date}</time></span>
            {p.updated !== p.date && <span className="hbadge hbadge-date">Ενημερώθηκε <time dateTime={p.updatedIso}>{p.updated}</time></span>}
            <span className="hbadge hbadge-read"><IconClock />{mins}′ ανάγνωση</span>
            {p.author && <span className="hbadge hbadge-author"><IconUser />{p.author}</span>}
          </>
        }
      />

      <section lang="el">
        <div className="wrap layout">
          <article className="article">
            {glance ? (
              <>
                <div className="post-body dropcap r"><ReactMarkdown remarkPlugins={[remarkGfm]}>{glance.before}</ReactMarkdown></div>
                <KeyFacts rows={glance.rows} />
                <div className="post-body r"><ReactMarkdown remarkPlugins={[remarkGfm]}>{glance.after}</ReactMarkdown></div>
              </>
            ) : (
              <div className="post-body dropcap r">
                <ReactMarkdown remarkPlugins={[remarkGfm]}>{p.body}</ReactMarkdown>
              </div>
            )}

            {p.otherImages.length > 0 && (
              <div className="post-gallery r">
                {p.otherImages.map((src, i) => <img key={i} src={src} alt="" loading="lazy" />)}
              </div>
            )}

            {p.author && (
              <aside className="post-author r" aria-label="Συγγραφέας" style={{ display: 'flex', gap: 14, alignItems: 'center', padding: '16px 0', borderTop: '1px solid var(--rule)', marginTop: 24 }}>
                {p.authorAvatar && <img src={p.authorAvatar} alt="" width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover' }} />}
                <div>
                  <div style={{ fontWeight: 700 }}>{p.author}</div>
                  <div style={{ fontSize: 14, color: 'var(--fg-2)' }}>{p.authorBio || 'Σύμβουλοι ΕΣΠΑ & ευρωπαϊκών προγραμμάτων — World Wide Associates, Αθήνα.'}</div>
                </div>
              </aside>
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
                <a href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`} target="_blank" rel="noopener noreferrer" aria-label="Κοινοποίηση στο LinkedIn"><IconLinkedin /></a>
                <a href={`mailto:?subject=${encodeURIComponent(p.title)}&body=${encodeURIComponent(url)}`} aria-label="Κοινοποίηση με email"><IconMail /></a>
                <a href={url} aria-label="Μόνιμος σύνδεσμος του άρθρου"><IconLink /></a>
              </div>
            </div>
          </article>

          <aside>
            <div className="aside-box aside-cta r">
              <h4>Ζητήστε δωρεάν αξιολόγηση</h4>
              <p>Δείτε σε μία εργάσιμη σε ποια ενεργά προγράμματα είναι επιλέξιμη η επιχείρησή σας.</p>
              <EligibilityCta size="sm" variant="inverse" className="btn-block">Έλεγχος επιλεξιμότητας</EligibilityCta>
            </div>
            {programs.length > 0 && (
              <div className="aside-box aside-related r"><h4>Σχετικά προγράμματα</h4><ul>
                {programs.map(r => (
                  <li key={r.slug}>
                    <Link href={`/programmata/${r.slug}`} className="thumb"><img src={r.image} alt="" loading="lazy" /></Link>
                    <div className="rl-body">
                      <Link href={`/programmata/${r.slug}`}>{r.title}</Link>
                      <span className="pm" style={{ fontSize: 13, color: 'var(--fg-3)' }}>{[r.rate, r.deadline ? `έως ${r.deadline}` : 'ανοιχτή πρόσκληση'].filter(Boolean).join(' · ')}</span>
                    </div>
                  </li>
                ))}
              </ul></div>
            )}
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
                  <div className="media"><img src={r.image || wwaPhotoFor(r.slug)} alt="" loading="lazy" /></div>
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
