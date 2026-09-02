// SERVER: πλήρης εξαγωγή ΚΑΔ ενός προγράμματος χρηματοδότησης από το κείμενο
// του PDF. Το DeepSeek prompt (extract-prompt.ts §ΚΑΔ) ΣΚΟΠΙΜΑ επιστρέφει μόνο
// ~20 αντιπροσωπευτικούς ΚΑΔ ως δείγμα και αφήνει την πλήρη λίστα σε ΑΥΤΟ το
// regex + registry βήμα — αλλιώς το output θα ξεπερνούσε το max_tokens σε
// προσκλήσεις με εκατοντάδες ΚΑΔ και θα κοβόταν.
//
// Κάθε υποψήφιος κωδικός φιλτράρεται μέσω του μητρώου KadCode (W1): κρατάμε ΜΟΝΟ
// όσους αντιστοιχούν σε πραγματικό ΚΑΔ, οπότε ημερομηνίες (31.12.2024), ποσά
// (1.000.000) και άσχετοι αριθμοί απορρίπτονται αυτόματα. Το αποτέλεσμα φέρει
// τον canonical dotted κωδικό + περιγραφή από το μητρώο.

import { prisma } from '@/lib/prisma'

// Dotted ΚΑΔ token: 2ψήφιος τομέας + 1–4 ομάδες ".<1-3 ψηφία>"
// (π.χ. 20.5, 20.51, 20.51.1, 20.59.59.03). Bare runs χωρίς τελείες ΔΕΝ
// πιάνονται επίτηδες (θόρυβος: ΑΦΜ / ΑΔΑ / τηλέφωνα / αριθμοί ΦΕΚ).
const KAD_TOKEN = /\d{2}(?:\.\d{1,3}){1,4}/g

export type ExtractedKad = { code: string; description: string | null }

/**
 * Σαρώνει όλο το κείμενο του PDF, μαζεύει υποψήφιους ΚΑΔ, τους αντιστοιχεί στο
 * μητρώο KadCode και επιστρέφει τη ΜΟΝΑΔΙΚΗ λίστα των πραγματικών ΚΑΔ που
 * βρέθηκαν (canonical code + περιγραφή), ταξινομημένη κατά κωδικό.
 */
export async function extractProgramKads(text: string): Promise<ExtractedKad[]> {
  if (!text) return []

  const digitForms = new Set<string>()
  for (const m of text.matchAll(KAD_TOKEN)) {
    // Απόρριψε fragments μεγαλύτερου αριθμού: τηλέφωνο "210.1234567" → "10.123",
    // ημερομηνία "31.12.2024" → "31.12.202", ΑΦΜ/ΦΕΚ. Ένα γνήσιο ΚΑΔ σε πίνακα
    // περιβάλλεται από κενό/γράμμα, ΠΟΤΕ από ψηφίο ή τελεία.
    const start = m.index ?? 0
    const before = start > 0 ? text[start - 1] : ''
    const after = text[start + m[0].length] ?? ''
    if (/[\d.]/.test(before) || /\d/.test(after)) continue
    const digits = m[0].replace(/\D/g, '')
    // Έγκυρα μήκη ΚΑΔ: 3 (τάξη π.χ. 20.5 → "205") έως 10 ψηφία (εθνικοί).
    if (digits.length >= 3 && digits.length <= 12) digitForms.add(digits)
  }
  if (digitForms.size === 0) return []

  // Ένα batch query — κάθε επιστρεφόμενη γραμμή είναι πραγματικός ΚΑΔ που
  // εμφανίστηκε στο κείμενο (το codeWithoutDots ταιριάζει με έναν υποψήφιο).
  const rows = await prisma.kadCode.findMany({
    where: { codeWithoutDots: { in: [...digitForms] } },
    select: { code: true, title: true, description: true },
  })

  const out = new Map<string, ExtractedKad>()
  for (const r of rows) {
    if (!out.has(r.code)) out.set(r.code, { code: r.code, description: r.title ?? r.description ?? null })
  }
  return [...out.values()].sort((a, b) => a.code.localeCompare(b.code))
}
