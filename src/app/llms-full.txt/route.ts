import { prisma } from '@/lib/prisma'
import { SITE_INDEXABLE, absoluteUrl } from '@/lib/site-url'
import type { ProgramCms } from '@/lib/programs/cms'
import { GLOSSARY } from '@/lib/seo-content/glossary'
import { FAQ_HUB } from '@/lib/seo-content/faq-hub'
import { FAMILY_PAGES } from '@/lib/seo-content/families'
import { programFamily } from '@/lib/seo-content/hubs'

export const revalidate = 3600

/**
 * /llms-full.txt (GEO): ΠΛΗΡΕΣ περιεχόμενο σε markdown για AI μηχανές (ChatGPT/Claude/Perplexity/Gemini) —
 * κάθε ενεργό πρόγραμμα με όρους/δαπάνες/προθεσμίες/FAQ, το γλωσσάριο και περιλήψεις οδηγών. Πάντα με πηγή-URL.
 */
export async function GET() {
  if (!SITE_INDEXABLE) return new Response('Not found', { status: 404 })
  const today = new Date(new Date().toISOString().slice(0, 10))
  const [programs, posts] = await Promise.all([
    prisma.program.findMany({
      where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
      orderBy: { submissionEnd: 'asc' }, take: 40,
      select: { title: true, publicSlug: true, fundingRate: true, submissionEnd: true, durationMonths: true, totalBudget: true, cmsContent: true, updatedAt: true, regions: { select: { name: true } }, references: { where: { kind: 'URL', url: { not: null } }, select: { url: true }, orderBy: { createdAt: 'asc' } } },
    }),
    prisma.post.findMany({
      where: { status: 'PUBLISHED', OR: [{ categoryId: null }, { category: { slug: { not: 'typos' } } }] },
      orderBy: { publishedAt: 'desc' }, take: 40,
      select: { slug: true, updatedAt: true, translations: { where: { locale: 'el' }, select: { title: true, excerpt: true, body: true } } },
    }),
  ])
  const d = (x: Date) => x.toISOString().slice(0, 10)
  const out: string[] = [
    '# World Wide Associates — Πλήρης οδηγός επιδοτήσεων για επιχειρήσεις (ΕΣΠΑ, Αναπτυξιακός Νόμος, LEADER)',
    '',
    `> Σύμβουλοι ΕΣΠΑ & επιδοτήσεων για ελληνικές επιχειρήσεις (Αθήνα, 210 721 8758). Ενημερώθηκε: ${d(new Date())}. Επίσημες πηγές για τους όρους κάθε πρόσκλησης: https://www.espa.gr · https://ependyseis.mindev.gov.gr · https://www.agrotikianaptixi.gr`,
    '',
    '## Ενεργά προγράμματα',
  ]
  for (const p of programs) {
    const cms = (p.cmsContent ?? null) as Partial<ProgramCms> | null
    out.push('', `### ${cms?.cardTitle || p.title}`, `URL: ${absoluteUrl(`/programmata/${p.publicSlug}`)} · ${programFamily(p.references.map(r => r.url).find(u => /(espa\.gr|ependyseis|gov\.gr|agrotikianaptixi)/i.test(u ?? '')) ?? null, p.title).label} · ενημερώθηκε ${d(p.updatedAt)}`)
    const facts = [
      p.fundingRate != null ? `Επιδότηση έως ${Number(p.fundingRate)}%` : null,
      cms?.amountDisplay ? `Ποσό: ${cms.amountDisplay}` : null,
      p.submissionEnd ? `Υποβολές έως ${d(p.submissionEnd)}` : 'Ανοιχτή πρόσκληση (χωρίς ορισμένη λήξη)',
      p.durationMonths ? `Διάρκεια υλοποίησης ${p.durationMonths} μήνες` : null,
      p.regions.length ? `Περιοχές: ${p.regions.map(r => r.name).join(', ')}` : 'Όλη η Ελλάδα',
    ].filter(Boolean)
    out.push(...facts.map(f => `- ${f}`))
    if (cms?.overview) out.push('', cms.overview.trim())
    if (cms?.audience?.length) out.push('', 'Σε ποιους απευθύνεται:', ...cms.audience.map(a => `- ${a}`))
    if (cms?.eligibleExpenses?.length) out.push('', 'Επιλέξιμες δαπάνες:', ...cms.eligibleExpenses.map(a => `- ${a}`))
    if (cms?.faq?.length) out.push('', 'Συχνές ερωτήσεις:', ...cms.faq.flatMap(f => [`Ε: ${f.q}`, `Α: ${f.a}`]))
  }
  for (const f of FAMILY_PAGES) {
    out.push('', `## ${f.h1}`, `Πηγή: ${absoluteUrl(`/${f.slug}`)} · επίσημη: ${f.officialUrl}`, '', f.lead, '', ...f.facts.map(x => `- ${x.k}: ${x.v}`))
    for (const a of f.about) out.push('', `### ${a.h}`, a.p)
    for (const q of f.faq) out.push(`Ε: ${q.q}`, `Α: ${q.a}`)
  }
  out.push('', '## ΕΣΠΑ, Αναπτυξιακός Νόμος ή LEADER — σύγκριση', `Πηγή: ${absoluteUrl('/espa-anaptyxiakos-leader')}`,
    'ΕΣΠΑ: συνήθως μικρότερα σχέδια, μη επιστρεπτέα επιχορήγηση, υποβολή στο ΠΣΚΕ. Αναπτυξιακός Νόμος (ν. 4887/2022): μεγαλύτερες επενδύσεις (κατά κανόνα από €100.000), επιχορήγηση/φορολογική απαλλαγή/leasing, συγκριτική αξιολόγηση. LEADER (ΣΣ ΚΑΠ 2023-2027): μικρές επιχειρήσεις σε αγροτικές/ορεινές/νησιωτικές περιοχές μέσω των Ομάδων Τοπικής Δράσης, υποβολή στο ΟΠΣΚΕ.')
  out.push('', '## Συχνές ερωτήσεις', `Πηγή: ${absoluteUrl('/syxnes-erotiseis')}`)
  for (const g of FAQ_HUB) { out.push('', `### ${g.title}`); for (const it of g.items) out.push(`Ε: ${it.q}`, `Α: ${it.a}`) }
  out.push('', '## Γλωσσάριο ΕΣΠΑ', `Πηγή: ${absoluteUrl('/glossari')}`)
  for (const t of GLOSSARY) out.push('', `### ${t.term}`, t.def)
  out.push('', '## Οδηγοί')
  for (const p of posts.filter(x => x.translations[0])) {
    const t = p.translations[0]
    // Η εισαγωγική απάντηση (πριν το πρώτο ##) — συνοπτική, «παραθέσιμη».
    const intro = (t.body.split(/\n##\s/)[0] ?? '').replace(/[#*_>`]/g, '').replace(/\[([^\]]+)\]\([^)]+\)/g, '$1').trim().slice(0, 900)
    out.push('', `### ${t.title}`, `URL: ${absoluteUrl(`/nea/${p.slug}`)} · ενημερώθηκε ${d(p.updatedAt)}`, intro || t.excerpt || '')
  }
  return new Response(out.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
