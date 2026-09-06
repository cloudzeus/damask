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
  amount: string
  amountNote?: string
  deadline?: string
  region?: string
  status?: ProgramStatus
  isNew?: boolean
  href?: string
}

export function ProgramCard({
  image, imageAlt = '', title, description, amount, amountNote, deadline, region,
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
        <div className="price"><b>{amount}</b>{amountNote && <span>{amountNote}</span>}</div>
        <div className="meta">
          {deadline ? <span>Υποβολές έως <b>{deadline}</b></span> : <span />}
          {region && <span>{region}</span>}
        </div>
        <div className="actions">
          <EligibilityCta size="sm">Δείτε αν δικαιούστε</EligibilityCta>
          <Button href={href} variant="link">Λεπτομέρειες</Button>
        </div>
      </div>
    </article>
  )
}
