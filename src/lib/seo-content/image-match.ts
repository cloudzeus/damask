import { prisma } from '@/lib/prisma'
import { deepseekChat } from '@/lib/deepseek'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { ELEMENTS_FOLDER, ELEMENTS_NAME, labelFromName } from '@/lib/media/elements'

/**
 * (Plain module.) Αντιστοίχιση φωτογραφιών Envato Elements σε άρθρα ΜΕ ΒΑΣΗ ΤΗΝ ΠΕΡΙΓΡΑΦΗ ΣΤΟ ΟΝΟΜΑ ΑΡΧΕΙΟΥ
 * («researchers-collaborating-in-bright-lab-…-utc» → «researchers collaborating in bright lab»).
 * Ξεχωριστό βήμα (όχι «παρεμπιπτόντως» μέσα στη συγγραφή): ο επιμελητής φωτογραφίας βλέπει ΟΛΑ τα άρθρα και
 * ΟΛΕΣ τις φωτογραφίες και κάνει 1-προς-1 ανάθεση — ο κλάδος του άρθρου πρέπει να φαίνεται στη φωτογραφία.
 */

export type Photo = { url: string; label: string }

/** Όλες οι φωτογραφίες Elements της Gallery (όνομα αρχείου = περιγραφή), εκτός όσων σημειώθηκαν ακατάλληλες. */
export async function elementsPhotos(): Promise<Photo[]> {
  const folder = await prisma.mediaFolder.findFirst({ where: { name: ELEMENTS_FOLDER, parentId: null }, select: { id: true } })
  const assets = await prisma.mediaAsset.findMany({ where: { type: 'IMAGE' }, select: { cdnUrl: true, name: true, folderId: true, meta: true }, orderBy: { createdAt: 'desc' }, take: 5000 })
  const seen = new Set<string>()
  return assets
    .filter(a => { const m = (a.meta ?? {}) as { source?: string; suitable?: boolean }; return m.suitable !== false && (m.source === 'elements' || a.folderId === folder?.id || ELEMENTS_NAME.test(a.name)) })
    .map(a => ({ url: a.cdnUrl, label: labelFromName(a.name).slice(0, 110) }))
    // Το ίδιο αρχείο ανεβασμένο 2 φορές = μία φωτογραφία.
    .filter(p => { const k = p.label.toLowerCase(); if (seen.has(k)) return false; seen.add(k); return true })
}

const RULES = [
  'Είσαι photo editor ελληνικού επιχειρηματικού site για επιδοτήσεις ΕΣΠΑ. Κάθε φωτογραφία περιγράφεται από το όνομα του αρχείου της.',
  'Αντιστοίχισε σε ΚΑΘΕ άρθρο τη φωτογραφία που δείχνει ΤΟ ΘΕΜΑ ΤΟΥ: τουρισμός → ξενοδοχείο/καταλύματα/εστίαση/ταξιδιώτες· μεταποίηση → εργοστάσιο/μηχανικοί/παραγωγή· έρευνα/καινοτομία → εργαστήριο/επιστήμονες· ψηφιακά/τεχνολογίες → προγραμματιστές/server room· αγροτικά/αγροδιατροφή → αγρότες/θερμοκήπιο· λιανεμπόριο → κατάστημα· ενέργεια → φωτοβολταϊκά/ηλεκτρικό αυτοκίνητο· φορολογικά/de minimis/οικονομικά → φόροι/γραφήματα/ανάλυση δεδομένων· δικαιολογητικά/αιτήσεις → γραφείο με έγγραφα/clipboard· γενικά ΕΣΠΑ/ΜμΕ → ομάδα επιχείρησης σε γραφείο.',
  'ΠΟΤΕ φωτογραφίες ιδιωτικής ζωής (ζευγάρια, φίλοι, οικογένεια, ψώνια για διασκέδαση, μπόουλινγκ, διακοπές, κοντινά προσώπων, ιατρικά) εκτός αν το θέμα είναι ακριβώς αυτό (π.χ. τουρισμός → ταξιδιώτες είναι ΟΚ).',
  'Κάθε φωτογραφία το πολύ ΜΙΑ φορά. Αν καμία δεν ταιριάζει πραγματικά, βάλε 0 (θα βρεθεί άλλη).',
].join('\n')

