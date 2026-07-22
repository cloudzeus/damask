import type { Bbox } from '@/lib/tax/template'

export type PixelRect = { sx: number; sy: number; sw: number; sh: number }

/** PURE: normalized bbox → integer source rect, clamped to the page. */
export function bboxToPixelRect(bbox: Bbox, pageW: number, pageH: number): PixelRect {
  const [x, y, w, h] = bbox
  const sx = Math.max(0, Math.round(x * pageW))
  const sy = Math.max(0, Math.round(y * pageH))
  const sw = Math.max(1, Math.min(Math.round(w * pageW), pageW - sx))
  const sh = Math.max(1, Math.min(Math.round(h * pageH), pageH - sy))
  return { sx, sy, sw, sh }
}

/** CLIENT: crop a region out of a rendered page image (base64) → PNG base64 (no data: prefix). */
export async function cropRegion(pageBase64: string, mimeType: string, bbox: Bbox): Promise<{ base64: string; mimeType: 'image/png' }> {
  const img = new Image()
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve()
    img.onerror = () => reject(new Error('Αποτυχία φόρτωσης εικόνας σελίδας.'))
    img.src = `data:${mimeType};base64,${pageBase64}`
  })
  const { sx, sy, sw, sh } = bboxToPixelRect(bbox, img.naturalWidth, img.naturalHeight)
  const canvas = document.createElement('canvas')
  canvas.width = sw; canvas.height = sh
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Canvas 2D context μη διαθέσιμο.')
  ctx.drawImage(img, sx, sy, sw, sh, 0, 0, sw, sh)
  const dataUrl = canvas.toDataURL('image/png')
  return { base64: dataUrl.split(',')[1] ?? '', mimeType: 'image/png' }
}
