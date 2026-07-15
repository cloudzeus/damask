// CLIENT-SIDE ONLY. PDF → images (base64 PNG/WebP) via pdfjs-dist + OffscreenCanvas,
// entirely in the browser — no server deps (no `canvas` native module, no sharp).
// Imported only from 'use client' components (src/components/ocr/ocr-uploader.tsx);
// pdfjs-dist itself is dynamically imported so it never inflates a server bundle or
// the initial client bundle before it's actually needed.
//
// src/lib/ocr/extract.ts (server) receives the already-rasterized images — it never
// touches a PDF buffer directly.

export type OcrImageMimeType = 'image/jpeg' | 'image/png' | 'image/webp'

export interface RasterizedPage {
  base64: string
  mimeType: OcrImageMimeType
  width: number
  height: number
}

export interface RasterizeResult {
  pages: RasterizedPage[]
  /** Επιλέξιμο κείμενο (pdfjs getTextContent) από ΟΛΕΣ τις σελίδες, joined — null αν το PDF είναι πλήρως σαρωμένο/χωρίς επιλέξιμο κείμενο. */
  text: string | null
  /** true αν το PDF είχε περισσότερες σελίδες από maxPages (οι υπόλοιπες κόπηκαν από τις εικόνες, όχι από το κείμενο). */
  truncated: boolean
}

export const MAX_RASTERIZE_PAGES = 4
const DEFAULT_SCALE = 2
const DEFAULT_MIME: OcrImageMimeType = 'image/webp'
const DEFAULT_QUALITY = 0.85

/** True αν το File "μοιάζει" PDF — μερικά scanners/κάμερες δεν στέλνουν σωστό mimeType, οπότε ελέγχουμε και την επέκταση. */
export function isPdfFile(file: File): boolean {
  return file.type === 'application/pdf' || file.name.toLowerCase().endsWith('.pdf')
}

/** Κανονικοποιεί το mimeType μιας εικόνας από το File — δέχεται jpg/png/webp μέσω mimeType Ή επέκτασης. null αν δεν αναγνωρίζεται. */
export function normalizeImageMimeType(file: File): OcrImageMimeType | null {
  if (file.type === 'image/jpeg' || file.type === 'image/png' || file.type === 'image/webp') return file.type
  const lower = file.name.toLowerCase()
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.webp')) return 'image/webp'
  return null
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const dataUrl = String(reader.result)
      const comma = dataUrl.indexOf(',')
      resolve(comma === -1 ? dataUrl : dataUrl.slice(comma + 1))
    }
    reader.onerror = () => reject(reader.error ?? new Error('FileReader απέτυχε.'))
    reader.readAsDataURL(blob)
  })
}

function loadImageDimensions(file: File): Promise<{ width: number; height: number }> {
  return new Promise(resolve => {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.onload = () => { URL.revokeObjectURL(url); resolve({ width: img.naturalWidth, height: img.naturalHeight }) }
    img.onerror = () => { URL.revokeObjectURL(url); resolve({ width: 0, height: 0 }) }
    img.src = url
  })
}

/** Απλό File εικόνας (jpg/png/webp) → RasterizedPage, χωρίς rasterization — μόνο base64-encode + διαστάσεις. */
export async function imageFileToPage(file: File): Promise<RasterizedPage> {
  const mimeType = normalizeImageMimeType(file)
  if (!mimeType) throw new Error(`Μη υποστηριζόμενος τύπος αρχείου: ${file.type || file.name}`)
  const [base64, dims] = await Promise.all([blobToBase64(file), loadImageDimensions(file)])
  return { base64, mimeType, ...dims }
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement
type AnyCanvasContext = OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D

function createCanvas(width: number, height: number): { canvas: AnyCanvas; offscreen: boolean } {
  if (typeof OffscreenCanvas !== 'undefined') {
    return { canvas: new OffscreenCanvas(width, height), offscreen: true }
  }
  const el = document.createElement('canvas')
  el.width = width
  el.height = height
  return { canvas: el, offscreen: false }
}

async function canvasToBlob(canvas: AnyCanvas, offscreen: boolean, mimeType: string, quality: number): Promise<Blob> {
  if (offscreen) {
    return (canvas as OffscreenCanvas).convertToBlob({ type: mimeType, quality })
  }
  return new Promise<Blob>((resolve, reject) => {
    (canvas as HTMLCanvasElement).toBlob(
      b => (b ? resolve(b) : reject(new Error('canvas.toBlob απέτυχε.'))),
      mimeType,
      quality,
    )
  })
}

function textItemString(item: unknown): string {
  return typeof item === 'object' && item !== null && 'str' in item && typeof (item as { str: unknown }).str === 'string'
    ? (item as { str: string }).str
    : ''
}

let workerConfigured = false

/** Φορτώνει το pdfjs-dist (dynamic import) και ρυθμίζει το worker URL μία φορά. */
async function loadPdfjs() {
  const pdfjs = await import('pdfjs-dist')
  if (!workerConfigured) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url).toString()
    workerConfigured = true
  }
  return pdfjs
}

