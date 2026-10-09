import { prisma } from '@/lib/prisma'
import { listPublicPrograms, type PublicProgramCard } from '@/lib/programs/public'

/**
 * (Plain module.) Δεδομένα για τις σελίδες-κόμβους SEO: περιφέρειες, κλάδοι (ΚΑΔ), προθεσμίες, σχετικά άρθρα.
 * Όλα προκύπτουν από τα πραγματικά ενεργά προγράμματα — σελίδες χωρίς πρόγραμμα ΔΕΝ ευρετηριάζονται (thin content).
 */

/** `in`: «στην Αττική» · `of`: «της Αττικής» (σωστές πτώσεις για τα κείμενα των σελίδων). */
export type Hub = { slug: string; name: string; short: string; match: string[]; in: string; of: string }

/** Οι 13 Περιφέρειες (όνομα όπως στο ProgramRegion/Region + λέξεις ταιριάσματος). */
export const REGIONS: Hub[] = [
  { slug: 'attiki', in: 'στην Αττική', of: 'της Αττικής', name: 'Περιφέρεια Αττικής', short: 'Αττική', match: ['αττικ'] },
  { slug: 'kentriki-makedonia', in: 'στην Κεντρική Μακεδονία', of: 'της Κεντρικής Μακεδονίας', name: 'Περιφέρεια Κεντρικής Μακεδονίας', short: 'Κεντρική Μακεδονία', match: ['κεντρικ μακεδον', 'κεντρικής μακεδον'] },
  { slug: 'anatoliki-makedonia-thraki', in: 'στην Ανατολική Μακεδονία και Θράκη', of: 'της Ανατολικής Μακεδονίας και Θράκης', name: 'Περιφέρεια Ανατολικής Μακεδονίας και Θράκης', short: 'Ανατολική Μακεδονία – Θράκη', match: ['ανατολικ μακεδον', 'θρακ', 'θράκ'] },
  { slug: 'dytiki-makedonia', in: 'στη Δυτική Μακεδονία', of: 'της Δυτικής Μακεδονίας', name: 'Περιφέρεια Δυτικής Μακεδονίας', short: 'Δυτική Μακεδονία', match: ['δυτικ μακεδον', 'δυτικής μακεδον'] },
  { slug: 'ipeiros', in: 'στην Ήπειρο', of: 'της Ηπείρου', name: 'Περιφέρεια Ηπείρου', short: 'Ήπειρος', match: ['ηπειρ', 'ήπειρ'] },
  { slug: 'thessalia', in: 'στη Θεσσαλία', of: 'της Θεσσαλίας', name: 'Περιφέρεια Θεσσαλίας', short: 'Θεσσαλία', match: ['θεσσαλ'] },
  { slug: 'sterea-ellada', in: 'στη Στερεά Ελλάδα', of: 'της Στερεάς Ελλάδας', name: 'Περιφέρεια Στερεάς Ελλάδας', short: 'Στερεά Ελλάδα', match: ['στερε'] },
  { slug: 'ionia-nisia', in: 'στα Ιόνια Νησιά', of: 'των Ιονίων Νήσων', name: 'Περιφέρεια Ιονίων Νήσων', short: 'Ιόνια Νησιά', match: ['ιονι', 'ιόνι'] },
  { slug: 'dytiki-ellada', in: 'στη Δυτική Ελλάδα', of: 'της Δυτικής Ελλάδας', name: 'Περιφέρεια Δυτικής Ελλάδας', short: 'Δυτική Ελλάδα', match: ['δυτικ ελλαδ', 'δυτική ελλάδ', 'δυτικής ελλάδ'] },
  { slug: 'peloponnisos', in: 'στην Πελοπόννησο', of: 'της Πελοποννήσου', name: 'Περιφέρεια Πελοποννήσου', short: 'Πελοπόννησος', match: ['πελοπονν'] },
  { slug: 'voreio-aigaio', in: 'στο Βόρειο Αιγαίο', of: 'του Βορείου Αιγαίου', name: 'Περιφέρεια Βορείου Αιγαίου', short: 'Βόρειο Αιγαίο', match: ['βορει αιγαι', 'βόρειο αιγαί', 'βορείου αιγαί'] },
  { slug: 'notio-aigaio', in: 'στο Νότιο Αιγαίο', of: 'του Νοτίου Αιγαίου', name: 'Περιφέρεια Νοτίου Αιγαίου', short: 'Νότιο Αιγαίο', match: ['νοτι αιγαι', 'νότιο αιγαί', 'νοτίου αιγαί'] },
  { slug: 'kriti', in: 'στην Κρήτη', of: 'της Κρήτης', name: 'Περιφέρεια Κρήτης', short: 'Κρήτη', match: ['κρητ', 'κρήτ'] },
]

