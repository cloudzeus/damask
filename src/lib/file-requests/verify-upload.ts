import { geminiGenerate } from '@/lib/gemini'
import { parseJsonLoose } from '@/lib/ocr/extract'

/**
 * (Plain module.) ΥΠΟΧΡΕΩΤΙΚΟΣ έλεγχος ΠΡΙΝ αποθηκευτεί αρχείο που ζητήσαμε (σύνδεσμος αιτήματος /r/… για
 * λογιστή/πελάτη, έντυπα έργου στο portal): το Gemini διαβάζει το ίδιο το PDF/εικόνα και κρίνει αν είναι το
 * ζητούμενο έγγραφο και αν αφορά την επιχείρηση. Ό,τι δεν ταιριάζει ΔΕΝ ανεβαίνει.
 * (Εξαίρεση εκτός αυτού του module: το αρχείο δικαιολογητικών του πελάτη στο portal — εκεί ανεβάζει ό,τι θέλει.)
 */

export type UploadVerdict = { ok: true; detected: string; note: string } | { ok: false; reason: string }

const READABLE = /^(application\/pdf|image\/(jpeg|png|webp|heic|heif))$/i
const MAX_VERIFY_BYTES = 18 * 1024 * 1024

export async function verifyRequestedUpload(input: {
  bytes: Buffer
  mimeType: string
  fileName: string
  expected: { label: string; description?: string | null }
  company: { name: string; afm?: string | null }
}): Promise<UploadVerdict> {
  const mime = (input.mimeType || '').toLowerCase()
  if (!READABLE.test(mime)) {
    return { ok: false, reason: 'Ανεβάστε το έγγραφο ως PDF ή φωτογραφία (JPG/PNG), ώστε να γίνει ο αυτόματος έλεγχος.' }
  }
  if (input.bytes.length > MAX_VERIFY_BYTES) return { ok: false, reason: 'Το αρχείο είναι πολύ μεγάλο για έλεγχο (όριο 18MB). Σκανάρετε σε χαμηλότερη ανάλυση.' }

  const system = [
    'Είσαι ελεγκτής δικαιολογητικών ελληνικής συμβουλευτικής ΕΣΠΑ. Σου δίνεται ένα αρχείο και ΤΙ ΕΓΓΡΑΦΟ ζητήσαμε.',
    'Κρίνε ΑΥΣΤΗΡΑ αν το αρχείο είναι το ζητούμενο έγγραφο (ή ισοδύναμη επίσημη μορφή του — π.χ. ενημερότητα από myAADE/e-ΕΦΚΑ, πιστοποιητικό ΓΕΜΗ, έντυπο Ε3, ισολογισμός).',
    'Αν είναι άλλο έγγραφο, κενό/δυσανάγνωστο, άσχετη φωτογραφία ή μόνο μέρος που δεν αρκεί → match:false.',
    'company: "same" αν φαίνεται η επωνυμία ή ο ΑΦΜ της επιχείρησης, "other" αν φαίνεται ΑΛΛΗ επιχείρηση/ΑΦΜ, "unknown" αν δεν φαίνεται.',
    'Απάντησε ΑΥΣΤΗΡΑ JSON: {"match":true|false,"company":"same|other|unknown","detected":"τι έγγραφο είναι (σύντομα, ελληνικά)","reason":"μία πρόταση για τον χρήστη, ευγενικά, στον πληθυντικό"}',
  ].join('\n')
  const ask = `Ζητούμενο έγγραφο: «${input.expected.label}»${input.expected.description ? ` — ${input.expected.description}` : ''}\nΕπιχείρηση: ${input.company.name}${input.company.afm ? ` (ΑΦΜ ${input.company.afm})` : ''}\nΌνομα αρχείου: ${input.fileName}`

  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const res = await geminiGenerate({
        parts: [{ inlineData: { data: input.bytes.toString('base64'), mimeType: mime === 'image/heic' || mime === 'image/heif' ? 'image/jpeg' : mime } }, { text: ask }],
        systemInstruction: system, json: true, temperature: 0, maxOutputTokens: 400, fast: true, scope: 'OTHER', refType: 'upload-verify',
      })
      const j = parseJsonLoose(res.text) as { match?: boolean; company?: string; detected?: string; reason?: string } | null
      if (!j || typeof j.match !== 'boolean') continue
      const detected = (j.detected ?? '').slice(0, 160)
      if (j.company === 'other') return { ok: false, reason: `Το έγγραφο φαίνεται να αφορά άλλη επιχείρηση${detected ? ` («${detected}»)` : ''}. Ανεβάστε το έγγραφο της ${input.company.name}.` }
      if (!j.match) return { ok: false, reason: `Αυτό δεν είναι το «${input.expected.label}»${detected ? ` — μοιάζει με «${detected}»` : ''}. Ελέγξτε ότι επιλέξατε το σωστό αρχείο.` }
      return { ok: true, detected, note: `Έλεγχος AI ✓ ${detected || input.expected.label}${j.company === 'unknown' ? ' (δεν φαίνεται επωνυμία/ΑΦΜ)' : ''}` }
    } catch {
      /* δεύτερη προσπάθεια */
    }
  }
  return { ok: false, reason: 'Ο αυτόματος έλεγχος δεν είναι διαθέσιμος αυτή τη στιγμή. Δοκιμάστε ξανά σε λίγα λεπτά.' }
}
