import { isPdfFile, rasterizePdf, imageFileToPage, normalizeImageMimeType } from '@/lib/ocr/rasterize'

/** (Client.) Κείμενο/εικόνες για αναγνώριση τύπου με AI — όλα client-side (PDF κείμενο ή 1-2 σελίδες ως εικόνα). */
export async function readForRecognition(file: File): Promise<{ text?: string; images?: { base64: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }[] }> {
  try {
    if (isPdfFile(file)) {
      const { pages, text } = await rasterizePdf(file, { maxPages: 2 })
      if ((text ?? '').trim().length >= 80) return { text: text!.slice(0, 15_000) }
      return { text: text || undefined, images: pages.slice(0, 2).map(p => ({ base64: p.base64, mimeType: p.mimeType })) }
    }
    if (normalizeImageMimeType(file)) {
      const page = await imageFileToPage(file)
      return { images: [{ base64: page.base64, mimeType: page.mimeType }] }
    }
  } catch { /* αναγνώριση μόνο από όνομα αρχείου */ }
  return {}
}