export type Sector = { slug: string; name: string; short: string; kad: string[]; about: string; examples: string[] }

/** Κλάδοι με τα πρόθεμα των ΚΑΔ τους (2 ψηφία) + σύντομη περιγραφή για την εισαγωγή της σελίδας. */
export const SECTORS: Sector[] = [
  { slug: 'tourismos', name: 'Τουρισμός & φιλοξενία', short: 'τουρισμό', kad: ['55', '56', '79', '93'], about: 'ξενοδοχεία, ενοικιαζόμενα δωμάτια, εστίαση, τουριστικά γραφεία και δραστηριότητες αναψυχής', examples: ['ανακαίνιση και εκσυγχρονισμός χώρων', 'ενεργειακή αναβάθμιση', 'ψηφιακά συστήματα κρατήσεων', 'εξοπλισμός κουζίνας'] },
  { slug: 'metapoiisi', name: 'Μεταποίηση & παραγωγή', short: 'μεταποίηση', kad: ['10', '11', '13', '14', '15', '16', '17', '18', '20', '21', '22', '23', '24', '25', '26', '27', '28', '29', '30', '31', '32', '33'], about: 'παραγωγικές μονάδες τροφίμων, ποτών, υλικών, μετάλλων, ηλεκτρονικών και λοιπών προϊόντων', examples: ['παραγωγικός μηχανολογικός εξοπλισμός', 'αυτοματισμοί', 'πιστοποιήσεις ποιότητας', 'κτιριακές βελτιώσεις'] },
  { slug: 'agrodiatrofi', name: 'Αγροδιατροφή', short: 'αγροδιατροφή', kad: ['01', '02', '03', '10', '11'], about: 'πρωτογενή παραγωγή, μεταποίηση και τυποποίηση τροφίμων και ποτών', examples: ['εξοπλισμός τυποποίησης', 'ψυκτικοί θάλαμοι', 'πιστοποιήσεις', 'ιχνηλασιμότητα'] },
  { slug: 'pliroforiki', name: 'Πληροφορική & ψηφιακές υπηρεσίες', short: 'πληροφορική', kad: ['58', '61', '62', '63'], about: 'ανάπτυξη λογισμικού, υπηρεσίες cloud, τηλεπικοινωνίες και ψηφιακά προϊόντα', examples: ['ανάπτυξη λογισμικού', 'υποδομές cloud', 'κυβερνοασφάλεια', 'έρευνα & ανάπτυξη'] },
  { slug: 'emporio', name: 'Εμπόριο & λιανική', short: 'εμπόριο', kad: ['45', '46', '47'], about: 'χονδρικό και λιανικό εμπόριο, καταστήματα και ηλεκτρονικό εμπόριο', examples: ['e-shop', 'εκσυγχρονισμός καταστήματος', 'συστήματα διαχείρισης αποθήκης', 'ενεργειακή αναβάθμιση'] },
  { slug: 'kataskeves', name: 'Κατασκευές', short: 'κατασκευές', kad: ['41', '42', '43'], about: 'τεχνικές και κατασκευαστικές εταιρείες, εργολαβίες και ειδικές εργασίες', examples: ['μηχανήματα έργων', 'ψηφιακά εργαλεία μελετών', 'εξοπλισμός ασφάλειας'] },
  { slug: 'ygeia', name: 'Υγεία & φροντίδα', short: 'υγεία', kad: ['75', '86', '87', '88'], about: 'ιατρεία, διαγνωστικά κέντρα, κτηνιατρεία και δομές φροντίδας', examples: ['ιατρικός εξοπλισμός', 'ψηφιακά συστήματα ασθενών', 'ανακαίνιση χώρων'] },
  { slug: 'metafores', name: 'Μεταφορές & logistics', short: 'μεταφορές', kad: ['49', '50', '51', '52', '53'], about: 'μεταφορικές εταιρείες, αποθήκευση, ταχυμεταφορές και logistics', examples: ['συστήματα διαχείρισης στόλου', 'αποθηκευτικός εξοπλισμός', 'πράσινα οχήματα'] },
  { slug: 'epaggelmatikes-ypiresies', name: 'Επαγγελματικές υπηρεσίες', short: 'επαγγελματικές υπηρεσίες', kad: ['69', '70', '71', '72', '73', '74'], about: 'λογιστικά, νομικά, μηχανολογικά/αρχιτεκτονικά γραφεία, έρευνα, διαφήμιση και συμβουλευτική', examples: ['ψηφιακός μετασχηματισμός', 'λογισμικό', 'πιστοποιήσεις', 'ανάπτυξη νέων υπηρεσιών'] },
  { slug: 'energeia', name: 'Ενέργεια & περιβάλλον', short: 'ενέργεια', kad: ['35', '36', '37', '38', '39'], about: 'παραγωγή ενέργειας, ανακύκλωση, διαχείριση υδάτων και αποβλήτων', examples: ['φωτοβολταϊκά αυτοκατανάλωσης', 'εξοπλισμός ανακύκλωσης', 'ενεργειακή αποδοτικότητα'] },
]

