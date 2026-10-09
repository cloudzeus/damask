import Link from 'next/link'
import { LuFileText, LuTriangleAlert, LuClock, LuChevronRight, LuCircleCheck, LuUsers, LuBanknote } from 'react-icons/lu'
import { getContactPortalDashboard, type PortalApp } from '@/lib/pm/portal-contact'
import { listMyDocuments, type MyDocument } from '@/lib/pm/portal-documents'
import { PortalBanner, PreviewNote, withPreview } from '../_components/portal-banner'

export const metadata = { title: 'Επισκόπηση — Portal World Wide Associates' }

const day = (iso: string) => new Date(iso).toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const eur = (n: number) => n.toLocaleString('el-GR', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 })
const isDone = (s: string) => s === 'APPROVED' || s === 'SUBMITTED' || s === 'WAIVED'

type Attention = { key: string; href: string; tone: 'warn' | 'bad' | 'ok'; title: string; sub: string; sort: number }

/** Customer dashboard: τι χρειάζεται την προσοχή του πελάτη σε ΟΛΑ τα έργα + σύνοψη έργων/δικαιολογητικών. */
export default async function PortalHome({ searchParams }: { searchParams: Promise<{ preview?: string }> }) {
  const { preview } = await searchParams
  const [dash, docs] = await Promise.all([getContactPortalDashboard(preview || undefined), listMyDocuments(preview || undefined)])
  const pv = (h: string) => withPreview(h, preview)

  if (!dash.ok) {
    return (
      <>
        <PortalBanner title="Καλώς ήρθατε" lead="Το portal των έργων σας στη World Wide Associates." />
        <main><div className="p-wrap p-stack"><div className="p-empty"><p>{preview ? 'Η επαφή δεν βρέθηκε ή δεν έχετε δικαίωμα προβολής.' : 'Δεν υπάρχουν διαθέσιμα έργα για τον λογαριασμό σας αυτή τη στιγμή. Επικοινωνήστε με τον σύμβουλό σας στο 210 721 8758.'}</p></div></div></main>
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
