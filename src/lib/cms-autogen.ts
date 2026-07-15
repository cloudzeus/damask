import type { ChatMessage } from '@/lib/deepseek'

/**
 * Καθαρές functions (χωρίς DB/network) για το «✨ Δημιουργία με AI» dialog του
 * /cms/posts: χτίζουν τα μηνύματα προς το DeepSeek και αναλύουν την JSON
 * απάντηση. Ο server action (src/app/(app)/cms/posts/actions.ts) καλεί
 * deepseekChat(buildArticleGenerationMessages(brief)) και μετά
 * parseGeneratedArticle(...) πάνω στο αποτέλεσμα — αυτό το module δεν κάνει
 * ποτέ δικό του fetch, ώστε να είναι εύκολα unit-testable.
 */

export type ArticleTone = 'informative' | 'commercial' | 'technical'
export type ArticleLength = 'short' | 'medium' | 'long'

export const TONE_LABELS: Record<ArticleTone, string> = {
  informative: 'Ενημερωτικό',
  commercial: 'Εμπορικό',
  technical: 'Τεχνικό',
}

export const LENGTH_LABELS: Record<ArticleLength, string> = {
  short: 'Σύντομο (~300 λέξεις)',
  medium: 'Μεσαίο (~600 λέξεις)',
  long: 'Εκτενές (~1000+ λέξεις)',
}

export const TONE_OPTIONS = (Object.keys(TONE_LABELS) as ArticleTone[]).map(value => ({
  value, label: TONE_LABELS[value],
}))
export const LENGTH_OPTIONS = (Object.keys(LENGTH_LABELS) as ArticleLength[]).map(value => ({
  value, label: LENGTH_LABELS[value],
}))

export type ArticleBrief = {
  topic: string
  categoryName?: string | null
  tone: ArticleTone
  length: ArticleLength
  /** Προαιρετικό απόσπασμα από το προφίλ εταιρείας (settings: company.profile) — όνομα/τίτλος/δραστηριότητα. */
  companyContext?: string | null
}

export const BRAND_NAME = 'Damask'
const BRAND_DEFAULT_CONTEXT = 'Damask — εταιρεία υφασμάτων και επίπλωσης (fabrics & furniture) για τον χώρο του σπιτιού και της επιχείρησης.'

/**
 * Χτίζει τα μηνύματα (system + user) για το DeepSeek chat-completions API —
 * ζητά ΑΠΟΚΛΕΙΣΤΙΚΑ ένα JSON object (χωρίς markdown code fence) με τα πεδία
 * title/excerpt/body/seoTitle/seoDescription, στα Ελληνικά, SEO/GEO
 * βελτιστοποιημένο, markdown στο body. Το ίδιο JSON σχήμα το parseGeneratedArticle
 * παρακάτω το περιμένει πίσω.
 */
export function buildArticleGenerationMessages(brief: ArticleBrief): ChatMessage[] {
  const toneLabel = TONE_LABELS[brief.tone]
  const lengthLabel = LENGTH_LABELS[brief.length]
  const brand = brief.companyContext?.trim() || BRAND_DEFAULT_CONTEXT
  const categoryLine = brief.categoryName ? `Κατηγορία άρθρου: ${brief.categoryName}.` : ''

  const system: ChatMessage = {
    role: 'system',
    content: [
      `Είσαι content editor/copywriter για τον οργανισμό ${BRAND_NAME}. Πλαίσιο εταιρείας: ${brand}`,
      'Γράφεις άρθρα («Νέα») στα Ελληνικά, βελτιστοποιημένα για SEO (μηχανές αναζήτησης) ΚΑΙ για GEO/AEO',
      '(generative engine optimization — ώστε το κείμενο να αναφέρεται/παρατίθεται σωστά από AI βοηθούς όπως ChatGPT/Perplexity/Gemini):',
      'σαφής δομή με επικεφαλίδες (##), σύντομες παραγράφους, ευθεία απάντηση στο ερώτημα/θέμα στην αρχή, φυσική χρήση σχετικών λέξεων-κλειδιών χωρίς keyword stuffing.',
      `Ύφος: ${toneLabel}. Μήκος: ${lengthLabel}. ${categoryLine}`.trim(),
      'Απάντησε ΑΠΟΚΛΕΙΣΤΙΚΑ με ένα JSON object (χωρίς markdown code fence, χωρίς σχόλια πριν/μετά) με ΑΚΡΙΒΩΣ αυτά τα keys:',
      '{"title": "...", "excerpt": "...", "body": "...", "seoTitle": "...", "seoDescription": "..."}',
      '- title: σύντομος, ελκυστικός τίτλος.',
      '- excerpt: περίληψη 1-2 προτάσεων.',
      '- body: το πλήρες άρθρο σε markdown (##/**/λίστες επιτρέπονται).',
      '- seoTitle: έως 60 χαρακτήρες.',
      '- seoDescription: έως 160 χαρακτήρες.',
    ].join('\n'),
  }

  const user: ChatMessage = {
    role: 'user',
    content: `Θέμα/brief άρθρου: ${brief.topic.trim()}`,
  }

  return [system, user]
}

export type GeneratedArticle = {
  title: string
  excerpt: string
  body: string
  seoTitle: string
  seoDescription: string
}

const REQUIRED_KEYS: (keyof GeneratedArticle)[] = ['title', 'excerpt', 'body', 'seoTitle', 'seoDescription']

/** Αφαιρεί τυχόν ```json … ``` code fence — τα LLM συχνά το προσθέτουν παρά τις οδηγίες. */
function stripCodeFence(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i)
  return fenced ? fenced[1].trim() : trimmed
}

/**
 * Αναλύει την απάντηση του DeepSeek (βλ. buildArticleGenerationMessages) σε
 * GeneratedArticle. Πετάει φιλικό ελληνικό σφάλμα αν η απάντηση δεν είναι το
 * αναμενόμενο JSON σχήμα — ώστε ο server action να δείξει toast.error αντί
 * να αποθηκεύσει σκουπίδια.
 */
export function parseGeneratedArticle(raw: string): GeneratedArticle {
  let parsed: unknown
  try {
    parsed = JSON.parse(stripCodeFence(raw))
  } catch {
    throw new Error('Το DeepSeek δεν επέστρεψε έγκυρο JSON άρθρο — δοκίμασε ξανά.')
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new Error('Το DeepSeek δεν επέστρεψε έγκυρο JSON άρθρο — δοκίμασε ξανά.')
  }

  const obj = parsed as Record<string, unknown>
  for (const key of REQUIRED_KEYS) {
    if (typeof obj[key] !== 'string' || obj[key].trim() === '') {
      throw new Error(`Το DeepSeek επέστρεψε ημιτελές άρθρο (λείπει «${key}») — δοκίμασε ξανά.`)
    }
  }

  return {
    title: (obj.title as string).trim(),
    excerpt: (obj.excerpt as string).trim(),
    body: (obj.body as string).trim(),
    seoTitle: (obj.seoTitle as string).trim(),
    seoDescription: (obj.seoDescription as string).trim(),
  }
}
