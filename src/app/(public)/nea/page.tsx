/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { SubBanner } from '../_components/sub-banner'
import { Button } from '../_components/button'
import { Faq, type FaqItem } from '../_components/faq'
import { PostMeta } from '../_components/post-meta'
import { wwaPhoto } from '../_wwa/assets'
import { listPublishedPosts, type PublicPostCard } from '@/lib/cms/public-posts'

export const metadata: Metadata = {
  title: 'Νέα & προκηρύξεις ΕΣΠΑ — World Wide Associates',
  description: 'Νέες προκηρύξεις, εκδηλώσεις και ενημερώσεις ΕΣΠΑ από τη World Wide Associates. Ένα email τον μήνα για όσους εγγραφούν.',
}

const FAQS: FaqItem[] = [
  { q: 'Πόσο συχνά ανοίγουν νέα προγράμματα ΕΣΠΑ;', a: 'Σε ολόκληρη την περίοδο 2021–2027 προκηρύσσονται συνεχώς δράσεις, εθνικές και περιφερειακές. Συνήθως ανοίγουν 4–8 νέες προκηρύξεις τον χρόνο που αφορούν ΜμΕ, με ανοιχτές περιόδους υποβολής 1–3 μηνών.' },
  { q: 'Πώς θα μάθω έγκαιρα για μια νέα προκήρυξη;', a: 'Εγγραφείτε στο μηνιαίο newsletter της WWA ή ζητήστε ενημέρωση σε συγκεκριμένο πρόγραμμα με την ένδειξη «Αναμένεται». Ενημερώνουμε την ημέρα της προδημοσίευσης, ώστε να προλάβετε την προετοιμασία.' },
  { q: 'Τι σημαίνει προδημοσίευση προγράμματος;', a: 'Είναι η επίσημη ανακοίνωση των βασικών όρων (δικαιούχοι, δαπάνες, ποσοστά) πριν την προκήρυξη. Επιτρέπει την προετοιμασία του φακέλου ώστε η υποβολή να γίνει τις πρώτες ημέρες.' },
  { q: 'Ενημερώνετε για παρατάσεις και τροποποιήσεις;', a: 'Ναι. Κάθε παράταση προθεσμίας ή τροποποίηση όρων δημοσιεύεται εδώ και αποστέλλεται στους πελάτες που έχουν έργο στο συγκεκριμένο πρόγραμμα.' },
]

const FALLBACK = [wwaPhoto('manufacturing'), wwaPhoto('hotel'), wwaPhoto('startup'), wwaPhoto('cosmetics'), wwaPhoto('team'), wwaPhoto('consulting')]

function NCard({ post, i }: { post: PublicPostCard; i: number }) {
  return (
    <article className="card card-hover ncard r">
      <div className="media"><img src={post.image || FALLBACK[i % FALLBACK.length]} alt="" /></div>
      <div className="body">
        <PostMeta category={post.category} date={post.date} />
        <h3><Link href={`/nea/${post.slug}`}>{post.title}</Link></h3>
        {post.excerpt && <p>{post.excerpt}</p>}
      </div>
    </article>
  )
}

export default async function NewsPage() {
  const posts = await listPublishedPosts(30)
  const [featured, ...rest] = posts

  return (
    <>
      <SubBanner
        image={wwaPhoto('ecommerce')}
        crumbs={[{ label: 'Νέα' }]}
        title="ΝΕΑ & ΠΡΟΚΗΡΥΞΕΙΣ"
        sub={<>Ό,τι αλλάζει στο ΕΣΠΑ, <span style={{ color: 'var(--wwa-cyan-400)' }}>πριν</span> λήξει η προθεσμία</>}
        lead="Νέες προκηρύξεις, εκδηλώσεις και ενημερώσεις. Ένα email τον μήνα για όσους εγγραφούν."
      />

      <section lang="el" className="alt">
        <div className="wrap">
          {posts.length === 0 ? (
            <p className="r" style={{ textAlign: 'center', color: 'var(--fg-3)' }}>Δεν υπάρχουν δημοσιευμένα νέα αυτή τη στιγμή.</p>
          ) : (
            <>
              {featured && (
                <article className="feat-post">
                  <div className="photo square"><img src={featured.image || FALLBACK[0]} alt="" /></div>
                  <div className="b">
                    <PostMeta category={featured.category} date={featured.date} />
                    <h2>{featured.title}</h2>
                    {featured.excerpt && <p>{featured.excerpt}</p>}
                    <div><Button href={`/nea/${featured.slug}`}>Διαβάστε το άρθρο</Button></div>
                  </div>
                </article>
              )}
              {rest.length > 0 && (
                <div className="cards3 cards-2rows">
                  {rest.map((p, i) => <NCard key={p.slug} post={p} i={i} />)}
                </div>
              )}
            </>
          )}
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div style={{ maxWidth: 720, margin: '0 auto', background: 'var(--navy-50)', borderRadius: 'var(--radius-xl)', padding: 36, textAlign: 'center' }}>
            <span className="eyebrow"><span className="idx">02</span>Ενημερώσεις</span>
            <h2 style={{ marginTop: 10 }}>Μάθετε πρώτοι για κάθε νέα προκήρυξη</h2>
            <p style={{ color: 'var(--fg-2)', marginTop: 8 }}>Ένα email τον μήνα. Καμία διαφήμιση.</p>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'center', marginTop: 20 }}>
              <input className="input" style={{ maxWidth: 320 }} type="email" placeholder="email@epixeirisi.gr" aria-label="Email" />
              <Button href="/epikoinonia">Εγγραφή</Button>
            </div>
          </div>
        </div>
      </section>

      <Faq items={FAQS} idx="03" subtitle="Τα πιο συχνά ερωτήματα για τις προκηρύξεις και τις ενημερώσεις." />
    </>
  )
}
