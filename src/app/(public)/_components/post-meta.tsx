import { IconCalendar } from './icons'

/**
 * Χρωματιστά badges για κάρτες Νέων: κατηγορία (πράσινο) + ημερομηνία (navy pill
 * με εικονίδιο). Κοινό σε listing, related & αρχική ώστε να είναι συνεπές.
 */
export function PostMeta({ category, date, dark = false }: { category?: string | null; date: string; dark?: boolean }) {
  return (
    <div className="pmeta">
      {category && <span className="ptag ptag-cat">{category}</span>}
      <span className={`ptag ptag-date${dark ? ' on-dark' : ''}`}><IconCalendar />{date}</span>
    </div>
  )
}
