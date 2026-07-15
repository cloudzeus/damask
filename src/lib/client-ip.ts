/**
 * Πραγματική IP επισκέπτη από HTTP headers — το Next.js Route Handlers (App
 * Router) ΔΕΝ εκθέτουν πλέον raw socket address (το NextRequest.ip αφαιρέθηκε
 * στο v15), οπότε η μοναδική αξιόπιστη πηγή είναι τα headers ενός reverse
 * proxy μπροστά (nginx/Cloudflare/Vercel). Σε local/dev χωρίς proxy μπροστά
 * (π.χ. e2e τρέχοντας κατευθείαν πάνω στο `next dev`) δεν υπάρχουν αυτά τα
 * headers καθόλου — πέφτει στο FALLBACK_IP.
 */

export const FALLBACK_IP = '127.0.0.1'

/** Ελάχιστο interface που ταιριάζει και στο web Headers και σε plain object mock στα tests. */
export type HeaderLike = { get(name: string): string | null | undefined }

/**
 * Σειρά προτεραιότητας: x-forwarded-for (πρώτο, μη κενό στοιχείο της αλυσίδας
 * "client, proxy1, proxy2") → x-real-ip → FALLBACK_IP.
 */
export function getClientIp(headers: HeaderLike): string {
  const forwardedFor = headers.get('x-forwarded-for')
  if (forwardedFor) {
    for (const candidate of forwardedFor.split(',')) {
      const trimmed = candidate.trim()
      if (trimmed) return trimmed
    }
  }

  const realIp = headers.get('x-real-ip')
  if (realIp && realIp.trim()) return realIp.trim()

  return FALLBACK_IP
}
