import type { Metadata } from 'next'
import Link from 'next/link'
import { LuExternalLink } from 'react-icons/lu'
import { SubBanner } from './sub-banner'
import { EligibilityCta } from './eligibility-cta'
import { Faq } from './faq'
import { ProgramGrid, AnswerBox } from './program-grid'
import { NotifyBanner } from './notify-banner'
import { JsonLd, breadcrumbJsonLd, itemListJsonLd } from './json-ld'
import { wwaPhoto, type WwaPhoto } from '../_wwa/assets'
import { programsByFamily, nProgramms, rateRangeText, listDeadlines } from '@/lib/seo-content/hubs'
import { FAMILY_PAGES, type FamilyPage } from '@/lib/seo-content/families'

export const familyBySlug = (slug: string) => FAMILY_PAGES.find(f => f.slug === slug)!

export async function familyMetadata(slug: string): Promise<Metadata> {
  const f = familyBySlug(slug)
  return { title: f.metaTitle, description: f.metaDescription, alternates: { canonical: `/${f.slug}` } }
}

/** Σελίδα-κόμβος πλαισίου (Αναπτυξιακός / LEADER): άμεση απάντηση, ενεργά προγράμματα, βασικά στοιχεία, επεξήγηση, FAQ. */
export async function FamilyHub({ page }: { page: FamilyPage }) {
  const [byFamily, deadlines] = await Promise.all([programsByFamily(), listDeadlines()])
  const programs = byFamily[page.kind]
  const n = programs.length
  const range = rateRangeText(programs.map(p => p.rate))
  const slugs = new Set(programs.map(p => p.slug))
  const next = deadlines.find(d => d.deadline && slugs.has(d.slug))
  const today = new Date().toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  return (
    <>
      <JsonLd data={breadcrumbJsonLd([{ label: 'Προγράμματα', href: '/programmata' }, { label: page.title }])} />
      {n > 0 && <JsonLd data={itemListJsonLd(`${page.h1}: ενεργά προγράμματα`, programs.map(p => ({ name: p.title, href: `/programmata/${p.slug}` })))} />}
      <SubBanner image={programs[0]?.image ?? wwaPhoto(page.photo as WwaPhoto)} crumbs={[{ label: 'Προγράμματα', href: '/programmata' }, { label: page.title }]}
        title={page.h1} sub={<span style={{ color: 'var(--wwa-cyan-400)' }}>{page.sub}</span>} lead={page.lead}
        meta={<><EligibilityCta variant="inverse">Δείτε αν δικαιούστε</EligibilityCta><EligibilityCta variant="inverse" mode="notify" className="btn-inverse-outline">Ενημερωθείτε πρώτοι</EligibilityCta></>} />

      <section lang="el">
        <div className="wrap">
          <AnswerBox updated={today}>
            {n
              ? <>Αυτή τη στιγμή είναι ανοιχτ{n === 1 ? 'ό' : 'ά'} <b>{nProgramms(n)}</b> ({page.title}) για επιχειρήσεις{range ? <>, με ενίσχυση {range}</> : null}.{next?.deadline ? <> Η πλησιέστερη προθεσμία λήγει στις <b>{next.deadline.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })}</b>.</> : null} Ελέγξτε δωρεάν, με τον ΑΦΜ σας, αν η επιχείρησή σας είναι επιλέξιμη.</>
              : <>{page.emptyText}</>}
          </AnswerBox>
          <dl className="famx-facts r">
            {page.facts.map(f => <div key={f.k}><dt>{f.k}</dt><dd>{f.v}</dd></div>)}
          </dl>
        </div>
      </section>

      <section lang="el" className="alt">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">01</span>Ενεργά προγράμματα</span>
            <h2>{n ? `${nProgramms(n)} ανοιχτ${n === 1 ? 'ό' : 'ά'} τώρα` : 'Ανοιχτές προσκλήσεις'}</h2>
          </div>
          <ProgramGrid programs={programs} empty={page.emptyText} />
        </div>
      </section>

      <section lang="el">
        <div className="wrap">
          <div className="sec-head r">
            <span className="eyebrow"><span className="idx">02</span>Με απλά λόγια</span>
            <h2>Τι πρέπει να ξέρετε</h2>
          </div>
          <div className="famx-about r">
            {page.about.map(a => <article key={a.h}><h3>{a.h}</h3><p>{a.p}</p></article>)}
          </div>
          <p className="famx-source r">Επίσημη πηγή: <a href={page.officialUrl} target="_blank" rel="noopener">{page.officialName} <LuExternalLink aria-hidden /></a> · Δείτε επίσης: <Link href="/programmata">όλα τα προγράμματα</Link> · <Link href="/prothesmies-espa">προθεσμίες</Link> · <Link href="/syxnes-erotiseis">συχνές ερωτήσεις</Link></p>
        </div>
      </section>

      <NotifyBanner />
      <Faq items={page.faq} idx="03" title={`${page.title}: συχνές ερωτήσεις`} />
    </>
  )
}
