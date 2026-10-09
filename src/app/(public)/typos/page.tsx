/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { PostMeta } from '../_components/post-meta'
import { JsonLd, breadcrumbJsonLd } from '../_components/json-ld'
import { wwaPhoto } from '../_wwa/assets'
import { listPublishedPosts } from '@/lib/cms/public-posts'

export const revalidate = 3600
export const metadata: Metadata = {
  alternates: { canonical: '/typos' },
  title: 'Η WWA στον Τύπο — εκδηλώσεις, ομιλίες, συνεντεύξεις',
  description: 'Παρουσιάσεις, ομιλίες, συνεντεύξεις και χορηγίες της World Wide Associates για το ΕΣΠΑ και τη χρηματοδότηση επιχειρήσεων.',
}

/** Δελτία/εμφανίσεις Τύπου — χωριστά από τους οδηγούς των «Νέων» (E-E-A-T: εξωτερική αναγνώριση). */
export default async function PressPage() {
  const posts = await listPublishedPosts(50, { press: true })
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'Τύπος' }])} />
      <SubBanner image={wwaPhoto('team')} crumbs={[{ label: 'Τύπος' }]} title="Η WWA στον Τύπο"
        lead="Εκδηλώσεις, ομιλίες, συνεντεύξεις και χορηγίες της World Wide Associates." />
      <section lang="el" className="alt">
        <div className="wrap">
          {posts.length === 0
            ? <p className="r" style={{ textAlign: 'center', color: 'var(--fg-3)' }}>Δεν υπάρχουν δημοσιεύσεις ακόμα.</p>
            : <div className="cards3 cards-2rows">
                {posts.map(p => (
                  <article key={p.slug} className="card card-hover ncard r">
                    <div className="media"><img src={p.image || wwaPhoto('team')} alt="" loading="lazy" /></div>
                    <div className="body">
                      <PostMeta category={p.category} date={p.date} />
                      <h3><Link href={`/nea/${p.slug}`}>{p.title}</Link></h3>
                      {p.excerpt && <p>{p.excerpt}</p>}
                    </div>
                  </article>
                ))}
              </div>}
          <p className="r" style={{ textAlign: 'center', marginTop: 32 }}><Link className="btn btn-outline" href="/nea">Οδηγοί & νέα ΕΣΠΑ</Link></p>
        </div>
      </section>
    </>
  )
}
