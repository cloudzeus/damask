/* eslint-disable @next/next/no-img-element -- public φωτογραφίες με object-fit cover */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { EligibilityCta } from '../../_components/eligibility-cta'
import { Faq } from '../../_components/faq'
import { richNumbers } from '../../_components/rich'
import { getPublicProgramBySlug, PROGRAM_PROCESS_STEPS } from '@/lib/programs/public'
import { JsonLd, breadcrumbJsonLd } from '../../_components/json-ld'
import { absoluteUrl } from '@/lib/site-url'
import { AnswerBox } from '../../_components/program-grid'
import { hubsForProgram, officialSourceFor, relatedPostsForProgram } from '@/lib/seo-content/hubs'

export const revalidate = 3600
export function generateStaticParams() { return [] }

const tick = (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
)

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params
  const p = await getPublicProgramBySlug(slug)
  if (!p) return { title: 'Πρόγραμμα — World Wide Associates' }
  const description = p.cms?.seoDescription || (p.cms?.overview || p.summary || '').replace(/\s+/g, ' ').trim().slice(0, 155) || undefined
  return {
    title: p.cms?.seoTitle || `${p.title} — World Wide Associates`,
    description,
    keywords: p.cms?.keywords?.length ? p.cms.keywords : undefined,
    alternates: { canonical: `/programmata/${p.slug}` },
    openGraph: { type: 'article', title: p.cms?.heroTitle || p.title, description, url: `/programmata/${p.slug}`, images: [p.image], modifiedTime: p.updatedIso },
    twitter: { card: 'summary_large_image', images: [p.image] },
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
  const [hubs, official, guides] = await Promise.all([hubsForProgram(p.slug), officialSourceFor(p.id), relatedPostsForProgram(p.slug, p.id, 4)])
  // AEO: 40-60 λέξεις που απαντούν «τι είναι, πόσο, ποιοι, μέχρι πότε» — από τα δεδομένα, όχι από AI.
  const who = cms?.audience?.[0]?.replace(/[.;]+$/, '')
  const lead = [
    `Το «${p.title}» είναι πρόγραμμα ΕΣΠΑ για επιχειρήσεις${p.fundingRate != null ? ` με επιδότηση έως ${p.fundingRate}%` : ''}${p.amount && p.amount.includes('€') ? ` (${p.amount})` : ''}.`,
    who ? `Απευθύνεται σε: ${who.charAt(0).toLowerCase()}${who.slice(1)}.` : '',
    p.deadline ? `Οι αιτήσεις υποβάλλονται έως ${p.deadline}.` : 'Η πρόσκληση είναι ανοιχτή.',
    p.region ? `Περιοχή: ${p.region}.` : '',
  ].filter(Boolean).join(' ')
  const overviewParas = (cms?.overview || '').split(/\n{2,}/).map(s => s.trim()).filter(Boolean)
  // Structured data: η επιχορήγηση ως MonetaryGrant (ποσό/ποσοστό, λήξη, περιοχές) + breadcrumbs — για Google & AI απαντήσεις.
  const ld: Record<string, unknown>[] = [
    {
      '@context': 'https://schema.org', '@type': 'MonetaryGrant', name: p.title, url: absoluteUrl(`/programmata/${p.slug}`),
      description: (cms?.overview || p.summary || '').replace(/\s+/g, ' ').slice(0, 500) || undefined,
      ...(p.totalBudget ? { amount: { '@type': 'MonetaryAmount', currency: 'EUR', value: p.totalBudget } } : {}),
      funder: [{ '@type': 'GovernmentOrganization', name: 'ΕΣΠΑ 2021-2027', url: 'https://www.espa.gr' }, { '@type': 'GovernmentOrganization', name: 'Ευρωπαϊκή Ένωση' }],
      ...(p.regions.length ? { areaServed: p.regions.map(r => ({ '@type': 'AdministrativeArea', name: r })) } : { areaServed: { '@type': 'Country', name: 'Ελλάδα' } }),
      ...(p.deadlineIso ? { validThrough: p.deadlineIso } : {}),
      dateModified: p.updatedIso, inLanguage: 'el-GR',
      ...(official ? { sameAs: official } : {}),
    },
    breadcrumbJsonLd([{ label: 'Προγράμματα', href: '/programmata' }, { label: p.title }]),
  ]

  return (
    <>
      <JsonLd data={ld} />
      <section className="sub-banner" lang="el">
        <img src={p.image} alt={p.title} fetchPriority="high" />
        <div className="wrap"><div className="content anim-in">
          <div className="crumbs"><Link href="/">Αρχική</Link><span aria-hidden>›</span><Link href="/programmata">Προγράμματα</Link><span aria-hidden>›</span><span>{p.title}</span></div>
          <h1>{cms?.heroTitle || p.title}{p.amount && p.amount !== '—' ? <> <span className="amount">{p.amount}</span></> : null}</h1>
          {cms?.heroSubtitle && <p style={{ marginTop: 14, fontSize: 17, color: 'rgba(255,255,255,.85)', maxWidth: '54ch' }}>{cms.heroSubtitle}</p>}
          <div className="meta">
            {p.deadline
              ? <span className="pill pill-date">Υποβολές έως <time dateTime={p.deadlineIso ?? undefined}>{p.deadline}</time></span>
              : p.deadlineOpen ? <span className="pill pill-open">Ανοιχτή πρόσκληση</span> : null}
            {p.region && <span className="pill pill-region">{p.region}</span>}
            {p.amountNote && <span className="pill">{p.amountNote}</span>}
            <span className="pill">Ενημερώθηκε <time dateTime={p.updatedIso}>{p.updated}</time></span>
          </div>
        </div></div>
      </section>

      <section lang="el" style={{ paddingBottom: 0 }}>
        <div className="wrap"><AnswerBox updated={p.updated}>{lead}</AnswerBox></div>
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
              <h2>Επίσημη πρόσκληση</h2>
              <p>
                Οι όροι του προγράμματος ορίζονται στην επίσημη πρόσκληση{official ? <> — <a href={official} target="_blank" rel="noopener">δείτε την επίσημη πηγή</a></> : <> που δημοσιεύεται στο <a href="https://www.espa.gr/el/Pages/ProclamationsFS.aspx" target="_blank" rel="noopener">espa.gr</a></>}.
                {' '}Τα στοιχεία της σελίδας ενημερώθηκαν στις <time dateTime={p.updatedIso}>{p.updated}</time>.
              </p>
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

      {(guides.length > 0 || hubs.regions.length > 0 || hubs.sectors.length > 0) && (
        <section lang="el">
          <div className="wrap">
            <div className="hub-links r" style={{ marginTop: 0 }}>
              <h3>Σχετικοί οδηγοί και σελίδες</h3>
              <ul>
                {guides.map(g => <li key={g.slug}><Link href={`/nea/${g.slug}`}>{g.title}</Link></li>)}
                {hubs.regions.slice(0, 6).map(r => <li key={r.slug}><Link href={`/espa/${r.slug}`}>ΕΣΠΑ {r.short}</Link></li>)}
                {hubs.sectors.slice(0, 6).map(s => <li key={s.slug}><Link href={`/espa/klados/${s.slug}`}>ΕΣΠΑ για {s.short}</Link></li>)}
                <li><Link href="/prothesmies-espa">Προθεσμίες ΕΣΠΑ</Link></li>
              </ul>
            </div>
          </div>
        </section>
      )}

      {cms?.faq?.length ? (
        <Faq items={cms.faq} idx="03" subtitle="Ό,τι ρωτούν συχνότερα οι επιχειρήσεις για αυτό το πρόγραμμα." />
      ) : null}
    </>
  )
}
