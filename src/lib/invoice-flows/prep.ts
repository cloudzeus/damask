/**
 * Pure prep helpers για τα δύο OCR invoice workflows (W4 design doc:
 * docs/superpowers/specs/2026-07-23-invoice-ocr-w4-design.md) — καμία
 * εξάρτηση DB/δίκτυο/χρόνου εδώ, μόνο data-shaping ώστε να είναι
 * unit-testable σε απομόνωση (tests/invoice-prep.test.ts). Οι impure
 * ροές (lookups/creates/S1 push) ζουν σε company.ts/program.ts, που
 * καλούν αυτά τα helpers για τις αποφάσεις/merges.
 */

import { nameSimilarity, NAME_MISMATCH_THRESHOLD } from '@/lib/ocr/name-similarity'
import { slugify } from '@/lib/slug'
import type { AadeTrdrPatch } from '@/lib/trdr/aade-map'

// ── SODTYPE decision ────────────────────────────────────────────────────

export type InvoiceDocKind = 'purchase' | 'sale'

/** Αγορά (κάτι που εμείς αγοράσαμε) → ο αντισυμβαλλόμενος είναι Προμηθευτής (12).
 * Πώληση (κάτι που εμείς πουλήσαμε) → ο αντισυμβαλλόμενος είναι Πελάτης (13). */
export function decideTrdrSodtype(docKind: InvoiceDocKind): 12 | 13 {
  return docKind === 'purchase' ? 12 : 13
}

// ── Product matching ─────────────────────────────────────────────────────

export interface ProductMatchLine {
  code?: string | null
  name: string
}

export interface ProductMatchCandidate {
  id: string
  code?: string | null
  name: string
}

/**
 * Αναζητά το καλύτερο match μιας γραμμής παραστατικού σε υπάρχοντα Products:
 * 1) Ακριβές (case/trim-insensitive) match κωδικού — αν υπάρχει, κερδίζει
 *    ανεξάρτητα από το όνομα (ο κωδικός είναι ισχυρότερο σήμα).
 * 2) Αλλιώς, fuzzy σύγκριση ονόματος (reuse src/lib/ocr/name-similarity.ts) —
 *    επιστρέφει το candidate με το υψηλότερο score, ΜΟΝΟ αν φτάνει το ίδιο
 *    threshold που χρησιμοποιεί ήδη το OCR review panel για «όχι σημαντική
 *    διαφορά» (NAME_MISMATCH_THRESHOLD).
 * null όταν δεν βρεθεί κανένα ικανοποιητικό match.
 */
export function matchLineToProducts(
  line: ProductMatchLine,
  products: ProductMatchCandidate[],
): ProductMatchCandidate | null {
  const lineCode = line.code?.trim().toLowerCase()
  if (lineCode) {
    const byCode = products.find(p => (p.code ?? '').trim().toLowerCase() === lineCode)
    if (byCode) return byCode
  }

  const lineName = line.name?.trim()
  if (!lineName) return null

  let best: ProductMatchCandidate | null = null
  let bestScore = 0
  for (const p of products) {
    const score = nameSimilarity(lineName, p.name)
    if (score > bestScore) {
      bestScore = score
      best = p
    }
  }
  return best && bestScore >= NAME_MISMATCH_THRESHOLD ? best : null
}

// ── Trdr create data ──────────────────────────────────────────────────────

export interface OcrPartyLike {
  name: string | null
  afm: string | null
  address?: string | null
  city?: string | null
  zip?: string | null
  phones?: string[]
  emails?: string[]
  website?: string | null
}

export interface TrdrCreateData {
  TRDR: null
  SODTYPE: 12 | 13
  ISPROSP: 0
  NAME: string
  AFM: string | null
  ADDRESS: string | null
  CITY: string | null
  ZIP: string | null
  PHONE01: string | null
  EMAIL: string | null
  WEBPAGE: string | null
  foundingDate: Date | null
  aadeStatus: string | null
  aadeFirmKind: string | null
  appLegalForm: string | null
}

