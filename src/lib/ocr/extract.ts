import { geminiGenerate, type GeminiPart } from '@/lib/gemini'
import { generateText } from '@/lib/deepseek'
import { getIntegration, isIntegrationConfigured } from '@/lib/settings'
import { parseExtractedDocument, type OcrDocTypeHint, type ExtractedDocument } from './schema'
import { validateExtractedDocument } from './validate'
import type { MismatchFlag } from './invoice-math'

/**
 * Server-side εξαγωγή δομημένων δεδομένων από παραστατικό (τιμολόγιο/απόδειξη/
 * δελτίο αποστολής): εικόνες (ή/και ήδη-εξαγμένο κείμενο) → Gemini vision (JSON
 * mode) → zod-validate (schema.ts) → αριθμητικός/ΑΦΜ έλεγχος (validate.ts).
 *
 * Primary: Google Gemini (μόνη επιλογή που «βλέπει» εικόνες). Αν το Gemini δεν
 * είναι ρυθμισμένο ΚΑΙ υπάρχει ήδη εξαγμένο κείμενο (π.χ. επιλέξιμο κείμενο PDF,
 * εξαγμένο client-side στο OcrUploader) → fallback σε DeepSeek chat (only text,
 * βλέπει ΜΟΝΟ το κείμενο, όχι τις εικόνες). Αν λείπουν και τα δύο → φιλικό λάθος.
 */

export const GEMINI_NOT_CONFIGURED_MESSAGE =
  'Ρύθμισε το Google Gemini για OCR εικόνων στις Ρυθμίσεις (Διασυνδέσεις → Google Gemini).'

export interface OcrImageInput {
  base64: string
  mimeType: string
}

export interface ExtractDocumentInput {
  images: OcrImageInput[]
  /** Ήδη εξαγμένο κείμενο (π.χ. επιλέξιμο κείμενο ψηφιακού PDF) — επιτρέπει DeepSeek fallback χωρίς Gemini. */
  text?: string
  docType?: OcrDocTypeHint
}

export interface ExtractResult {
  data: ExtractedDocument
  mismatches: MismatchFlag[]
  model: string
  /** true όταν χρησιμοποιήθηκε το DeepSeek text-only fallback αντί για Gemini vision. */
  usedFallback: boolean
}

/** Ανεκτικό parse JSON — αφαιρεί code fences και, αν χρειαστεί, κόβει το πρώτο {...} block. */
export function parseJsonLoose(s: string): unknown {
  if (!s || !s.trim()) throw new Error('Κενή απάντηση από το AI.')
  const cleaned = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '').trim()
  try {
    return JSON.parse(cleaned)
  } catch { /* fall through to brace-extraction */ }
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start !== -1 && end > start) {
    return JSON.parse(cleaned.slice(start, end + 1))
  }
  throw new Error('Η απάντηση του AI δεν ήταν έγκυρο JSON.')
}

const JSON_SHAPE = `{
  "docType": "invoice" | "receipt" | "packing_list",
  "issuer": { "name": string|null, "afm": string|null, "address": string|null },
  "counterparty": { "name": string|null, "afm": string|null, "address": string|null } | null,
  "documentNumber": string|null,
  "date": string|null,
  "currency": string|null,
  "lines": [ { "description": string, "quantity": number|null, "unitPrice": number|null, "vatPct": number|null, "total": number|null } ],
  "totals": { "net": number|null, "vat": number|null, "gross": number|null },
  "confidence": number,
  "notes": string|null
}`

