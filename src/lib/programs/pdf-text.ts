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

export type PdfLink = { url: string; text: string | null; page: number }

/**
 * Εξωτερικοί σύνδεσμοι ενός PDF (CLIENT-SIDE): ενεργοί σύνδεσμοι (link annotations) + URL γραμμένα στο κείμενο.
 * Μοναδικοί ανά URL, με το κείμενο γύρω τους ως τίτλο όπου υπάρχει.
 */
export async function extractPdfLinks(data: ArrayBuffer): Promise<PdfLink[]> {
  const pdfjs = await loadPdfjs()
  const doc = await pdfjs.getDocument({ data }).promise
  const found = new Map<string, PdfLink>()
  const clean = (u: string) => unwrapSafeLink(u.trim().replace(/[).,;:»"'\]]+$/, ''))
  const norm = (u: string) => u.toLowerCase().replace(/[^a-z0-9]/g, '')
  const annotated: string[] = []
  for (let p = 1; p <= doc.numPages; p++) {
    const page = await doc.getPage(p)
    const [annots, content] = await Promise.all([page.getAnnotations(), page.getTextContent()])
    const text = content.items.map(textItemString).join(' ')
    for (const a of annots as { subtype?: string; url?: string; unsafeUrl?: string }[]) {
      const u = a.subtype === 'Link' ? (a.url ?? a.unsafeUrl) : undefined
      if (u && /^https?:\/\//i.test(u) && !found.has(clean(u))) { found.set(clean(u), { url: clean(u), text: null, page: p }); annotated.push(norm(clean(u))) }
    }
    for (const m of text.matchAll(/\bhttps?:\/\/[^\s<>"«»]+/gi)) {
      const u = clean(m[0])
      // URL που αλλάζει γραμμή στο κείμενο χάνει χαρακτήρες — αν μοιάζει με ενεργό σύνδεσμο, κράτα εκείνον.
      const nu = norm(u).slice(0, 28)
      if (annotated.some(a => a.startsWith(nu) || nu.startsWith(a.slice(0, 28)))) continue
      if (!found.has(u)) {
        const i = m.index ?? 0
        found.set(u, { url: u, text: text.slice(Math.max(0, i - 90), i).replace(/\s+/g, ' ').trim().slice(-90) || null, page: p })
      }
    }
  }
  return [...found.values()]
}

/** Outlook «Safe Links» / Google redirect → ο πραγματικός σύνδεσμος. */
export function unwrapSafeLink(u: string): string {
  try {
    const url = new URL(u)
    if (/safelinks\.protection\.outlook\.com$/i.test(url.hostname) || (/google\./i.test(url.hostname) && url.pathname === '/url')) {
      const inner = url.searchParams.get('url') ?? url.searchParams.get('q')
      if (inner && /^https?:\/\//i.test(inner)) return inner
    }
  } catch { /* μη έγκυρο → ως έχει */ }
  return u
}