/** Conditional-spread merge: μόνο τα keys του `patch` που ΔΕΝ είναι null/undefined περνάνε
 * πάνω από το `base` — ίδιο idiom με το omitNulls του src/lib/trdr/enrich-actions.ts. */
function applyNonNullPatch(base: TrdrCreateData, patch: AadeTrdrPatch): TrdrCreateData {
  const out = { ...base }
  const entries = Object.entries(patch) as [keyof AadeTrdrPatch, AadeTrdrPatch[keyof AadeTrdrPatch]][]
  for (const [k, v] of entries) {
    if (v !== null && v !== undefined) (out[k] as unknown) = v
  }
  return out
}

/**
 * Χτίζει τα δεδομένα δημιουργίας ενός Trdr από ένα OCR-extracted μέρος
 * (issuer ή counterparty ανάλογα με το docKind — η επιλογή γίνεται στο
 * caller) + το ήδη αποφασισμένο SODTYPE, προαιρετικά εμπλουτισμένα με ένα
 * ΑΑΔΕ patch (src/lib/trdr/aade-map.ts, W2 aadeLookup) — το ΑΑΔΕ πάντα
 * υπερισχύει (πιο έγκυρη πηγή) εκτός από πεδία που η ΑΑΔΕ δεν έχει (null).
 * TRDR μένει πάντα null εδώ — δεν έχει ακόμα συγχρονιστεί με SoftOne.
 */
export function buildTrdrCreateFromInvoice(
  extracted: OcrPartyLike & { sodtype: 12 | 13 },
  aadeMapped?: AadeTrdrPatch | null,
): TrdrCreateData {
  const base: TrdrCreateData = {
    TRDR: null,
    SODTYPE: extracted.sodtype,
    ISPROSP: 0,
    NAME: extracted.name?.trim() || '',
    AFM: extracted.afm ?? null,
    ADDRESS: extracted.address ?? null,
    CITY: extracted.city ?? null,
    ZIP: extracted.zip ?? null,
    PHONE01: extracted.phones?.[0] ?? null,
    EMAIL: extracted.emails?.[0] ?? null,
    WEBPAGE: extracted.website ?? null,
    foundingDate: null,
    aadeStatus: null,
    aadeFirmKind: null,
    appLegalForm: null,
  }
  if (!aadeMapped) return base
  return applyNonNullPatch(base, aadeMapped)
}

// ── Product create data ───────────────────────────────────────────────────

export interface ProductCreateLineInput {
  code?: string | null
  name: string
}

export interface ProductCreateData {
  code: string
  isActive: true
  status: 'DRAFT'
  translations: { create: [{ locale: 'el'; name: string }] }
}

const FALLBACK_LINE_NAME = 'Είδος από τιμολόγιο'

/**
 * Ελάχιστα δεδομένα δημιουργίας Product από γραμμή παραστατικού — code από
 * το OCR αν υπάρχει, αλλιώς παράγεται από το όνομα (slugify, reuse
 * src/lib/slug.ts — ΙΔΙΟ transliteration idiom με τα CMS slugs). Η
 * μοναδικότητα του code (unique constraint) ελέγχεται στο caller
 * (company.ts), όχι εδώ — καθαρή function, καμία γνώση της DB.
 */
export function buildProductCreateFromLine(line: ProductCreateLineInput): ProductCreateData {
  const name = line.name?.trim() || FALLBACK_LINE_NAME
  const trimmedCode = line.code?.trim()
  const code = trimmedCode ? trimmedCode.toUpperCase() : `OCR-${slugify(name).toUpperCase()}`
  return {
    code,
    isActive: true,
    status: 'DRAFT',
    translations: { create: [{ locale: 'el', name }] },
  }
}

// ── Flow report types (Workflow Α — company.ts) ────────────────────────────

export interface InvoiceFlowReport {
  trdr: { status: 'matched' | 'created'; id: string }
  lines: { matched: number; created: number }
  s1: { trdrPushed?: boolean; itemsPushed: number; failed: number }
}
