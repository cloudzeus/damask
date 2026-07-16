'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { getSetting, setSetting } from '@/lib/settings'
import type { AiMarkupSettings } from '@/lib/ai/markup'
import type { PricingEntry, PricingOverrides } from '@/lib/ai/pricing'
import type { ApiCostConfigSettings } from '@/lib/api-costs'

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = issue.path.join('.')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/**
 * Οι κάρτες «Markup ανά υπηρεσία» / «Overrides τιμολόγησης μοντέλων» (SUPER_ADMIN
 * μόνο, βλ. markup-card.tsx/pricing-overrides-card.tsx) γράφουν στα settings
 * "ai.markup"/"ai.pricingOverrides" — requirePermission('costs.view') ελέγχει ότι
 * ο χρήστης βλέπει καν τη σελίδα, αλλά ΔΕΝ αρκεί: ο ADMIN έχει επίσης costs.view
 * (βλέπει το κόστος ΜΕ markup) αλλά ΔΕΝ επιτρέπεται να αλλάξει markup/τιμές —
 * γι' αυτό ελέγχουμε ρητά session.user.role === 'SUPER_ADMIN' εδώ, όχι μόνο permission.
 */
async function requireSuperAdmin() {
  const session = await requirePermission('costs.view')
  if (session.user.role !== 'SUPER_ADMIN') {
    throw new Error('Forbidden: απαιτείται ρόλος SUPER_ADMIN')
  }
  return session
}

function revalidateCosts() {
  revalidatePath('/costs')
}

// ══════════════════════════════════════════════════════════════════════════
// Markup ανά υπηρεσία (setting "ai.markup")
// ══════════════════════════════════════════════════════════════════════════

const markupSchema = z.object({
  deepseek: z.coerce.number().finite(),
  gemini: z.coerce.number().finite(),
  claude: z.coerce.number().finite(),
  other: z.coerce.number().finite(),
  usdToEur: z.union([z.coerce.number().positive(), z.literal(''), z.null()]).optional(),
})

export type AiMarkupFormValues = {
  deepseek: string
  gemini: string
  claude: string
  other: string
  usdToEur: string
}

export async function saveAiMarkup(values: AiMarkupFormValues): Promise<ActionResult> {
  try {
    await requireSuperAdmin()
  } catch {
    return { ok: false, message: 'Μόνο ο SUPER_ADMIN μπορεί να αλλάξει το markup.' }
  }

  const parsed = markupSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα ποσοστά markup.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const next: AiMarkupSettings = {
    deepseek: data.deepseek,
    gemini: data.gemini,
    claude: data.claude,
    other: data.other,
    ...(data.usdToEur !== undefined && data.usdToEur !== '' && data.usdToEur !== null
      ? { usdToEur: data.usdToEur as number }
      : {}),
  }

  await setSetting('ai.markup', next)
  revalidateCosts()
  return { ok: true, message: 'Το markup αποθηκεύτηκε.' }
}

// ══════════════════════════════════════════════════════════════════════════
// Overrides τιμολόγησης μοντέλων (setting "ai.pricingOverrides")
// ══════════════════════════════════════════════════════════════════════════

const pricingOverrideSchema = z.object({
  model: z.string().trim().min(1, 'Συμπλήρωσε το όνομα του μοντέλου.').max(200),
  inputPerMTokens: z.coerce.number().min(0, 'Πρέπει να είναι ≥ 0.'),
  outputPerMTokens: z.coerce.number().min(0, 'Πρέπει να είναι ≥ 0.'),
})

export type PricingOverrideFormValues = { model: string; inputPerMTokens: string; outputPerMTokens: string }

export async function savePricingOverride(values: PricingOverrideFormValues): Promise<ActionResult> {
  try {
    await requireSuperAdmin()
  } catch {
    return { ok: false, message: 'Μόνο ο SUPER_ADMIN μπορεί να αλλάξει τιμολόγηση μοντέλων.' }
  }

  const parsed = pricingOverrideSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία του μοντέλου.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const existing = (await getSetting<PricingOverrides>('ai.pricingOverrides')) ?? {}
  const entry: PricingEntry = { inputPerMTokens: data.inputPerMTokens, outputPerMTokens: data.outputPerMTokens }
  await setSetting('ai.pricingOverrides', { ...existing, [data.model]: entry })

  revalidateCosts()
  return { ok: true, message: `Η τιμολόγηση για «${data.model}» αποθηκεύτηκε.` }
}

export async function deletePricingOverride(model: string): Promise<ActionResult> {
  try {
    await requireSuperAdmin()
  } catch {
    return { ok: false, message: 'Μόνο ο SUPER_ADMIN μπορεί να αλλάξει τιμολόγηση μοντέλων.' }
  }

  const existing = (await getSetting<PricingOverrides>('ai.pricingOverrides')) ?? {}
  if (!(model in existing)) return { ok: true, message: 'Δεν υπήρχε override για αυτό το μοντέλο.' }

  const next = { ...existing }
  delete next[model]
  await setSetting('ai.pricingOverrides', next)

  revalidateCosts()
  return { ok: true, message: `Το override για «${model}» αφαιρέθηκε.` }
}

// ══════════════════════════════════════════════════════════════════════════
// Ρυθμίσεις κόστους API υπηρεσιών (setting "api.costConfig") — Mailgun/
// BunnyCDN/Viva/ΑΑΔΕ/geocoding, ΟΧΙ AI (εκείνα μένουν στο ai.markup/
// ai.pricingOverrides παραπάνω). Ίδιο role gating με τις κάρτες AI.
// ══════════════════════════════════════════════════════════════════════════

const apiCostConfigSchema = z.object({
  service: z.string().trim().min(1),
  basePrice: z.coerce.number().min(0, 'Πρέπει να είναι ≥ 0.'),
  freeQuota: z.coerce.number().min(0, 'Πρέπει να είναι ≥ 0.'),
  markupPercent: z.coerce.number().finite(),
})

export type ApiCostConfigFormValues = { service: string; basePrice: string; freeQuota: string; markupPercent: string }

export async function saveApiCostConfig(values: ApiCostConfigFormValues): Promise<ActionResult> {
  try {
    await requireSuperAdmin()
  } catch {
    return { ok: false, message: 'Μόνο ο SUPER_ADMIN μπορεί να αλλάξει τις ρυθμίσεις κόστους API.' }
  }

  const parsed = apiCostConfigSchema.safeParse(values)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τις τιμές κόστους.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const existing = (await getSetting<ApiCostConfigSettings>('api.costConfig')) ?? {}
  await setSetting('api.costConfig', {
    ...existing,
    [data.service]: { basePrice: data.basePrice, freeQuota: data.freeQuota, markupPercent: data.markupPercent },
  })

  revalidateCosts()
  return { ok: true, message: `Οι ρυθμίσεις για «${data.service}» αποθηκεύτηκαν.` }
}