const norm = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/ς/g, 'σ')

type ProgramFacets = { slug: string; regions: string[]; kads: string[] }

async function facets(): Promise<ProgramFacets[]> {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const rows = await prisma.program.findMany({
    where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
    select: { publicSlug: true, regions: { select: { name: true } }, kads: { select: { code: true } } },
  })
  return rows.map(r => ({ slug: r.publicSlug!, regions: r.regions.map(x => norm(x.name)), kads: r.kads.map(k => k.code.replace(/\D/g, '')) }))
}

/** Ενεργά προγράμματα που αφορούν την περιφέρεια (χωρίς περιφερειακό περιορισμό = όλη η χώρα). */
export async function programsForRegion(region: Hub): Promise<PublicProgramCard[]> {
  const [all, f] = await Promise.all([listPublicPrograms(), facets()])
  const keys = region.match.map(norm)
  const ok = new Set(f.filter(p => !p.regions.length || p.regions.some(r => keys.some(k => k.split(' ').every(w => r.includes(w))))).map(p => p.slug))
  return all.filter(p => ok.has(p.slug))
}

/** Ενεργά προγράμματα που αφορούν τον κλάδο (επιλέξιμοι ΚΑΔ με το πρόθεμα· χωρίς λίστα ΚΑΔ = όλοι οι κλάδοι). */
export async function programsForSector(sector: Sector): Promise<PublicProgramCard[]> {
  const [all, f] = await Promise.all([listPublicPrograms(), facets()])
  const ok = new Set(f.filter(p => !p.kads.length || p.kads.some(k => sector.kad.some(pre => k.startsWith(pre)))).map(p => p.slug))
  return all.filter(p => ok.has(p.slug))
}

export type Deadline = { slug: string; title: string; deadline: Date | null; daysLeft: number | null; rate: string; region: string | null }

/** Προθεσμίες ενεργών προγραμμάτων (πλησιέστερη πρώτα· ανοιχτές χωρίς ημερομηνία στο τέλος). */
export async function listDeadlines(): Promise<Deadline[]> {
  const today = new Date(new Date().toISOString().slice(0, 10))
  const rows = await prisma.program.findMany({
    where: { status: 'ACTIVE', publicSlug: { not: null }, OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
    select: { publicSlug: true, title: true, submissionEnd: true, fundingRate: true, regions: { select: { name: true }, take: 3 } },
  })
  return rows
    .map(r => ({
      slug: r.publicSlug!, title: r.title, deadline: r.submissionEnd,
      daysLeft: r.submissionEnd ? Math.ceil((r.submissionEnd.getTime() - today.getTime()) / 86_400_000) : null,
      rate: r.fundingRate != null ? `έως ${Number(r.fundingRate)}%` : '—',
      region: r.regions.length ? r.regions.map(x => x.name).join(', ') : 'Όλη η Ελλάδα',
    }))
    .sort((a, b) => (a.deadline?.getTime() ?? Infinity) - (b.deadline?.getTime() ?? Infinity))
}

/** Άρθρα που συνδέουν προς το πρόγραμμα (εσωτερικός σύνδεσμος στο κείμενο ή γραμμένα από την ιδέα του). */
export async function relatedPostsForProgram(programSlug: string, programId?: string, limit = 4): Promise<{ slug: string; title: string; excerpt: string | null; image: string | null }[]> {
  const fromIdea = programId ? (await prisma.contentIdea.findMany({ where: { programId, postId: { not: null } }, select: { postId: true } })).map(i => i.postId!) : []
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED', OR: [{ id: { in: fromIdea } }, { translations: { some: { body: { contains: `/programmata/${programSlug}` } } } }] },
    orderBy: { publishedAt: 'desc' }, take: limit,
    select: { slug: true, featuredImage: true, translations: { where: { locale: 'el' }, select: { title: true, excerpt: true } } },
  })
  return rows.filter(r => r.translations[0]).map(r => ({ slug: r.slug, title: r.translations[0].title, excerpt: r.translations[0].excerpt, image: r.featuredImage }))
}

