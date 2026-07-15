import { z } from 'zod'

/**
 * Σχήμα εξαγόμενου παραστατικού (τιμολόγιο/απόδειξη/δελτίο αποστολής) από το
 * Gemini vision pipeline (src/lib/ocr/extract.ts). Το LLM απαντά με «σχεδόν
 * σωστό» JSON — αριθμοί μπορεί να έρθουν ως strings, ελληνικά δεκαδικά με
 * κόμμα ("1.234,56"), το docType μπορεί να λείπει. `coerceExtractedJson`
 * ομαλοποιεί ΠΡΙΝ το zod validate ώστε το validate να μένει αυστηρό.
 */

export const OCR_DOC_TYPES = ['invoice', 'receipt', 'packing_list'] as const
export type OcrDocType = (typeof OCR_DOC_TYPES)[number]

/** Το hint που δέχεται extractDocument()/OcrUploader — 'auto' αφήνει το μοντέλο να ταξινομήσει. */
export const OCR_DOC_TYPE_HINTS = [...OCR_DOC_TYPES, 'auto'] as const
export type OcrDocTypeHint = (typeof OCR_DOC_TYPE_HINTS)[number]

export const ocrPartySchema = z.object({
  name: z.string().nullable().default(null),
  afm: z.string().nullable().default(null),
  address: z.string().nullable().default(null),
})
export type OcrParty = z.infer<typeof ocrPartySchema>

export const ocrLineSchema = z.object({
  description: z.string().default(''),
  quantity: z.number().nullable().default(null),
  unitPrice: z.number().nullable().default(null),
  vatPct: z.number().nullable().default(null),
  total: z.number().nullable().default(null),
})
export type OcrLine = z.infer<typeof ocrLineSchema>

export const ocrTotalsSchema = z.object({
  net: z.number().nullable().default(null),
  vat: z.number().nullable().default(null),
  gross: z.number().nullable().default(null),
})
export type OcrTotals = z.infer<typeof ocrTotalsSchema>

export const extractedDocumentSchema = z.object({
  docType: z.enum(OCR_DOC_TYPES),
  issuer: ocrPartySchema,
  counterparty: ocrPartySchema.nullable().default(null),
  documentNumber: z.string().nullable().default(null),
  date: z.string().nullable().default(null),
  currency: z.string().nullable().default(null),
  lines: z.array(ocrLineSchema).default([]),
  totals: ocrTotalsSchema,
  confidence: z.number().min(0).max(1).default(0),
  notes: z.string().nullable().default(null),
})
export type ExtractedDocument = z.infer<typeof extractedDocumentSchema>

/** Άδειο-αλλά-έγκυρο έγγραφο — αρχική τιμή φόρμας/fallback σε παντελή αποτυχία parse. */
export function emptyExtractedDocument(docType: OcrDocType = 'invoice'): ExtractedDocument {
  return {
    docType,
    issuer: { name: null, afm: null, address: null },
    counterparty: null,
    documentNumber: null,
    date: null,
    currency: 'EUR',
    lines: [],
    totals: { net: null, vat: null, gross: null },
    confidence: 0,
    notes: null,
  }
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v)
}

/**
 * Νούμερο από ελεύθερη μορφή: δέχεται πραγματικό number, ή string με ελληνικά
 * δεκαδικά ("1.234,56" ή "1234,56") ή διεθνή ("1234.56"), προαιρετικό
 * σύμβολο νομίσματος/κενά. null για οτιδήποτε άλλο (ΠΟΤΕ 0 ως σιωπηλό default
 * — ένα λάθος μηδενικό σε ΦΠΑ/σύνολο θα έκρυβε πραγματικά mismatches).
 */
export function coerceOcrNumber(v: unknown): number | null {
  if (v == null || v === '') return null
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  const s = String(v).trim().replace(/[€$\s]/g, '')
  if (!s) return null
  // "1.234,56" ή "1234,56" (κόμμα δεκαδικών) → μετατροπή σε "1234.56".
  const normalized = /,\d{1,2}$/.test(s) ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '')
  const n = Number(normalized)
  return Number.isFinite(n) ? n : null
}

type CoercedParty = { name: string | null; afm: string | null; address: string | null }
const EMPTY_PARTY: CoercedParty = { name: null, afm: null, address: null }

/** issuer is REQUIRED by the schema (never null) — missing/garbage input becomes an all-null party object. */
function coerceParty(v: unknown): CoercedParty {
  if (!isPlainObject(v)) return EMPTY_PARTY
  return {
    name: v.name == null || v.name === '' ? null : String(v.name),
    afm: v.afm == null || v.afm === '' ? null : String(v.afm),
    address: v.address == null || v.address === '' ? null : String(v.address),
  }
}

/** counterparty is OPTIONAL (nullable) — genuinely absent input stays null instead of an all-null object. */
function coerceOptionalParty(v: unknown): CoercedParty | null {
  return isPlainObject(v) ? coerceParty(v) : null
}

function coerceLine(v: unknown): unknown {
  const o = isPlainObject(v) ? v : {}
  return {
    description: o.description == null ? '' : String(o.description),
    quantity: coerceOcrNumber(o.quantity),
    unitPrice: coerceOcrNumber(o.unitPrice ?? o.unit_price),
    vatPct: coerceOcrNumber(o.vatPct ?? o.vat_pct ?? o.vatRate),
    total: coerceOcrNumber(o.total),
  }
}

/**
 * Ομαλοποιεί το ακατέργαστο JSON του LLM ΠΡΙΝ το `extractedDocumentSchema.safeParse`.
 * Δεν πετάει ποτέ — ελλιπή/παράξενα πεδία γίνονται null/defaults, το zod μετά
 * κάνει το αυστηρό shape-check.
 */
export function coerceExtractedJson(raw: unknown, docTypeHint: OcrDocTypeHint = 'auto'): unknown {
  const o = isPlainObject(raw) ? raw : {}
  const docType = OCR_DOC_TYPES.includes(o.docType as OcrDocType)
    ? o.docType
    : (docTypeHint !== 'auto' ? docTypeHint : 'invoice')

  const totals = isPlainObject(o.totals) ? o.totals : {}
  const lines = Array.isArray(o.lines) ? o.lines : []

  return {
    docType,
    issuer: coerceParty(o.issuer),
    counterparty: coerceOptionalParty(o.counterparty),
    documentNumber: o.documentNumber == null || o.documentNumber === '' ? null : String(o.documentNumber),
    date: o.date == null || o.date === '' ? null : String(o.date),
    currency: o.currency == null || o.currency === '' ? null : String(o.currency),
    lines: lines.map(coerceLine),
    totals: {
      net: coerceOcrNumber(totals.net),
      vat: coerceOcrNumber(totals.vat),
      gross: coerceOcrNumber(totals.gross),
    },
    confidence: (() => {
      const n = coerceOcrNumber(o.confidence)
      if (n == null) return 0
      return Math.max(0, Math.min(1, n))
    })(),
    notes: o.notes == null || o.notes === '' ? null : String(o.notes),
  }
}

/** coerce + zod-validate σε ένα βήμα. Πετάει ZodError αν το shape είναι ασύμβατο μετά την ομαλοποίηση. */
export function parseExtractedDocument(raw: unknown, docTypeHint: OcrDocTypeHint = 'auto'): ExtractedDocument {
  return extractedDocumentSchema.parse(coerceExtractedJson(raw, docTypeHint))
}
