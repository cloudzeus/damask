/**
 * Greeklish transliteration + slugify — για αυτόματα URL slugs από ελληνικούς
 * τίτλους (άρθρα CMS, κατηγορίες). Καθαρές, ντετερμινιστικές functions χωρίς
 * καμία εξάρτηση DB/Next — η μοναδικότητα (unique constraint στο Prisma)
 * ελέγχεται στο επίπεδο του server action που καλεί slugify (βλ.
 * nextSlugCandidate + το read-before-write loop στα actions.ts).
 *
 * Κανόνας μεταγραφής: ELOT 743-ish — τα αυ/ευ/ηυ γίνονται af/ef/if πριν από
 * άφωνο σύμφωνο (θκξπστφχψ) ή στο τέλος λέξης, αλλιώς av/ev/iv· τα
 * μπ/ντ/γκ/γγ/τσ/τζ και οι δίφθογγοι αι/ει/οι/υι/ου γίνονται digraphs
 * (mp/nt/gk/ng/ts/tz/ai/ei/oi/yi/ou) — το «καθημερινό» greeklish που
 * αναγνωρίζουν οι χρήστες, όχι το επίσημο διαβατηριακό (b/d/g).
 */

const UNVOICED = new Set(['θ', 'κ', 'ξ', 'π', 'σ', 'τ', 'φ', 'χ', 'ψ'])

// Και τονισμένη μορφή του πρώτου φωνήεντος — «αύριο»/«εύκολο» τονίζονται συχνά
// πάνω στο υ/ύ, όχι στο α/ε/η, οπότε το ίδιο το γράμμα-έναυσμα μένει άτονο.
const AU_EU_BASE: Record<string, string> = { α: 'a', ά: 'a', ε: 'e', έ: 'e', η: 'i', ή: 'i' }

// Και τονισμένες μορφές (αί/εί/οί/υί/ού) — π.χ. «σαλονιού» λήγει σε -ού.
const DIGRAPHS: [string, string][] = [
  ['μπ', 'mp'], ['ντ', 'nt'], ['γκ', 'gk'], ['γγ', 'ng'],
  ['τσ', 'ts'], ['τζ', 'tz'],
  ['αι', 'ai'], ['αί', 'ai'],
  ['ει', 'ei'], ['εί', 'ei'],
  ['οι', 'oi'], ['οί', 'oi'],
  ['υι', 'yi'], ['υί', 'yi'],
  ['ου', 'ou'], ['ού', 'ou'],
]

const SINGLE: Record<string, string> = {
  α: 'a', ά: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', έ: 'e', ζ: 'z',
  η: 'i', ή: 'i', θ: 'th', ι: 'i', ί: 'i', ϊ: 'i', ΐ: 'i',
  κ: 'k', λ: 'l', μ: 'm', ν: 'n', ξ: 'x', ο: 'o', ό: 'o',
  π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', ύ: 'y', ϋ: 'y', ΰ: 'y',
  φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o', ώ: 'o',
}

/** Πρώτο πέρασμα: αυ/ευ/ηυ (τονισμένα ή μη) → af/ef/if (πριν άφωνο ή στο τέλος) ή av/ev/iv (αλλού). */
function replaceAuEuHu(lower: string): string {
  return lower.replace(/([αεηάέή])[υύ]/g, (match, vowel: string, offset: number) => {
    const nextChar = lower[offset + match.length]
    const unvoicedOrEnd = !nextChar || UNVOICED.has(nextChar)
    return `${AU_EU_BASE[vowel]}${unvoicedOrEnd ? 'f' : 'v'}`
  })
}

/** Ελληνικό κείμενο (οποιαδήποτε πτώση/τόνοι) → πεζό λατινικό greeklish. Μη-ελληνικοί χαρακτήρες μένουν ως έχουν. */
export function transliterateGreek(text: string): string {
  let out = text.toLowerCase()
  out = replaceAuEuHu(out)
  for (const [greek, latin] of DIGRAPHS) {
    out = out.split(greek).join(latin)
  }
  out = Array.from(out).map(ch => SINGLE[ch] ?? ch).join('')
  return out
}

const MAX_SLUG_LENGTH = 160

/** Μεταγραφή + καθαρισμός σε URL slug (πεζά a-z0-9, ενωμένα με '-'). Ποτέ κενό string. */
export function slugify(text: string): string {
  const transliterated = transliterateGreek(text)
  let slug = transliterated
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  if (slug.length > MAX_SLUG_LENGTH) {
    slug = slug.slice(0, MAX_SLUG_LENGTH).replace(/-+$/g, '')
  }
  return slug || 'item'
}

/** n-οστή υποψηφιότητα slug σε περίπτωση σύγκρουσης μοναδικότητας: base, base-2, base-3, … */
export function nextSlugCandidate(base: string, attempt: number): string {
  return attempt <= 1 ? base : `${base}-${attempt}`
}
