import { ProgramCard } from './program-card'
import type { PublicProgramCard } from '@/lib/programs/public'

/** Πλέγμα καρτών ενεργών προγραμμάτων (κοινό για κόμβους περιφερειών/κλάδων/hubs). */
export function ProgramGrid({ programs, empty }: { programs: PublicProgramCard[]; empty: string }) {
  if (!programs.length) return <p className="r" style={{ textAlign: 'center', color: 'var(--fg-3)', maxWidth: 640, margin: '0 auto' }}>{empty}</p>
  return (
    <div className="cards3">
      {programs.map(p => (
        <ProgramCard key={p.slug} image={p.image} title={p.title} description={p.summary} budget={p.budget} rate={p.rate}
          deadline={p.deadline ?? undefined} deadlineOpen={p.deadlineOpen} region={p.region ?? undefined} status="active" href={`/programmata/${p.slug}`} />
      ))}
    </div>
  )
}

/** Σύντομη «απάντηση» στην κορυφή της σελίδας (AEO): 40-60 λέξεις που απαντούν ευθέως στο ερώτημα. */
export function AnswerBox({ children, updated }: { children: React.ReactNode; updated?: string }) {
  return (
    <div className="answer-box r">
      <p>{children}</p>
      {updated && <span className="answer-updated">Ενημερώθηκε: <time>{updated}</time></span>}
    </div>
  )
}
