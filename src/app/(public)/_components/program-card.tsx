import { Badge } from './badge'
import { Button } from './button'
import { EligibilityCta } from './eligibility-cta'
import { Pic } from './pic'

/**
 * WWA public ProgramCard — φωτογραφική κάρτα προγράμματος (nova product card).
 * Δομή από ui_kits/wwa-web (.pcard). Status badge πάνω-αριστερά, προαιρετικό
 * magenta «Νέο» πάνω-δεξιά (μία φορά ανά σελίδα — έλεγχος στον caller).
 */
export type ProgramStatus = 'active' | 'upcoming' | 'running' | 'closed'

const STATUS_LABEL: Record<ProgramStatus, string> = {
  active: 'Ενεργό',
  upcoming: 'Αναμένεται',
  running: 'Σε υλοποίηση',
  closed: 'Ολοκληρωμένο',
}

export type ProgramCardData = {
  image: string
  imageAlt?: string
  title: string
  description: string
  budget?: string | null   // μέγιστο ποσό προϋπολογισμού (€) — πράσινο, κύριο
  rate?: string | null     // ποσοστό επιχορήγησης — μπλε, δευτερεύον
  deadline?: string
  deadlineOpen?: boolean
  region?: string
  status?: ProgramStatus
  isNew?: boolean
  href?: string
}

/** Ημέρες μέχρι τη λήξη από «ΗΗ/ΜΜ/ΕΕΕΕ» (null αν δεν διαβάζεται). Στη σελίδα ανανεώνεται ωριαία (ISR). */
function daysUntil(deadline?: string): number | null {
  const m = deadline?.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (!m) return null
  const end = Date.UTC(Number(m[3]), Number(m[2]) - 1, Number(m[1]))
  const now = new Date()
  return Math.round((end - Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())) / 86_400_000)
}

export function ProgramCard({
  image, imageAlt = '', title, description, budget, rate, deadline, deadlineOpen = false, region,
  status = 'active', isNew = false, href = '#',
}: ProgramCardData) {
  const left = daysUntil(deadline)
  const urgent = left != null && left >= 0 && left <= 21
  return (
    <article className="card card-hover pcard r">
      <div className="media">
        { }
        <Pic src={image} alt={imageAlt} sizes="(min-width: 1024px) 400px, (min-width: 640px) 50vw, 100vw" widths={[480, 768, 1080]} loading="lazy" />
        <Badge variant={status}>{STATUS_LABEL[status]}</Badge>
        {isNew && <span className="badge badge-new badge-nodot">Νέο</span>}
      </div>
      <div className="body">
        <h3>{title}</h3>
        <p>{description}</p>
        <div className="price">
          {budget
            ? <><b className="budget">{budget}</b>{rate && <span className="rate">{rate}</span>}</>
            : rate ? <b className="budget budget-rate">{rate}</b> : null}
        </div>
        <div className="meta">
          {deadline
            ? urgent
              ? <span className="ptag ptag-urgent">{left === 0 ? 'Λήγει σήμερα' : left === 1 ? 'Λήγει αύριο' : `Λήγει σε ${left} ημέρες`} · {deadline}</span>
              : <span className="ptag ptag-date">Έως {deadline}</span>
            : deadlineOpen ? <span className="ptag ptag-open">Ανοιχτή πρόσκληση</span> : null}
          {region && <span className="ptag ptag-region">{region}</span>}
        </div>
        <div className="actions">
          <EligibilityCta size="sm">Δείτε αν δικαιούστε</EligibilityCta>
          <Button href={href} variant="link">Λεπτομέρειες</Button>
        </div>
      </div>
    </article>
  )
}
