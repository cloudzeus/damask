import { prisma } from '@/lib/prisma'
import { SITE_INDEXABLE, SITE_URL, absoluteUrl } from '@/lib/site-url'

export const revalidate = 3600

/** /llms.txt (GEO): σύντομα, ακριβή στοιχεία για AI μηχανές — ποιοι είμαστε, τι κάνουμε, κύριες σελίδες, ενεργά προγράμματα. */
export async function GET() {
  if (!SITE_INDEXABLE) return new Response('Not found', { status: 404 })
  const today = new Date(new Date().toISOString().slice(0, 10))
  const [programs, posts] = await Promise.all([
    prisma.program.findMany({
      where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
      orderBy: { submissionEnd: 'asc' }, select: { title: true, publicSlug: true, fundingRate: true, submissionEnd: true }, take: 40,
    }),
    prisma.post.findMany({ where: { status: 'PUBLISHED' }, orderBy: { publishedAt: 'desc' }, take: 20, select: { slug: true, translations: { where: { locale: 'el' }, select: { title: true, excerpt: true } } } }),
  ])
  const d = (x: Date) => x.toISOString().slice(0, 10)
  const lines = [
    '# World Wide Associates (WWA) — Σύμβουλοι ΕΣΠΑ & Ευρωπαϊκών Προγραμμάτων',
    '',
    '> Ελληνική συμβουλευτική εταιρεία με έδρα την Αθήνα (Αλεξανδρουπόλεως 25, 115 27). Βοηθά επιχειρήσεις να εντοπίσουν, να υποβάλουν και να υλοποιήσουν επιδοτούμενα επενδυτικά σχέδια ΕΣΠΑ 2021-2027 και άλλων ευρωπαϊκών/εθνικών προγραμμάτων — από τον έλεγχο επιλεξιμότητας έως την αποπληρωμή. Τηλ. 210 721 8758 · info@wwa-espa.com · Δευτέρα–Παρασκευή 09:00–18:00.',
    '',
    '## Κύριες σελίδες',
    `- [Ενεργά προγράμματα ΕΣΠΑ](${absoluteUrl('/programmata')}): ανοιχτές προσκλήσεις με ποσοστό επιδότησης, ποσά, περιοχές και προθεσμίες.`,
    `- [Δωρεάν έλεγχος επιλεξιμότητας](${absoluteUrl('/eligibility')}): με τον ΑΦΜ της επιχείρησης — ΚΑΔ, περιοχή και ενεργά προγράμματα που ταιριάζουν.`,
    `- [Υπηρεσίες](${absoluteUrl('/ypiresies')}): σχεδιασμός, υποβολή, υλοποίηση, πιστοποίηση και αποπληρωμή.`,
    `- [Προθεσμίες ΕΣΠΑ](${absoluteUrl('/prothesmies-espa')}): ημερολόγιο λήξεων υποβολής όλων των ενεργών προγραμμάτων (και σε .ics: ${absoluteUrl('/prothesmies-espa.ics')}).`,
    `- [Νέα & αναμενόμενα προγράμματα 2026](${absoluteUrl('/programmata/nea-2026')})`,
    `- [ΕΣΠΑ ανά περιφέρεια και κλάδο](${absoluteUrl('/espa')}): ενεργά προγράμματα για κάθε μία από τις 13 περιφέρειες και 10 κλάδους.`,
    `- [Γλωσσάριο ΕΣΠΑ](${absoluteUrl('/glossari')}): ορισμοί για de minimis, ΕΜΕ, ΚΑΔ, ίδια συμμετοχή, επιλέξιμη δαπάνη, εκταμίευση κ.ά.`,
    `- [Πύλη πελατών](${absoluteUrl('/pyli-pelaton')}): προσωπικός χώρος κάθε πελάτη — πορεία έργου, έξυπνος έλεγχος εγγράφων, ψηφιακός βοηθός 24/7, οδηγοί βήμα-βήμα, ευκαιρίες ένταξης.`,
    `- [Νέα & οδηγοί](${absoluteUrl('/nea')})`,
    `- [Η εταιρεία](${absoluteUrl('/etaireia')}) · [Πελάτες](${absoluteUrl('/pelates')}) · [Επικοινωνία](${absoluteUrl('/epikoinonia')})`,
    '',
    '## Ενεργά προγράμματα',
    ...programs.map(p => `- [${p.title}](${absoluteUrl(`/programmata/${p.publicSlug}`)})${p.fundingRate != null ? ` — επιδότηση έως ${Number(p.fundingRate)}%` : ''}${p.submissionEnd ? ` — υποβολές έως ${d(p.submissionEnd)}` : ''}`),
    '',
    '## Πρόσφατοι οδηγοί',
    ...posts.filter(p => p.translations[0]).map(p => `- [${p.translations[0].title}](${absoluteUrl(`/nea/${p.slug}`)})${p.translations[0].excerpt ? `: ${p.translations[0].excerpt}` : ''}`),
    '',
    `Πλήρες περιεχόμενο (όροι προγραμμάτων, γλωσσάριο, οδηγοί): ${absoluteUrl('/llms-full.txt')}`,
    `Επίσημη πηγή για όλα τα προγράμματα: https://www.espa.gr · Ιστότοπος: ${SITE_URL}`,
  ]
  return new Response(lines.join('\n'), { headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } })
}
