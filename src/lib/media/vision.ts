import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * (Plain module.) Το Gemini «βλέπει» φωτογραφίες για το δημόσιο site της WWA (ελληνική συμβουλευτική ΕΣΠΑ):
 *  • vetImage: απορρίπτει ό,τι δεν ταιριάζει (ξένα νομίσματα/σημαίες/τοπία εκτός Ευρώπης, θρησκευτικά σύμβολα ή
 *    ενδυμασίες, κείμενο/λογότυπα, άσχετο/κακής ποιότητας) — πριν χρησιμοποιηθεί σε άρθρο.
 *  • describeImage: περιγραφή + λέξεις-κλειδιά (για ταίριασμα με άρθρα) — π.χ. για φωτογραφίες από Envato Elements.
 */

const RULES = [
  'Η φωτογραφία θα μπει σε άρθρο ελληνικής συμβουλευτικής εταιρείας για επιδοτήσεις ΕΣΠΑ προς ΕΛΛΗΝΙΚΕΣ επιχειρήσεις.',
  'ΑΠΟΡΡΙΨΗ αν δείχνει: νομίσματα/χαρτονομίσματα εκτός ευρώ (π.χ. δολάρια), σημαίες ή σύμβολα κρατών εκτός Ελλάδας/ΕΕ, αναγνωρίσιμα τοπία/πόλεις/κτίρια/πινακίδες εκτός Ευρώπης, θρησκευτικά σύμβολα ή θρησκευτικές ενδυμασίες ΟΠΟΙΑΣΔΗΠΟΤΕ θρησκείας (ουδέτερη εικόνα), πολιτικά/στρατιωτικά θέματα, ιστορικές/ασπρόμαυρες/vintage εικόνες, εμφανές κείμενο/λογότυπα/υδατογραφήματα, παιδιά ως κύριο θέμα, αρνητικά συναισθήματα/καταστροφές, κακή ποιότητα/θόλωμα, άσχετο με επιχειρήσεις περιεχόμενο.',
  'ΑΠΑΓΟΡΕΥΕΤΑΙ να κρίνεις με βάση εθνικότητα, φυλή, χρώμα δέρματος, χαρακτηριστικά προσώπου, φύλο ή ηλικία των ανθρώπων — κρίνε ΜΟΝΟ περιβάλλον, σύμβολα, ποιότητα και σχέση με το θέμα.',
  'ΑΠΟΔΟΧΗ: σύγχρονοι επαγγελματίες/επιχειρήσεις/χώροι εργασίας/παραγωγή/τουρισμός/αγροτικά σε ουδέτερο ή ευρωπαϊκό/μεσογειακό περιβάλλον, καλή ποιότητα.',
].join('\n')

export async function vetImage(image: Buffer, topic: string, mimeType = 'image/webp'): Promise<{ ok: boolean; reason: string }> {
  try {
    const res = await geminiGenerate({
      parts: [{ inlineData: { data: image.toString('base64'), mimeType } }, { text: `Θέμα άρθρου: ${topic}` }],
      systemInstruction: `${RULES}\nΑπάντησε ΑΥΣΤΗΡΑ JSON: {"ok":true|false,"reason":"σύντομα, ελληνικά"}`,
      json: true, temperature: 0, maxOutputTokens: 300, fast: true, scope: 'OTHER', refType: 'image-vet',
    })
    const j = parseJsonLoose(res.text) as { ok?: boolean; reason?: string } | null
    return { ok: j?.ok === true, reason: j?.reason ?? '' }
  } catch (err) {
    // Αν ο έλεγχος αποτύχει, ΔΕΝ ρισκάρουμε ακατάλληλη εικόνα.
    return { ok: false, reason: `Ο έλεγχος απέτυχε: ${err instanceof Error ? err.message : String(err)}` }
  }
}

export async function describeImage(image: Buffer, mimeType = 'image/webp'): Promise<{ alt: string; tags: string[]; suitable: boolean } | null> {
  try {
    const res = await geminiGenerate({
      parts: [{ inlineData: { data: image.toString('base64'), mimeType } }],
      systemInstruction: [
        'Περίγραψε τη φωτογραφία για χρήση σε άρθρα ελληνικής συμβουλευτικής ΕΣΠΑ.',
        'alt: μία ελληνική πρόταση (≤ 120 χαρ.) — τι δείχνει (π.χ. «Μηχανικός ελέγχει γραμμή παραγωγής σε εργοστάσιο»).',
        'tags: 8-15 ΑΓΓΛΙΚΕΣ λέξεις-κλειδιά πεζά (επάγγελμα, χώρος, δραστηριότητα, κλάδος — π.χ. "engineer","factory","production","manufacturing").',
        `suitable: true/false με βάση τους κανόνες:\n${RULES}`,
        'ΑΥΣΤΗΡΑ JSON: {"alt":"…","tags":["…"],"suitable":true}',
      ].join('\n'),
      json: true, temperature: 0, maxOutputTokens: 500, fast: true, scope: 'OTHER', refType: 'image-describe',
    })
    const j = parseJsonLoose(res.text) as { alt?: string; tags?: string[]; suitable?: boolean } | null
    if (!j?.alt) return null
    return { alt: j.alt.slice(0, 200), tags: (j.tags ?? []).map(t => String(t).toLowerCase().trim()).filter(Boolean).slice(0, 20), suitable: j.suitable !== false }
  } catch {
    return null
  }
}
