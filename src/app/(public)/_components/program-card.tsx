import { Badge } from './badge'
import { Button } from './button'
import { EligibilityCta } from './eligibility-cta'

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

export function ProgramCard({
  image, imageAlt = '', title, description, budget, rate, deadline, deadlineOpen = false, region,
  status = 'active', isNew = false, href = '#',
}: ProgramCardData) {
  return (
    <article className="card card-hover pcard r">
      <div className="media">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={image} alt={imageAlt} />
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
            ? <span className="ptag ptag-date">Έως {deadline}</span>
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