/** Γενικοί οδηγοί για κόμβους (π.χ. σελίδα περιφέρειας/κλάδου) — τα πιο πρόσφατα άρθρα που ταιριάζουν σε λέξεις. */
export async function guidesMatching(words: string[], limit = 3): Promise<{ slug: string; title: string }[]> {
  const rows = await prisma.post.findMany({
    where: { status: 'PUBLISHED', OR: words.map(w => ({ translations: { some: { title: { contains: w, mode: 'insensitive' as const } } } })) },
    orderBy: { publishedAt: 'desc' }, take: limit, select: { slug: true, translations: { where: { locale: 'el' }, select: { title: true } } },
  })
  return rows.filter(r => r.translations[0]).map(r => ({ slug: r.slug, title: r.translations[0].title }))
}

/** Σε ποιες σελίδες περιφέρειας/κλάδου ανήκει ένα πρόγραμμα (εσωτερικοί σύνδεσμοι από τη σελίδα του). */
export async function hubsForProgram(slug: string): Promise<{ regions: Hub[]; sectors: Sector[] }> {
  const p = (await facets()).find(x => x.slug === slug)
  if (!p) return { regions: [], sectors: [] }
  const regions = p.regions.length ? REGIONS.filter(h => h.match.map(norm).some(k => p.regions.some(r => k.split(' ').every(w => r.includes(w))))) : []
  const sectors = p.kads.length ? SECTORS.filter(s => p.kads.some(k => s.kad.some(pre => k.startsWith(pre)))) : []
  return { regions, sectors }
}

/** Επίσημη πρόσκληση: πρώτος σύνδεσμος (URL) από τη γνωσιακή μνήμη του προγράμματος, με προτίμηση σε κρατικά sites. */
export async function officialSourceFor(programId: string): Promise<string | null> {
  const refs = await prisma.programReference.findMany({ where: { programId, kind: 'URL', url: { not: null }, active: true }, select: { url: true }, orderBy: { createdAt: 'asc' } })
  const urls = refs.map(r => r.url!).filter(u => /^https:\/\//i.test(u))
  const official = /(espa\.gr|ependyseis\.gr|gov\.gr|antagonistikotita|pepattikis|\.europa\.eu|mou\.gr|ependyseis)/i
  return urls.find(u => official.test(u)) ?? urls[0] ?? null
}

/** «1 πρόγραμμα» / «3 προγράμματα» · ενεργό/ενεργά κ.λπ. */
export const nProgramms = (n: number) => `${n} πρόγραμμα${n === 1 ? '' : 'τα'}`.replace('πρόγραμματα', 'προγράμματα')

export type HubCounts = {
  total: number
  /** Προγράμματα χωρίς περιφερειακό περιορισμό (μετρούν σε κάθε περιφέρεια). */
  nationwide: number
  regions: { hub: Hub; total: number; local: number }[]
  sectors: { sector: Sector; total: number }[]
}

/** Πλήθος ενεργών προγραμμάτων ανά περιφέρεια/κλάδο (ένα query) — για πλοήγηση που δεν οδηγεί σε άδειες σελίδες. */
export async function hubCounts(): Promise<HubCounts> {
  const [all, f] = await Promise.all([listPublicPrograms(), facets()])
  const live = new Set(all.map(p => p.slug))
  const ps = f.filter(p => live.has(p.slug))
  const inRegion = (p: ProgramFacets, h: Hub) => p.regions.some(r => h.match.map(norm).some(k => k.split(' ').every(w => r.includes(w))))
  // Πανελλαδικό = χωρίς περιφέρειες, «όλη η Ελλάδα/επικράτεια», ή καταχωρισμένο με όλες τις περιφέρειες μία-μία.
  const isNationwide = (p: ProgramFacets) => !p.regions.length || p.regions.some(r => /ολη η ελλαδα|επικρατεια|πανελλαδικ/.test(r)) || REGIONS.every(h => inRegion(p, h))
  const nationwide = ps.filter(isNationwide).length
  return {
    total: ps.length,
    nationwide,
    regions: REGIONS.map(hub => {
      const local = ps.filter(p => !isNationwide(p) && inRegion(p, hub)).length
      return { hub, local, total: local + nationwide }
    }),
    sectors: SECTORS.map(sector => ({ sector, total: ps.filter(p => !p.kads.length || p.kads.some(k => sector.kad.some(pre => k.startsWith(pre)))).length })),
  }
}
