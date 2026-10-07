'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { hashToken } from '@/lib/pm/portal-token'
import { extractDocument, parseJsonLoose } from '@/lib/ocr/extract'
import { deepseekChat } from '@/lib/deepseek'
import { classifyDocumentCore } from '@/lib/documents/smart-classify-core'

/**
 * Αυτόματη αναγνώριση στη δημόσια σελίδα αιτήματος δικαιολογητικών (/r/[token]):
 * για κάθε αρχείο του πελάτη → κείμενο (PDF ή OCR για σκαναρισμένα/φωτογραφίες)
 * → έξυπνη αναγνώριση τύπου (μνήμη + AI, ίδιο με το staff) → αντιστοίχιση στο
 * σωστό ζητούμενο στοιχείο του αιτήματος. Token-gated (ΧΩΡΙΣ session): ισχύει μόνο
 * για ενεργό, μη ληγμένο αίτημα, με όρια μεγέθους/σελίδων.
 */

const inputSchema = z.object({
  fileName: z.string().min(1).max(300),
  text: z.string().max(20_000).optional(),
  images: z
    .array(z.object({ base64: z.string().min(1).max(8_000_000), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) }))
    .max(2)
    .optional(),
})

export type FileRequestRecognition =
  | { ok: true; itemId: string | null; typeName: string | null; confidence: number; reason: string | null }
  | { ok: false; message: string }

function fold(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
}
function words(s: string): Set<string> {
  return new Set(fold(s).split(/[^a-zα-ω0-9]+/i).filter(w => w.length >= 3))
}
function overlap(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let n = 0
  for (const w of a) if (b.has(w)) n++
  return n / Math.min(a.size, b.size)
}

export async function recognizeFileForRequest(token: string, raw: z.input<typeof inputSchema>): Promise<FileRequestRecognition> {
  const parsed = inputSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'Μη έγκυρα δεδομένα αρχείου.' }
  const input = parsed.data

  const fr = await prisma.fileRequest.findUnique({
    where: { tokenHash: hashToken(token) },
    select: { status: true, expiresAt: true, trdrId: true, items: { orderBy: { order: 'asc' }, select: { id: true, label: true, description: true, fileKey: true, fileUrl: true } } },
  })
  if (!fr || fr.status === 'CANCELLED' || (fr.expiresAt.getTime() < Date.now() && fr.status !== 'COMPLETED')) {
    return { ok: false, message: 'Το αίτημα δεν είναι ενεργό.' }
  }
  if (fr.items.length === 0) return { ok: true, itemId: null, typeName: null, confidence: 0, reason: null }

  try {
    // 1. Κείμενο: ψηφιακό PDF ή OCR (σκαναρισμένο/φωτογραφία).
    let text = input.text ?? ''
    if (text.trim().length < 80 && input.images?.length) {
      const ocr = await extractDocument({ images: input.images, text: text || undefined, docType: 'auto' }).catch(() => null)
      if (ocr) text = JSON.stringify(ocr.data).slice(0, 3000)
    }

    // 2. Τύπος δικαιολογητικού (ίδια «μνήμη» με το staff).
    const cls = await classifyDocumentCore({ trdrId: fr.trdrId, fileName: input.fileName, text })
    const typeName = cls.ok && cls.result.typeId
      ? (await prisma.documentType.findUnique({ where: { id: cls.result.typeId }, select: { name: true } }))?.name ?? null
      : null

    // 3. Αντιστοίχιση σε ζητούμενο στοιχείο: πρώτα ομοιότητα λέξεων τύπου ↔ ετικέτας.
    const pending = fr.items.filter(i => !i.fileKey && !i.fileUrl)
    const pool = pending.length ? pending : fr.items
    if (typeName) {
      const t = words(typeName)
      const best = pool
        .map(i => ({ i, s: Math.max(overlap(t, words(i.label)), fold(i.label).includes(fold(typeName)) ? 1 : 0) }))
        .sort((a, b) => b.s - a.s)[0]
      if (best && best.s >= 0.5) {
        return { ok: true, itemId: best.i.id, typeName, confidence: cls.ok ? Math.max(0.6, cls.result.confidence) : 0.6, reason: null }
      }
    }

    // 4. Αλλιώς AI: διάλεξε στοιχείο από τη λίστα του αιτήματος.
    if (pool.length === 1 && !typeName) return { ok: true, itemId: pool[0].id, typeName: null, confidence: 0.3, reason: null }
    const list = pool.map((i, n) => `${n + 1}. ${i.label}${i.description ? ` — ${i.description.slice(0, 120)}` : ''}`).join('\n')
    const answer = await deepseekChat(
      [
        {
          role: 'system',
          content:
            'Αντιστοίχισε ένα έγγραφο που ανέβασε πελάτης σε ΕΝΑ από τα ζητούμενα δικαιολογητικά. ' +
            'Απάντησε ΑΥΣΤΗΡΑ σε JSON: {"index": αριθμός από τη λίστα ή null αν κανένα δεν ταιριάζει, "confidence": 0..1}.',
        },
        {
          role: 'user',
          content: `Ζητούμενα:\n${list}\n\nΑρχείο: ${input.fileName}${typeName ? `\nΑναγνωρίστηκε ως: ${typeName}` : ''}\n\nΚείμενο:\n${text.slice(0, 1500) || '(χωρίς κείμενο)'}`,
        },
      ],
      { model: 'deepseek-chat', maxTokens: 60, scope: 'OTHER', refType: 'file-request-match' },
    )
    const p = (parseJsonLoose(answer) ?? {}) as { index?: unknown; confidence?: unknown }
    const idx = typeof p.index === 'number' ? p.index - 1 : -1
    const conf = typeof p.confidence === 'number' ? Math.max(0, Math.min(1, p.confidence)) : 0.5
    return { ok: true, itemId: pool[idx]?.id ?? null, typeName, confidence: pool[idx] ? conf : 0, reason: null }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η αναγνώριση απέτυχε.' }
  }
}
