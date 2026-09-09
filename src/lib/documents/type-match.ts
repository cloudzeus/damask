import { normalizeTypeName } from '@/lib/programs/persist'

/**
 * Αντιστοίχιση ονόματος δικαιολογητικού σε τύπο (DocumentType). Δύο επίπεδα:
 *  1) EXACT — normalized ίδιο όνομα (σίγουρο, χωρίς false positives).
 *  2) FUZZY — token/prefix stemming (ελληνικά): όλα τα key-stems του τύπου
 *     περιέχονται στο όνομα ΚΑΙ ταιριάζει ΑΚΡΙΒΩΣ ένας τύπος (χωρίς ασάφεια).
 *     Επιστρέφεται με flag `fuzzy=true` ώστε το UI να το δείξει ως «πρόταση»
 *     προς επιβεβαίωση.
 */

// Γενικές λέξεις που δεν φέρουν διακριτική σημασία τύπου.
const STOP = new Set([
  'αποδεικτικο', 'βεβαιωση', 'εγγραφο', 'εγγραφα', 'η', 'ο', 'το', 'της', 'του', 'των', 'τη', 'τον',
  'και', 'ισοδυναμο', 'σχετικο', 'σχετικα', 'στοιχεια', 'δικαιολογητικα', 'επιχειρησης', 'επιχειρηση',
  'νομιμου', 'νομιμης', 'εκπροσωπου', 'τρεχουσας', 'εικονας', 'απο', 'τελευταιας', 'χρησης',
  'διαχειριστικης', 'ν', 'μμε', 'λογιστη', 'περι', 'μη', 'οικονομικα',
])

function normText(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9α-ω\s]/g, ' ').replace(/\s+/g, ' ').trim()
}

/** Tokens → stems: αφαίρεση stopwords + prefix-stemming (5 χαρ.) για ανοχή στις
 * ελληνικές καταλήξεις/πτώσεις (φορολογικη/φορολογικης → «φορολ»). */
function typeStems(s: string): string[] {
  return [...new Set(
    normText(s).split(' ').filter(t => t && !STOP.has(t) && t.length >= 2).map(t => (t.length > 5 ? t.slice(0, 5) : t)),
  )]
}

export type DocTypeLite = { id: string; name: string }
export type TypeMatch = { id: string; name: string; fuzzy: boolean }

/** Καλύτερη αντιστοίχιση τύπου για ένα όνομα δικαιολογητικού — null αν καμία/ασαφής. */
export function matchDocumentType(name: string, types: DocTypeLite[]): TypeMatch | null {
  const norm = normalizeTypeName(name)
  const exact = types.find(t => normalizeTypeName(t.name) === norm)
  if (exact) return { id: exact.id, name: exact.name, fuzzy: false }

  const nameStems = new Set(typeStems(name))
  const hits = types
    .map(t => ({ t, stems: typeStems(t.name) }))
    .filter(({ stems }) => stems.length > 0 && stems.every(st => nameStems.has(st)))
  if (hits.length === 1) return { id: hits[0].t.id, name: hits[0].t.name, fuzzy: true }
  return null // 0 ή ασαφές (>1) → καμία πρόταση
}
