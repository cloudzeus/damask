/**
 * Απλή, εξαρτησιο-ελεύθερη σύγκριση επωνυμιών εταιρειών — χρησιμοποιείται στο
 * review panel του OCR (src/components/ocr/customer-card-panel.tsx) για να
 * σημάνει «⚠ Διαφορά επωνυμίας» όταν το OCR-extracted issuer.name διαφέρει
 * σημαντικά από την επίσημη ΑΑΔΕ επωνυμία/διακριτικό τίτλο.
 */

/**
 * Νομικές μορφές που αγνοούνται στη σύγκριση (token-based match, ΟΧΙ regex \b —
 * το \b του JS ορίζεται πάνω σε \w που ΔΕΝ περιλαμβάνει ελληνικούς χαρακτήρες,
 * οπότε θα απέτυχε σιωπηλά σε ελληνικό κείμενο).
 */
const LEGAL_FORM_TOKENS = new Set([
  'ΑΕ', 'ΑΒΕΕ', 'ΕΠΕ', 'ΙΚΕ', 'ΟΕ', 'ΕΕ', 'ΜΟΝΟΠΡΟΣΩΠΗ',
  'LTD', 'SA', 'LLC', 'INC', 'GMBH',
])

/**
 * Κανονικοποίηση επωνυμίας για fuzzy σύγκριση: κεφαλαία, αφαίρεση τόνων/διακριτικών,
 * αφαίρεση τελειών (ώστε συντομογραφίες όπως "Α.Ε." → "ΑΕ" ενοποιούνται σε ένα token),
 * αφαίρεση συνηθισμένων νομικών μορφών (ΑΕ/ΕΠΕ/ΙΚΕ/ΟΕ/ΕΕ/LTD/…) ως ξεχωριστά tokens,
 * collapse κενών.
 */
export function normalizeCompanyName(input: string | null | undefined): string {
  if (!input) return ''
  const cleaned = input
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '') // strip Greek τόνοι / Latin diacritics (combining marks after NFD)
    .toUpperCase()
    .replace(/\./g, '') // "Α.Ε." → "ΑΕ" (μία λέξη) πριν σπάσουμε σε tokens
    .replace(/[,'"()\-·&]/g, ' ')
  const tokens = cleaned.split(/\s+/).filter(t => t && !LEGAL_FORM_TOKENS.has(t))
  return tokens.join(' ').trim()
}

function bigramCounts(s: string): Map<string, number> {
  const out = new Map<string, number>()
  for (let i = 0; i < s.length - 1; i++) {
    const bg = s.slice(i, i + 2)
    out.set(bg, (out.get(bg) ?? 0) + 1)
  }
  return out
}

/**
 * Sørensen–Dice συντελεστής πάνω σε bigrams δύο κανονικοποιημένων επωνυμιών, 0..1
 * (1 = ταυτόσημες μετά την κανονικοποίηση, 0 = καμία κοινή διγραμμή). Κενές/πολύ
 * κοντές (<2 χαρακτήρες) εισόδους δίνουν 0.
 */
export function nameSimilarity(a: string | null | undefined, b: string | null | undefined): number {
  const na = normalizeCompanyName(a)
  const nb = normalizeCompanyName(b)
  if (!na || !nb) return 0
  if (na === nb) return 1
  if (na.length < 2 || nb.length < 2) return na === nb ? 1 : 0

  const ba = bigramCounts(na)
  const bb = bigramCounts(nb)
  let overlap = 0
  for (const [bg, count] of ba) {
    const other = bb.get(bg)
    if (other) overlap += Math.min(count, other)
  }
  const totalA = [...ba.values()].reduce((sum, c) => sum + c, 0)
  const totalB = [...bb.values()].reduce((sum, c) => sum + c, 0)
  const total = totalA + totalB
  return total === 0 ? 0 : (2 * overlap) / total
}

/** Κάτω από αυτό το threshold θεωρούμε ότι οι επωνυμίες "διαφέρουν σημαντικά". */
export const NAME_MISMATCH_THRESHOLD = 0.5

/**
 * true όταν το OCR-extracted όνομα δεν ταιριάζει ικανοποιητικά με ΚΑΝΕΝΑ από τα
 * επίσημα ονόματα (π.χ. onomasia + commer_title της ΑΑΔΕ) — false αν λείπει
 * είτε το ocrName είτε όλα τα official names (δεν υπάρχει τίποτα να συγκριθεί).
 */
export function isNameMismatch(
  ocrName: string | null | undefined,
  officialNames: Array<string | null | undefined>,
): boolean {
  const candidates = officialNames.filter((n): n is string => !!n && n.trim() !== '')
  if (!ocrName || !ocrName.trim() || candidates.length === 0) return false
  const best = Math.max(...candidates.map(c => nameSimilarity(ocrName, c)))
  return best < NAME_MISMATCH_THRESHOLD
}
