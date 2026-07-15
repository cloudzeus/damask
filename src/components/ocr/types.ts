import type { OcrImageMimeType } from '@/lib/ocr/rasterize'

/** Μία σελίδα (εικόνα ή ραστεροποιημένη σελίδα PDF) έτοιμη προς αποστολή/προεπισκόπηση. */
export interface StagedPage {
  id: string
  base64: string
  mimeType: OcrImageMimeType
  /** π.χ. "invoice.pdf — σελ. 1" ή το όνομα του αρχείου εικόνας. */
  label: string
}

export function pageDataUrl(page: StagedPage): string {
  return `data:${page.mimeType};base64,${page.base64}`
}
