import type { ReactNode } from 'react'

/**
 * Κάνει bold τα ποσά/ποσοστά μέσα σε απλό κείμενο (π.χ. «έως 67%», «€200.000»,
 * «50–67%»). Καθαρή συνάρτηση — δουλεύει σε server components. Χρησιμοποιείται
 * στις δημόσιες σελίδες προγραμμάτων ώστε τα νούμερα να ξεχωρίζουν.
 */
const NUM_RE = /(€\s?[\d.,]+|[\d.,]+(?:\s?[–-]\s?[\d.,]+)?\s?%|[\d.,]+\s?€)/g

export function richNumbers(text: string): ReactNode[] {
  const out: ReactNode[] = []
  const re = new RegExp(NUM_RE)
  let last = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) out.push(text.slice(last, m.index))
    out.push(<strong key={`${m.index}-${m[0]}`} className="fig">{m[0]}</strong>)
    last = m.index + m[0].length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}