/** 1-προς-1 ανάθεση: articles[i] → φωτογραφία (ή null). */
export async function assignPhotos(articles: { title: string; excerpt?: string | null }[], photos: Photo[]): Promise<(Photo | null)[]> {
  if (!articles.length || !photos.length) return articles.map(() => null)
  const messages = [
    { role: 'system' as const, content: `${RULES}\nΑΥΣΤΗΡΑ JSON: {"assign":[{"a":1,"p":12}]} — ένα στοιχείο για ΚΑΘΕ άρθρο, χωρίς άλλο κείμενο.` },
    { role: 'user' as const, content: `ΑΡΘΡΑ:\n${articles.map((a, i) => `${i + 1}) ${a.title}${a.excerpt ? ` — ${a.excerpt.slice(0, 160)}` : ''}`).join('\n')}\n\nΦΩΤΟΓΡΑΦΙΕΣ:\n${photos.map((p, i) => `${i + 1}) ${p.label}`).join('\n')}` },
  ]
  type Res = { assign?: { a?: number; p?: number }[] }
  let j = null as Res | null
  // Με μία επανάληψη: αν η «σκέψη» φάει τα tokens, η απάντηση έρχεται κενή.
  for (let attempt = 0; attempt < 2 && !j?.assign?.length; attempt++) {
    const raw = await deepseekChat(messages, { model: 'deepseek-v4-pro', reasoningEffort: 'low', maxTokens: 24000, temperature: 0.2, timeoutMs: 240_000, refType: 'seo-photo-match' })
    try { j = parseJsonLoose(raw) as Res | null } catch { j = null }
  }
  const out: (Photo | null)[] = articles.map(() => null)
  const used = new Set<number>()
  for (const x of j?.assign ?? []) {
    const a = Number(x.a) - 1, p = Number(x.p) - 1
    if (a < 0 || a >= articles.length || p < 0 || p >= photos.length || used.has(p) || out[a]) continue
    used.add(p)
    out[a] = photos[p]
  }
  return out
}

/** Μία φωτογραφία για ΝΕΟ άρθρο, από όσες δεν χρησιμοποιούνται ήδη. */
export async function matchPhotoForArticle(title: string, excerpt?: string | null): Promise<Photo | null> {
  const used = new Set((await prisma.post.findMany({ where: { featuredImage: { not: null } }, select: { featuredImage: true } })).map(p => p.featuredImage))
  const free = (await elementsPhotos()).filter(p => !used.has(p.url))
  return (await assignPhotos([{ title, excerpt }], free).catch(() => [null]))[0]
}

/** Ξανα-αντιστοίχιση ΟΛΩΝ των AI άρθρων (τα δελτία Τύπου κρατούν τη δική τους φωτογραφία). */
export async function rematchAllArticlePhotos(): Promise<{ updated: number; changes: { title: string; photo: string }[] }> {
  const posts = await prisma.post.findMany({
    where: { aiGenerated: true, status: { in: ['PUBLISHED', 'REVIEW'] } }, orderBy: { publishedAt: 'desc' },
    select: { id: true, featuredImage: true, translations: { where: { locale: 'el' }, select: { title: true, excerpt: true } } },
  })
  const list = posts.filter(p => p.translations[0])
  const photos = await elementsPhotos()
  const picks = await assignPhotos(list.map(p => ({ title: p.translations[0].title, excerpt: p.translations[0].excerpt })), photos)
  const changes: { title: string; photo: string }[] = []
  for (let i = 0; i < list.length; i++) {
    const pick = picks[i]
    if (!pick || pick.url === list[i].featuredImage) continue
    await prisma.post.update({ where: { id: list[i].id }, data: { featuredImage: pick.url } })
    changes.push({ title: list[i].translations[0].title, photo: pick.label })
  }
  return { updated: changes.length, changes }
}
