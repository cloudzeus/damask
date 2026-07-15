export const CANVAS_SIZE = 1920
export const MARGIN = 50

export type FitResult = { dw: number; dh: number; dx: number; dy: number }

/** Κλιμάκωση ώστε η μεγάλη διάσταση να αφήνει MARGIN περιθώριο, κεντραρισμένο σε CANVAS_SIZE. */
export function fitToCanvas(srcW: number, srcH: number): FitResult {
  const box = CANVAS_SIZE - 2 * MARGIN // 1820
  const scale = box / Math.max(srcW, srcH)
  const dw = Math.round(srcW * scale)
  const dh = Math.round(srcH * scale)
  return { dw, dh, dx: Math.round((CANVAS_SIZE - dw) / 2), dy: Math.round((CANVAS_SIZE - dh) / 2) }
}
