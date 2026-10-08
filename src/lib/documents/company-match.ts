/**
 * (Καθαρό module.) Αφορά το έγγραφο την επιλεγμένη επιχείρηση;
 *  • MATCH: περιέχει το ΑΦΜ της (ή, χωρίς κανένα ΑΦΜ, ταιριάζει η επωνυμία)
 *  • MISMATCH: ΔΕΝ περιέχει το ΑΦΜ της αλλά περιέχει άλλο έγκυρο ΑΦΜ με ετικέτα «ΑΦΜ»
 *  • UNKNOWN: δεν μπορεί να κριθεί (π.χ. σαρωμένο χωρίς κείμενο)
 * Έγγραφα με πολλά ΑΦΜ (π.χ. ΕΜΕ με εργαζόμενους) περνούν, αρκεί να υπάρχει και της εταιρίας.
 */

export type CompanyMatch = { status: 'MATCH' | 'MISMATCH' | 'UNKNOWN'; foundAfm: string | null; note: string | null }

/** Έλεγχος ψηφίου ελέγχου ελληνικού ΑΦΜ. */
export function isValidAfm(afm: string): boolean {
  if (!/^\d{9}$/.test(afm) || /^0{9}$/.test(afm)) return false
  let sum = 0
  for (let i = 0; i < 8; i++) sum += Number(afm[i]) * 2 ** (8 - i)
  return (sum % 11) % 10 === Number(afm[8])
}

const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase()
const STOP = new Set(['ΑΕ', 'ΕΠΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ', 'ΑΝΩΝΥΜΗ', 'ΕΤΑΙΡΕΙΑ', 'ΕΤΑΙΡΙΑ', 'ΜΟΝΟΠΡΟΣΩΠΗ', 'ΙΔΙΩΤΙΚΗ', 'ΚΕΦΑΛΑΙΟΥΧΙΚΗ', 'ΠΕΡΙΟΡΙΣΜΕΝΗΣ', 'ΕΥΘΥΝΗΣ', 'ΟΜΟΡΡΥΘΜΗ', 'ΕΤΕΡΟΡΡΥΘΜΗ', 'ΚΑΙ', 'ΤΟΥ', 'ΤΗΣ', 'ΤΩΝ'])

export function matchCompany(text: string, company: { afm: string | null; name: string }): CompanyMatch {
  const t = text ?? ''
  if (t.trim().length < 40) return { status: 'UNKNOWN', foundAfm: null, note: null }
  const digits = t.replace(/(\d)[ .](?=\d)/g, '$1') // «094 183 948» → 094183948
  const own = company.afm?.replace(/\D/g, '') ?? ''
  if (own.length === 9 && digits.includes(own)) return { status: 'MATCH', foundAfm: own, note: null }

  // ΑΦΜ με ετικέτα (Α.Φ.Μ., ΑΦΜ, VAT) — έγκυρα μόνο.
  const labelled: string[] = []
  const re = /(?:Α\.?\s?Φ\.?\s?Μ\.?|VAT(?:\s*(?:No|number))?)[^\d]{0,20}(?:EL|GR)?\s?(\d{9})(?!\d)/gi
  for (const m of digits.matchAll(re)) if (isValidAfm(m[1]) && !labelled.includes(m[1])) labelled.push(m[1])

  const words = fold(company.name).split(/[^Α-ΩA-Z0-9]+/).filter(w => w.length >= 4 && !STOP.has(w))
  const hay = fold(t)
  const nameHits = words.filter(w => hay.includes(w)).length
  const nameMatch = words.length > 0 && nameHits / words.length >= 0.6

  if (labelled.length && own.length === 9) {
    return { status: 'MISMATCH', foundAfm: labelled[0], note: `Το έγγραφο αναφέρει ΑΦΜ ${labelled[0]} — η επιχείρηση έχει ΑΦΜ ${own}.` }
  }
  if (nameMatch) return { status: 'MATCH', foundAfm: null, note: null }
  return { status: 'UNKNOWN', foundAfm: null, note: null }
}
