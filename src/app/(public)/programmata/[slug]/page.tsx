/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Faq } from '../../_components/faq'
import { richNumbers } from '../../_components/rich'
import { getPublicProgramBySlug, PROGRAM_PROCESS_STEPS } from '@/lib/programs/public'

const tick = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPublicProgramBySlug(slug)
  if (!p) return { title: 'Πρόγραμμα — World Wide Associates' }
  return {
    title: p.cms?.seoTitle || `${p.title} — World Wide Associates`,
    description: p.cms?.seoDescription || undefined,
    keywords: p.cms?.keywords?.length ? p.cms.keywords : undefined,
  }
}

function Ticks({ items }: { items: string[] }) {
  return <ul className="ticks">{items.map((t, i) => <li key={i}>{tick}<span>{richNumbers(t)}</span></li>)}</ul>
}

export default async function ProgramDetailPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const p = await getPublicProgramBySlug(slug)
  if (!p) notFound()
  const cms = p.cms
  const overviewParas = (cms?.overview || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)

  return (
    <>
      <section className="sub-banner" lang="el">
        <img src={p.image} alt="" />
        <div className="wrap"><div className="content anim-in">
          <div className="crumbs"><Link href="/">Αρχική</Link><span aria-hidden>›</span><Link href="/programmata">Προγράμματα</Link><span aria-hidden>›</span><span>{p.title}</span></div>
          <h1>{cms?.heroTitle || p.title}{p.amount && p.amount !== '—' ? <> <span className="amount">{p.amount}</span></> : null}</h1>
          {cms?.heroSubtitle && <p style={{ marginTop: 14, fontSize: 17, color: 'rgba(255,255,255,.85)', maxWidth: '54ch' }}>{cms.heroSubtitle}</p>}
          <div className="meta">
            {p.deadline
              ? <span className="pill pill-date">Υποβολές έως {p.deadline}</span>
              : p.deadlineOpen ? <span className="pill pill-open">Ανοιχτή πρόσκληση</span> : null}
            {p.region && <span className="pill pill-region">{p.region}</span>}
            {p.amountNote && <span className="pill">{p.amountNote}</span>}
          </div>
        </div></div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div className="prog-layout">
            <div className="prog-body r">
              {overviewParas.length > 0 && (
                <>
                  <h2>Το πρόγραμμα</h2>
                  {overviewParas.map((para, i) => <p key={i}>{richNumbers(para)}</p>)}
                </>
              )}
              {cms?.audience?.length ? (<><h2>Σε ποιους απευθύνεται</h2><Ticks items={cms.audience} /></>) : null}
              {cms?.eligibleExpenses?.length ? (<><h2>Επιλέξιμες δαπάνες</h2><Ticks items={cms.eligibleExpenses} /></>) : null}
              {cms?.benefits?.length ? (<><h2>Οφέλη</h2><Ticks items={cms.benefits} /></>) : null}
            </div>

            <aside className="prog-summary r">
              <div className="head">
                <div className="amt">{p.amount}{p.amountNote ? <small>{p.amountNote}</small> : null}</div>
              </div>
              <div className="body">
                <dl>
                  <dt>Προθεσμία</dt>
                  <dd>{p.deadline ? p.deadline : <span className="ptag ptag-open">Ανοιχτή πρόσκληση</span>}</dd>
                  {p.region && <><dt>Περιοχή</dt><dd>{p.region}</dd></>}
                  {p.durationMonths != null && <><dt>Διάρκεια</dt><dd>{p.durationMonths} μήνες</dd></>}
                </dl>
                <EligibilityCta size="lg" className="btn-block">Δείτε αν δικαιούστε</EligibilityCta>
                <p className="sum-note">Δωρεάν έλεγχος — απάντηση σε μία εργάσιμη.</p>
              </div>
            </aside>
          </div>
        </div>
      </section>

      {/* Κοινά βήματα διαδικασίας (ίδια για όλα τα προγράμματα) */}
      <section className="alt" lang="el">
        <div className="wrap">
          <div className="sec-head r"><span className="eyebrow"><span className="idx">02</span>Πώς δουλεύουμε</span><h2>Η διαδικασία, βήμα-βήμα</h2></div>
          <div className="prog-steps">
            {PROGRAM_PROCESS_STEPS.map(s => (
              <article key={s.title} className="r"><h3>{s.title}</h3><p>{s.description}</p></article>
            ))}
          </div>
        </div>
      </section>

      {cms?.faq?.length ? (
        <Faq items={cms.faq} idx="03" subtitle="Ό,τι ρωτούν συχνότερα οι επιχειρήσεις για αυτό το πρόγραμμα." />
      ) : null}
    </>
  )
}
