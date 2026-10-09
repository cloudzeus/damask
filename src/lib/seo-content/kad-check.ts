import { prisma } from '@/lib/prisma'
import { evalKadRule } from '@/lib/prospects/eligibility'
import { extractKadRule } from '@/lib/prospects/evaluate-pair'
import { formatKadDots, normalizeKad } from '@/lib/registries/kad-pure'
import { listPublicPrograms } from '@/lib/programs/public'

/**
 * (Plain module.) Δημόσιο εργαλείο «Έλεγχος ΚΑΔ για ΕΣΠΑ»: αναζήτηση στο μητρώο ΚΑΔ (κωδικός ή λέξη) και
 * έλεγχος ενός ΚΑΔ απέναντι στα ΕΝΕΡΓΑ δημόσια προγράμματα — με τον ΙΔΙΟ κανόνα (kadRule + λίστα ΚΑΔ) που
 * χρησιμοποιεί ο εσωτερικός έλεγχος επιλεξιμότητας. Μόνο ΚΑΔ· τα υπόλοιπα κριτήρια (περιφέρεια, μέγεθος,
 * έτη) χρειάζονται ΑΦΜ → πλήρης έλεγχος.
 */

export type KadSuggestion = { code: string; title: string }

export async function suggestKad(raw: string): Promise<KadSuggestion[]> {
  const q = raw.trim().slice(0, 60)
  if (q.length < 2) return []
  const digits = normalizeKad(q)
  const isCode = /^[\d.\s]+$/.test(q) && digits.length >= 2
  const find = (where: object) => prisma.kadCode.findMany({ where, orderBy: [{ level: 'asc' }, { code: 'asc' }], take: 12, select: { code: true, title: true, description: true } })
  const byCode = (d: string) => find({ OR: [{ code: { startsWith: q.replace(/\s/g, '') } }, { code: { startsWith: formatKadDots(d) } }, { codeWithoutDots: { startsWith: d } }] })
  let rows = isCode
    ? await byCode(digits)
    : await find({ AND: q.split(/\s+/).filter(w => w.length > 1).slice(0, 4).map(w => ({ OR: [{ title: { contains: w, mode: 'insensitive' as const } }, { description: { contains: w, mode: 'insensitive' as const } }] })) })
  // Παλιός κωδικός που άλλαξε στη νέα ονοματολογία (ΚΑΔ 2025) → οι ΚΑΔ της ίδιας ομάδας.
  if (isCode && !rows.length && digits.length > 2) rows = await byCode(digits.slice(0, 2))
  return rows.map(r => ({ code: r.code, title: r.title || r.description }))
}

export type KadProgramVerdict = {
  slug: string; title: string; rate: string | null; deadline: string | null
  status: 'eligible' | 'excluded' | 'not-listed' | 'all'
  note: string
}
export type KadCheckResult = { code: string; title: string | null; programs: KadProgramVerdict[] } | null

export async function checkKad(raw: string): Promise<KadCheckResult> {
  const digits = normalizeKad(raw).slice(0, 8)
  if (digits.length < 2) return null
  const code = formatKadDots(digits)
  const [kad, cards, rows] = await Promise.all([
    prisma.kadCode.findFirst({ where: { OR: [{ code }, { codeWithoutDots: digits }] }, select: { code: true, title: true, description: true } }),
    listPublicPrograms(),
    prisma.program.findMany({
      where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: new Date(new Date().toISOString().slice(0, 10)) } }] },
      select: { publicSlug: true, extractedData: true, kads: { select: { code: true } } },
    }),
  ])
  const bySlug = new Map(rows.map(r => [r.publicSlug!, r]))
  const programs: KadProgramVerdict[] = cards.flatMap(c => {
    const r = bySlug.get(c.slug)
    if (!r) return []
    const rule = extractKadRule(r.extractedData)
    const kads = r.kads.map(k => ({ code: k.code, excluded: false }))
    const res = evalKadRule(rule, kads, [kad?.code ?? code])
    let status: KadProgramVerdict['status']
    let note: string
    if (rule === 'UNSPECIFIED' || !kads.length) { status = 'all'; note = 'Δεν περιορίζεται σε συγκεκριμένους ΚΑΔ — ελέγχονται τα υπόλοιπα κριτήρια.' }
    else if (rule === 'ALL_EXCEPT_LISTED') { status = res.pass ? 'eligible' : 'excluded'; note = res.pass ? 'Δεν είναι στους αποκλεισμένους ΚΑΔ του προγράμματος.' : 'Ο ΚΑΔ εξαιρείται από το πρόγραμμα.' }
    else { status = res.pass ? 'eligible' : 'not-listed'; note = res.pass ? 'Είναι στους επιλέξιμους ΚΑΔ του προγράμματος.' : 'Δεν είναι στους επιλέξιμους ΚΑΔ του προγράμματος.' }
    return [{ slug: c.slug, title: c.title, rate: c.rate, deadline: c.deadline, status, note }]
  })
  const order = { eligible: 0, all: 1, 'not-listed': 2, excluded: 3 }
  programs.sort((a, b) => order[a.status] - order[b.status])
  return { code: kad?.code ?? code, title: kad ? (kad.title || kad.description) : null, programs }
}