/** Οδηγίες προς το μοντέλο — Ελληνικό context (ΑΦΜ/ΦΠΑ), αυστηρό JSON, καμία επιπλέον απάντηση. */
export function buildOcrPrompt(docTypeHint: OcrDocTypeHint = 'auto'): string {
  const hintLine = docTypeHint !== 'auto'
    ? `\nΟ χρήστης υποδεικνύει ότι το έγγραφο είναι πιθανότατα τύπου "${docTypeHint}" — επιβεβαίωσέ το αν συμφωνεί με αυτό που βλέπεις, αλλιώς διόρθωσέ το.`
    : ''

  return `Είσαι ειδικός στην ανάγνωση ελληνικών εμπορικών παραστατικών (τιμολόγια, αποδείξεις λιανικής, δελτία αποστολής/packing lists) από φωτογραφίες ή σελίδες PDF.

Ανάλυσε προσεκτικά το έγγραφο και επίστρεψε ΑΥΣΤΗΡΑ έγκυρο JSON (χωρίς code fences, χωρίς σχόλια, χωρίς κανένα επιπλέον κείμενο πριν ή μετά) με ΑΚΡΙΒΩΣ αυτή τη δομή:

${JSON_SHAPE}

Κανόνες:
- Το ΑΦΜ (afm) είναι πάντα 9 ψηφία — αν δεις πρόθεμα χώρας (EL/GR) αφαίρεσέ το.
- Οι συντελεστές ΦΠΑ στην Ελλάδα είναι συνήθως 24%, 13% ή 6% (σπανιότερα 17%/9%/4% σε νησιά, ή 0% για απαλλαγή) — γράψε τον αριθμό (π.χ. 24), όχι string, όχι το σύμβολο %.
- Όλα τα ποσά ως αριθμοί (numbers) με τελεία δεκαδικών, ΟΧΙ strings, ΟΧΙ σύμβολο €.
- Αν ένα πεδίο δεν φαίνεται καθαρά στο έγγραφο, βάλε null — ΜΗΝ μαντεύεις τιμές.
- "packing_list" = δελτίο αποστολής χωρίς τιμές/ΦΠΑ (μόνο περιγραφές/ποσότητες)· τα lines[].unitPrice/vatPct/total και τα totals μπορεί να είναι όλα null.
- "receipt" = απόδειξη λιανικής, συνήθως χωρίς στοιχεία παραλήπτη (counterparty null).
- "invoice" = τιμολόγιο, με στοιχεία παραλήπτη (counterparty) όποτε αναγράφονται.
- "confidence": πόσο σίγουρος είσαι συνολικά για την ανάγνωση, από 0 έως 1.
- "notes": σύντομη σημείωση (μία πρόταση) για ασάφειες, δυσανάγνωστα σημεία, ή null αν δεν υπάρχει κάτι αξιοσημείωτο.${hintLine}

Απάντησε ΜΟΝΟ με το JSON αντικείμενο.`
}

async function resolveAiCall(
  prompt: string, input: ExtractDocumentInput,
): Promise<{ rawText: string; model: string; usedFallback: boolean }> {
  const hasText = !!input.text?.trim()
  const hasImages = input.images.length > 0

  const gemini = await getIntegration('gemini')
  if (isIntegrationConfigured('gemini', gemini)) {
    const instruction = hasImages
      ? (hasText
        ? `Επιπλέον, εδώ είναι κείμενο που εξήχθη ήδη ψηφιακά από το ίδιο έγγραφο (μπορεί να βοηθήσει σε δυσανάγνωστα σημεία):\n\n${input.text}`
        : 'Ανάλυσε το/τα παραπάνω έγγραφο/α σύμφωνα με τις οδηγίες.')
      : `Ανάλυσε το παρακάτω κείμενο του εγγράφου σύμφωνα με τις οδηγίες:\n\n${input.text}`
    const parts: GeminiPart[] = [
      ...input.images.map(img => ({ inlineData: { data: img.base64, mimeType: img.mimeType } })),
      { text: instruction },
    ]
    const result = await geminiGenerate({ parts, systemInstruction: prompt, json: true })
    return { rawText: result.text, model: result.model, usedFallback: false }
  }

  // Gemini δεν είναι ρυθμισμένο.
  if (hasImages && !hasText) throw new Error(GEMINI_NOT_CONFIGURED_MESSAGE)
  if (!hasText) throw new Error('Δεν δόθηκαν δεδομένα προς ανάλυση.')

  const rawText = await generateText(`${prompt}\n\n${input.text}`)
  return { rawText, model: 'deepseek (text fallback)', usedFallback: true }
}

export async function extractDocument(input: ExtractDocumentInput): Promise<ExtractResult> {
  const docTypeHint = input.docType ?? 'auto'
  const prompt = buildOcrPrompt(docTypeHint)

  const { rawText, model, usedFallback } = await resolveAiCall(prompt, input)

  const raw = parseJsonLoose(rawText)
  const data = parseExtractedDocument(raw, docTypeHint)
  const mismatches = validateExtractedDocument(data)

  return { data, mismatches, model, usedFallback }
}
