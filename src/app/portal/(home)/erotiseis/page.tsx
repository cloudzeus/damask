import { LuChevronDown } from 'react-icons/lu'
import { PORTAL_FAQ } from '@/lib/pm/portal-guides'
import { PortalBanner } from '../../_components/portal-banner'

export const metadata = { title: 'Ερωτήσεις — Portal World Wide Associates' }

export default function PortalFaq() {
  return (
    <>
      <PortalBanner eyebrow="Βοήθεια" title="Συχνές ερωτήσεις" lead="Απαντήσεις στα πιο συχνά ερωτήματα για το portal, τις αγορές και τις πληρωμές. Δεν βρήκατε την απάντηση; Ρωτήστε τον Thanos." photo="team" thanos />
      <main><div className="p-wrap p-stack p-faq">
        {PORTAL_FAQ.map(g => (
          <section key={g.group} aria-label={g.group}>
            <h2>{g.group}</h2>
            {g.items.map((it, n) => (
              <details key={n} open={n === 0 && g === PORTAL_FAQ[0]}>
                <summary>{it.q}<LuChevronDown aria-hidden /></summary>
                <p>{it.a}</p>
              </details>
            ))}
          </section>
        ))}
      </div></main>
    </>
  )
}
