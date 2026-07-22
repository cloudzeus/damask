// CLIENT-SIDE ONLY. PDF → selectable text (pdfjs-dist getTextContent), entirely
// in the browser — no server deps. Used to feed the full program-document text
// into the DeepSeek extraction prompt (src/lib/programs/extract-prompt.ts).
//
// src/lib/ocr/rasterize.ts already extracts selectable text via the same
// pdfjs getTextContent API, but only as a side-effect of `rasterizePdf`
// (which also rasterizes up to MAX_RASTERIZE_PAGES pages to images — wasted
// work for a text-only need, and it doesn't export a standalone text-only
// function). So this module mirrors rasterize.ts's dynamic-import +
// getTextContent loop rather than reusing it, avoiding the image-rendering
// cost entirely.

export const MAX_PROGRAM_TEXT_CHARS = 360_000

/** Caps text at `max` chars, appending a truncation marker when cut. Pure. */
export function capText(text: string, max = MAX_PROGRAM_TEXT_CHARS): string {
  return text.length > max ? text.slice(0, max) + '\n\n[... truncated ...]' : text
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

/** PDF (File) → όλο το επιλέξιμο κείμενο (όλες οι σελίδες, joined), capped στο MAX_PROGRAM_TEXT_CHARS. */
export async function extractPdfText(file: File): Promise<string> {
  const pdfjs = await loadPdfjs()
  const buffer = await file.arrayBuffer()
  const loadingTask = pdfjs.getDocument({ data: buffer })
  const doc = await loadingTask.promise

  const textChunks: string[] = []
  try {
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i)
      try {
        const tc = await page.getTextContent()
        const pageText = tc.items.map(textItemString).join(' ')
        if (pageText.trim()) textChunks.push(pageText)
      } catch {
        /* μη-εξαγόμενο κείμενο σε αυτή τη σελίδα — αγνόησε */
      }
    }
  } finally {
    await loadingTask.destroy().catch(() => {})
  }

  const joined = textChunks.join('\n').replace(/[ \t]+/g, ' ').trim()
  return capText(joined)
}
