import Link from 'next/link'
import { LuFileText, LuTriangleAlert, LuClock, LuChevronRight, LuCircleCheck, LuUsers, LuBanknote } from 'react-icons/lu'
import { getContactPortalDashboard, type PortalApp } from '@/lib/pm/portal-contact'
import { listMyDocuments, listOpportunities, listPreviewableContacts, getMyCompany, type MyDocument } from '@/lib/pm/portal-documents'
import { Opportunities } from '../_components/opportunities'
import { PortalBanner, PreviewNote, withPreview } from '../_components/portal-banner'

export const metadata = { title: 'Επισκόπηση — Portal World Wide Associates' }

const day = (iso: string) => new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const isDone = (s: string) => s === 'APPROVED' || s === 'SUBMITTED' || s === 'WAIVED'

type Attention = { key: string; href: string; tone: 'warn' | 'bad' | 'ok'; title: string; sub: string; sort: number }

/** Customer dashboard: τι χρειάζεται την προσοχή του πελάτη σε ΟΛΑ τα έργα + σύνοψη έργων/δικαιολογητικών. */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ preview?: string; q?: string }> }) {
  const { preview, q } = await searchParams
  const [dash, docs, opps, company] = await Promise.all([getContactPortalDashboard(preview || undefined), listMyDocuments(preview || undefined), listOpportunities(preview || undefined), getMyCompany(preview || undefined)])
  const pv = (h: string) => withPreview(h, preview)

  if (!dash.ok) {
    // Χρήστης του γραφείου χωρίς επαφή → λίστα πελατών για «προβολή ως επαφή».
    const staff = preview ? null : await listPreviewableContacts(q)
    if (staff) {
      return (
        <>
          <PortalBanner eyebrow="Χρήστης γραφείου" title="Portal πελατών" lead="Είστε συνδεδεμένοι ως χρήστης της εφαρμογής. Διαλέξτε επαφή πελάτη για να δείτε το portal ακριβώς όπως το βλέπει." />
          <main><div className="p-wrap p-stack">
            <form className="p-form" method="get" style={{ gridTemplateColumns: '1fr auto', alignItems: 'end' }}>
              <label className="p-field"><span>Αναζήτηση πελάτη ή επαφής</span><input name="q" defaultValue={q ?? ''} placeholder="Επωνυμία, όνομα ή email" /></label>
              <button type="submit" className="p-btn">Αναζήτηση</button>
            </form>
            <ul className="p-todo">
              {staff.length === 0 && <li><div className="row"><span className="tx"><b>Δεν βρέθηκαν επαφές</b><span>Δοκιμάστε άλλη αναζήτηση.</span></span></div></li>}
              {staff.map(c => (
                <li key={c.contactId}>
                  <Link href={`/portal?preview=${c.contactId}`}>
                    <span className="ic ok"><LuUsers aria-hidden /></span>
                    <span className="tx"><b>{c.company}</b><span>{c.name} · {c.apps} έργ{c.apps === 1 ? 'ο' : 'α'}{c.hasPortal ? ' · έχει πρόσβαση στο portal' : ''}</span></span>
                    <LuChevronRight className="go" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          </div></main>
        </>
      )
    }
    return (
      <>
        <PortalBanner title="Καλώς ήρθατε" lead="Το portal των έργων σας στη World Wide Associates." />
        <main><div className="p-wrap p-stack"><div className="p-empty"><p>{preview ? 'Η επαφή δεν βρέθηκε ή δεν έχετε δικαίωμα προβολής.' : 'Ο λογαριασμός σας δεν έχει συνδεθεί ακόμα με επιχείρηση. Επικοινωνήστε με τον σύμβουλό σας στο 210 721 8758 και θα το ενεργοποιήσουμε αμέσως.'}</p></div></div></main>
      </>
    )
  }

  const apps = dash.applications
  const docList = docs.ok ? docs.documents : []
  const attention = buildAttention(apps, docList, pv)

  const pending = apps.reduce((n, a) => n + a.obligations.filter(o => !isDone(o.status)).length, 0)
  const expiringDocs = docList.filter(d => d.status !== 'valid').length
  const paid = apps.reduce((t, a) => t + a.money.paidAmount, 0)

  return (
    <>
      <PortalBanner eyebrow={dash.companyName} title={`Καλώς ήρθατε, ${dash.contactName.split(' ')[0]}`} lead="Όλα τα έργα σας με μια ματιά: τι χρειάζεται την προσοχή σας, πού βρίσκεται κάθε έργο και τα δικαιολογητικά της επιχείρησης." thanos />
      <main>
        <div className="p-wrap p-stack">
          {dash.preview && <PreviewNote name={dash.contactName} />}

          <div className="p-kpis">
            <Link className="p-kpi" href={pv('/portal/erga')}><div className="v">{apps.length}</div><div className="k">{apps.length === 1 ? 'έργο' : 'έργα'} στο portal</div></Link>
            <Link className={`p-kpi ${pending ? 'warn' : ''}`} href={pv('/portal/erga')}><div className="v">{pending}</div><div className="k">έγγραφα που χρειαζόμαστε</div></Link>
            <Link className={`p-kpi ${expiringDocs ? 'bad' : ''}`} href={pv('/portal/dikaiologitika')}><div className="v">{docList.length}</div><div className="k">δικαιολογητικά{expiringDocs ? ` · ${expiringDocs} λήγουν/έληξαν` : ' σε αρχείο'}</div></Link>
            <div className="p-kpi"><div className="v">{eur(paid)}</div><div className="k">έχετε εισπράξει</div></div>
          </div>

          {company && (
            <div className="p-form p-company">
              <div className="p-section-title" style={{ margin: 0 }}><h2>Η επιχείρηση</h2>{company.contactRole && <span className="p-badge">Ο ρόλος σας: {company.contactRole}</span>}</div>
              <dl>
                <div><dt>Επωνυμία</dt><dd>{company.name}</dd></div>
                {company.afm && <div><dt>ΑΦΜ</dt><dd>{company.afm}{company.doy ? ` · ${company.doy}` : ''}</dd></div>}
                {company.legalForm && <div><dt>Νομική μορφή</dt><dd>{company.legalForm}</dd></div>}
                {company.gemi && <div><dt>ΓΕΜΗ</dt><dd>{company.gemi}</dd></div>}
                {company.address && <div><dt>Έδρα</dt><dd>{company.address}</dd></div>}
                {company.founded && <div><dt>Ίδρυση</dt><dd>{day(company.founded)}</dd></div>}
                {company.mainKad && <div><dt>Κύριος ΚΑΔ</dt><dd>{company.mainKad.code} — {company.mainKad.description}{company.otherKads ? ` (+${company.otherKads} ακόμα)` : ''}</dd></div>}
                {(company.employees != null || company.eme != null) && <div><dt>Απασχόληση</dt><dd>{company.employees != null ? `${company.employees} εργαζόμενοι` : ''}{company.eme != null ? `${company.employees != null ? ' · ' : ''}${company.eme} ΕΜΕ` : ''}</dd></div>}
              </dl>
              <p className="p-muted" style={{ margin: 0, fontSize: 13 }}>Βλέπετε κάτι λάθος; Πείτε το στον σύμβουλό σας — τα στοιχεία αυτά καθορίζουν σε ποια προγράμματα είστε επιλέξιμοι.</p>
            </div>
          )}

          <div className="p-section-title"><h2>Χρειάζεται η προσοχή σας</h2></div>
          {attention.length === 0 ? (
            <ul className="p-todo"><li><div className="row"><span className="ic ok"><LuCircleCheck aria-hidden /></span><span className="tx"><b>Όλα εντάξει</b><span>Δεν χρειάζεται κάτι από εσάς αυτή τη στιγμή — θα σας ειδοποιήσουμε μόλις χρειαστεί.</span></span></div></li></ul>
          ) : (
            <ul className="p-todo">
              {attention.slice(0, 12).map(a => (
                <li key={a.key}>
                  <Link href={a.href}>
                    <span className={`ic ${a.tone}`}>{a.tone === 'ok' ? <LuBanknote aria-hidden /> : a.tone === 'bad' ? <LuTriangleAlert aria-hidden /> : a.key.startsWith('doc-') ? <LuClock aria-hidden /> : <LuFileText aria-hidden />}</span>
                    <span className="tx"><b>{a.title}</b><span>{a.sub}</span></span>
                    <LuChevronRight className="go" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          )}

          <div className="p-section-title"><h2>Τα έργα σας</h2><Link href={pv('/portal/erga')}>Όλα →</Link></div>
          <div className="p-projects">
            {apps.map(a => {
              const todo = a.obligations.filter(o => !isDone(o.status)).length
              const step = a.journey.steps[a.journey.currentIndex]
              return (
                <Link key={a.applicationId} className="p-project" href={pv(`/portal/erga/${a.applicationId}`)}>
                  <h3>{a.programTitle}</h3>
                  <div className="meta">
                    <span className="p-badge">Βήμα {a.journey.currentIndex + 1}/{a.journey.steps.length} · {step.label}</span>
                    {todo > 0 ? <span className="p-badge warn">{todo} εκκρεμ{todo === 1 ? 'ές' : 'ή'}</span> : <span className="p-badge ok">Χωρίς εκκρεμότητες</span>}
                  </div>
                  <div className="prog" role="progressbar" aria-valuenow={a.journey.percent} aria-valuemin={0} aria-valuemax={100} aria-label="Πρόοδος έργου"><span style={{ width: `${a.journey.percent}%` }} /></div>
                  <div className="foot"><span>{a.money.subsidy != null ? `Επιδότηση ${eur(a.money.subsidy)}` : a.lifecycleLabel}</span><span>Άνοιγμα →</span></div>
                </Link>
              )
            })}
          </div>

          {opps.ok && (
            <>
              <div className="p-section-title"><h2>Ευκαιρίες ένταξης για εσάς</h2><Link href={pv('/portal/eukairies')}>Όλα τα ενεργά προγράμματα →</Link></div>
              <p className="p-muted" style={{ margin: '-8px 0 0', fontSize: 14 }}>Ενεργά προγράμματα που ταιριάζουν στα στοιχεία της επιχείρησής σας (ΚΑΔ, περιοχή, μέγεθος). Πατήστε «Ενδιαφέρομαι» και ο σύμβουλός σας θα κάνει την πλήρη αξιολόγηση.</p>
              {opps.items.length ? <Opportunities items={opps.items} preview={opps.preview} /> : <div className="p-empty" style={{ padding: 24 }}><p className="p-muted" style={{ margin: 0 }}>Αυτή τη στιγμή δεν υπάρχει νέο ενεργό πρόγραμμα που να ταιριάζει πλήρως. Δείτε <Link href={pv('/portal/eukairies')} style={{ color: 'var(--p-brand)' }}>όλα τα ενεργά προγράμματα</Link> — μπορείτε να δηλώσετε ενδιαφέρον σε όποιο θέλετε.</p></div>}
            </>
          )}

          <div className="p-kpis" style={{ gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))' }}>
            <Link className="p-kpi" href={pv('/portal/omada')}><div className="k" style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><LuUsers aria-hidden style={{ width: 18, height: 18, color: 'var(--p-brand)' }} /> <b>Η ομάδα σας</b></div><div className="k">Ορίστε λογιστή και υπεύθυνο έργου — θα λαμβάνουν τις σχετικές ειδοποιήσεις.</div></Link>
            <Link className="p-kpi" href={pv('/portal/dikaiologitika')}><div className="k" style={{ marginTop: 0, display: 'flex', gap: 8, alignItems: 'center' }}><LuFileText aria-hidden style={{ width: 18, height: 18, color: 'var(--p-brand)' }} /> <b>Δικαιολογητικά</b></div><div className="k">Όλα τα έγγραφα της επιχείρησης σε ένα σημείο — με έλεγχο AI σε κάθε νέο.</div></Link>
          </div>
        </div>
      </main>
    </>
  )
}

/** «Χρειάζεται η προσοχή σας»: εκκρεμή έντυπα (εκπρόθεσμα πρώτα), αιτήματα, πρόσφατες πληρωμές, δικαιολογητικά που λήγουν. */
function buildAttention(apps: PortalApp[], docList: MyDocument[], pv: (h: string) => string): Attention[] {
  const now = Date.now()
  const attention: Attention[] = []
  for (const a of apps) {
    for (const o of a.obligations.filter(o => !isDone(o.status))) {
      const overdue = !!o.dueDate && new Date(o.dueDate).getTime() < now
      attention.push({
        key: o.id, href: pv(`/portal/erga/${a.applicationId}`), tone: o.status === 'REJECTED' || overdue ? 'bad' : 'warn',
        title: o.status === 'REJECTED' ? `Ξαναστείλτε: ${o.name}` : `Ανεβάστε: ${o.name}`,
        sub: `${a.programTitle}${o.dueDate ? ` · έως ${day(o.dueDate)}${overdue ? ' (εκπρόθεσμο)' : ''}` : ''}`,
        sort: o.dueDate ? new Date(o.dueDate).getTime() : now + 1e12,
      })
    }
    if (a.openRequests > 0) attention.push({ key: `fr-${a.applicationId}`, href: pv(`/portal/erga/${a.applicationId}`), tone: 'warn', title: a.openRequests === 1 ? 'Ένα αίτημα εγγράφων σας περιμένει στο email' : `${a.openRequests} αιτήματα εγγράφων σας περιμένουν στο email`, sub: a.programTitle, sort: now + 2e12 })
    for (const p of a.payments.filter(p => p.status === 'PAID' && p.paidAt && now - new Date(p.paidAt).getTime() < 30 * 86_400_000)) {
      attention.push({ key: `pay-${a.applicationId}-${p.ordinal}`, href: pv(`/portal/erga/${a.applicationId}`), tone: 'ok', title: `Πληρώθηκε η ${p.title || `${p.ordinal}η δόση`}${p.amount ? `: ${eur(p.amount)}` : ''}`, sub: a.programTitle, sort: now + 3e12 })
    }
  }
  for (const d of docList.filter(d => d.status !== 'valid')) {
    attention.push({
      key: `doc-${d.id}`, href: pv('/portal/dikaiologitika'), tone: d.status === 'expired' ? 'bad' : 'warn',
      title: d.status === 'expired' ? `Έληξε: ${d.typeName}` : `Λήγει σύντομα: ${d.typeName}`,
      sub: d.expiresAt ? `Ισχύς έως ${day(d.expiresAt)} — ανεβάστε νέο για να μη σταματήσει κάποιο έργο` : '', sort: d.expiresAt ? new Date(d.expiresAt).getTime() : now,
    })
  }
  attention.sort((x, y) => x.sort - y.sort)
  return attention
}