export interface RasterizePdfOptions {
  /** Μέγιστος αριθμός σελίδων που γίνονται εικόνες (default 4 — spec). Το επιλέξιμο κείμενο συλλέγεται από ΟΛΕΣ τις σελίδες, ανεξαρτήτως. */
  maxPages?: number
  scale?: number
  mimeType?: 'image/webp' | 'image/png'
  quality?: number
}

/**
 * PDF → { pages (base64 εικόνες, μέχρι maxPages), text (επιλέξιμο κείμενο όλων των σελίδων) }.
 * Τρέχει εξ ολοκλήρου στον browser (pdfjs-dist + OffscreenCanvas όπου διαθέσιμο, αλλιώς
 * αόρατο &lt;canvas&gt; ως fallback).
 */
export async function rasterizePdf(file: File, opts: RasterizePdfOptions = {}): Promise<RasterizeResult> {
  const maxPages = opts.maxPages ?? MAX_RASTERIZE_PAGES
  const scale = opts.scale ?? DEFAULT_SCALE
  const mimeType = opts.mimeType ?? DEFAULT_MIME
  const quality = opts.quality ?? DEFAULT_QUALITY

  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  // Κρατάμε το loadingTask (όχι μόνο το resolved PDFDocumentProxy) — το destroy()
  // που ελευθερώνει τους worker πόρους ζει εκεί, όχι στο ίδιο το proxy.
  const loadingTask = pdfjs.getDocument({ data: buffer })
  const doc = await loadingTask.promise

  const pageCount = doc.numPages
  const pagesToRender = Math.min(pageCount, maxPages)
  const pages: RasterizedPage[] = []
  const textChunks: string[] = []

  try {
    for (let i = 1; i <= pageCount; i++) {
      const page = await doc.getPage(i)

      // Επιλέξιμο κείμενο μαζεύεται από ΟΛΕΣ τις σελίδες (φτηνό) — τροφοδοτεί το
      // DeepSeek text-fallback ακόμα κι όταν το Gemini δεν βλέπει σελίδες πέρα από maxPages.
      try {
        const tc = await page.getTextContent()
        const pageText = tc.items.map(textItemString).join(' ')
        if (pageText.trim()) textChunks.push(pageText)
      } catch { /* μη-εξαγόμενο κείμενο σε αυτή τη σελίδα — αγνόησε, καλύπτεται από το vision path */ }

      if (i > pagesToRender) continue

      const viewport = page.getViewport({ scale })
      const { canvas, offscreen } = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height))
      const ctx = canvas.getContext('2d') as AnyCanvasContext | null
      if (!ctx) throw new Error('Canvas 2D context μη διαθέσιμο σε αυτόν τον browser.')
      await page.render({ canvasContext: ctx as CanvasRenderingContext2D, viewport, canvas: canvas as HTMLCanvasElement }).promise
      const blob = await canvasToBlob(canvas, offscreen, mimeType, quality)
      const base64 = await blobToBase64(blob)
      pages.push({ base64, mimeType, width: canvas.width, height: canvas.height })
    }
  } finally {
    await loadingTask.destroy().catch(() => {})
  }

  return {
    pages,
    text: textChunks.length > 0 ? textChunks.join('\n').replace(/[ \t]+/g, ' ').trim() : null,
    truncated: pageCount > maxPages,
  }
}
