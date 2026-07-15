'use server'

import { z } from 'zod'
import { requirePermission } from '@/lib/rbac-server'
import { extractDocument } from './extract'
import type { ExtractedDocument } from './schema'
import type { MismatchFlag } from './invoice-math'

/**
 * Reusable server action πίσω από το <OcrUploader> (src/components/ocr/ocr-uploader.tsx) —
 * δεν είναι δεμένο σε συγκεκριμένη σελίδα, οποιοδήποτε client component μπορεί να το
 * καλέσει απευθείας. Permission: 'media.manage' ΠΡΟΣΩΡΙΝΑ (δεν υπάρχει ακόμα dedicated
 * permission για OCR) — TODO: αλλαγή σε δικό του permission (π.χ. 'findocs.ocr') όταν
 * δεθεί στα findocs (βλ. AGENTS instructions του OCR component).
 */

const imageInputSchema = z.object({
  // base64 PNG/WebP σελίδα, ~6MB decoded ceiling ανά εικόνα — αρκετό για scale~2 rasterize.
  base64: z.string().min(1).max(8_000_000),
  mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']),
})

const runOcrInputSchema = z.object({
  images: z.array(imageInputSchema).max(4),
  text: z.string().max(200_000).optional(),
  docType: z.enum(['invoice', 'receipt', 'packing_list', 'auto']).optional(),
})

export type RunOcrInput = z.input<typeof runOcrInputSchema>

export type OcrActionResult =
  | { ok: true; data: ExtractedDocument; mismatches: MismatchFlag[]; model: string; usedFallback: boolean }
  | { ok: false; message: string }

export async function runOcrExtraction(input: RunOcrInput): Promise<OcrActionResult> {
  await requirePermission('media.manage')

  const parsed = runOcrInputSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Μη έγκυρα δεδομένα εικόνων/κειμένου.' }
  }
  if (parsed.data.images.length === 0 && !parsed.data.text?.trim()) {
    return { ok: false, message: 'Ανέβασε τουλάχιστον μία εικόνα ή σελίδα PDF.' }
  }

  try {
    const result = await extractDocument(parsed.data)
    return { ok: true, ...result }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ανάγνωση του εγγράφου απέτυχε.' }
  }
}
