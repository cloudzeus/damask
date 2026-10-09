/**
 * (Plain module.) Ο συγγραφέας AI μπορεί να «μαντέψει» λάθος slug σε εσωτερικό σύνδεσμο (π.χ. /programmata/…stratigon…).
 * Πριν τη δημοσίευση κάθε /programmata/x και /nea/x ελέγχεται: λάθος → το πιο κοντινό πραγματικό slug (ίδια αρχή)
 * ή, αν δεν υπάρχει κάτι κοντινό, η λίστα (/programmata ή /nea). Ποτέ σπασμένος σύνδεσμος (404).
 */
function similarity(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length && a[i] === b[i]) i++
  const words = (s: string) => new Set(s.split('-').filter(w => w.length > 2))
  const wa = words(a), wb = words(b)
  let common = 0
  for (const w of wa) if (wb.has(w)) common++
  return Math.max(i / Math.max(a.length, b.length), common / Math.max(wa.size, wb.size, 1))
}

export function fixInternalLinks(markdown: string, valid: { programs: string[]; posts: string[] }): { body: string; fixed: number } {
  let fixed = 0
  const body = markdown.replace(/\/(programmata|nea)\/([a-z0-9-]+)/g, (whole, kind: string, slug: string) => {
    const pool = kind === 'programmata' ? valid.programs : valid.posts
    if (pool.includes(slug) || (kind === 'programmata' && slug === 'nea-2026')) return whole
    fixed++
    const best = pool.map(s => ({ s, v: similarity(slug, s) })).sort((x, y) => y.v - x.v)[0]
    return best && best.v >= 0.6 ? `/${kind}/${best.s}` : `/${kind}`
  })
  return { body, fixed }
}
