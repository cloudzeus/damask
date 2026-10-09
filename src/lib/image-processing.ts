import { CANVAS_SIZE, fitToCanvas } from '@/lib/image-fit'

const CONVERTIBLE = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/bmp', 'image/avif']

export function isConvertibleImage(file: File): boolean {
  return CONVERTIBLE.includes(file.type)
}

/** Μετατροπή σε WebP 1920×1920: λευκός καμβάς, κεντραρισμένο με περιθώριο 50px. */
export async function processImageToWebp(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const canvas = document.createElement('canvas')
    canvas.width = CANVAS_SIZE
    canvas.height = CANVAS_SIZE
    const ctx = canvas.getContext('2d')!
    ctx.fillStyle = '#FFFFFF'
    ctx.fillRect(0, 0, CANVAS_SIZE, CANVAS_SIZE)
    ctx.imageSmoothingQuality = 'high'
    const { dw, dh, dx, dy } = fitToCanvas(bitmap.width, bitmap.height)
    ctx.drawImage(bitmap, dx, dy, dw, dh)
    const blob = await new Promise<Blob | null>(resolve =>
      canvas.toBlob(resolve, 'image/webp', 0.85),
    )
    if (!blob) throw new Error('Η μετατροπή σε WebP απέτυχε')
    return blob
  } finally {
    bitmap.close()
  }
}

/** Φωτογραφία (όχι προϊόν): WebP με τις ΑΡΧΙΚΕΣ αναλογίες, μεγαλύτερη πλευρά ≤ maxSide — χωρίς καμβά/περιθώριο. */
export async function processPhotoToWebp(file: File, maxSide = 2560): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(bitmap.width * scale)
    canvas.height = Math.round(bitmap.height * scale)
    const ctx = canvas.getContext('2d')!
    ctx.imageSmoothingQuality = 'high'
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/webp', 0.86))
    if (!blob) throw new Error('Η μετατροπή σε WebP απέτυχε')
    return blob
  } finally {
    bitmap.close()
  }
}
