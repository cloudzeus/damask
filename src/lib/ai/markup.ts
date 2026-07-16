import { getSetting } from '@/lib/settings'

/**
 * Shape του setting "ai.markup" — ποσοστά (%) markup ανά provider που
 * εφαρμόζει η σελίδα /costs πάνω στο base USD cost πριν τη μετατροπή σε EUR
 * (src/lib/ai/fx.ts). Διαχείριση ΜΟΝΟ SUPER_ADMIN — βλ.
 * src/app/(app)/costs/actions.ts (saveAiMarkup ελέγχει session.user.role,
 * ΟΧΙ μόνο permission). usdToEur προαιρετικό override του fallback rate
 * του Frankfurter (όταν το API δεν απαντά).
 */
export type AiMarkupSettings = {
  deepseek: number
  gemini: number
  claude: number
  other: number
  usdToEur?: number
}

export const DEFAULT_AI_MARKUP: AiMarkupSettings = { deepseek: 0, gemini: 0, claude: 0, other: 0 }

/** Fallback USD→EUR rate όταν δεν έχει οριστεί ai.markup.usdToEur ΚΑΙ το Frankfurter API αποτυγχάνει. */
export const DEFAULT_USD_TO_EUR_FALLBACK = 0.92

export async function loadAiMarkup(): Promise<AiMarkupSettings> {
  const saved = await getSetting<Partial<AiMarkupSettings>>('ai.markup')
  return { ...DEFAULT_AI_MARKUP, ...saved }
}

/** Ποιο πεδίο του AiMarkupSettings αντιστοιχεί σε κάθε provider id (deepseek.ts/gemini.ts provider strings + 'claude'/'anthropic'). */
export function markupPctForProvider(markup: AiMarkupSettings, provider: string): number {
  switch (provider) {
    case 'deepseek': return markup.deepseek
    case 'gemini': return markup.gemini
    case 'claude':
    case 'anthropic': return markup.claude
    default: return markup.other
  }
}

/** Εφαρμόζει markup % πάνω σε ένα base USD cost. Αρνητικό/μηδενικό markup επιτρέπεται (π.χ. εσωτερική τιμολόγηση κάτω του κόστους). */
export function applyMarkup(baseCostUsd: number, markupPct: number): number {
  return baseCostUsd * (1 + markupPct / 100)
}
