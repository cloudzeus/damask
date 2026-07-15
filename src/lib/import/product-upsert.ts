import { prisma } from '@/lib/prisma'
import { chunkArray } from './chunk'
import { parseProductRow, type FieldError, type ParsedProductFields, type RawImportRow } from './targets'

/**
 * server-only module (εισάγει prisma) — ΠΟΤΕ μην το κάνεις import από αρχείο
 * με 'use client'. Καλείται μόνο από src/app/(app)/import/actions.ts
 * ('use server') και από τον pg-boss worker (src/server/queue-start.ts).
 */

export type { RawImportRow }

export type ImportTotals = {
  total: number
  processed: number
  created: number
  updated: number
  failed: number
  /** Πρώτα MAX_REPORTED_ERRORS σφάλματα συνολικά — αρκετά για το UI, όχι φόρτωση απεριόριστου πίνακα. */
  errors: FieldError[]
}

export const IMPORT_CHUNK_SIZE = 1000
export const SYNC_EXECUTE_THRESHOLD = 500
const MAX_REPORTED_ERRORS = 50

export function emptyTotals(total: number): ImportTotals {
  return { total, processed: 0, created: 0, updated: 0, failed: 0, errors: [] }
}

function pushErrors(totals: ImportTotals, errors: FieldError[]) {
  totals.failed += errors.length
  const room = MAX_REPORTED_ERRORS - totals.errors.length
  if (room > 0) totals.errors.push(...errors.slice(0, room))
}

type PreparedRow = { rowNum: number; data: ParsedProductFields; existed: boolean }

/**
 * Parse + in-chunk duplicate-code detection + bulk existence check. Κοινό
 * pipeline για validate (χωρίς γραφή) και execute (με γραφή) — ώστε τα δύο
 * βήματα να συμφωνούν πάντα στο ποιες γραμμές είναι έγκυρες.
 */
async function prepareChunk(rows: RawImportRow[]): Promise<{ ok: PreparedRow[]; errors: FieldError[] }> {
  const errors: FieldError[] = []
  const okParsed: { rowNum: number; data: ParsedProductFields }[] = []

  for (const row of rows) {
    const parsed = parseProductRow(row.rowNum, row.values)
    if (parsed.ok) okParsed.push({ rowNum: parsed.rowNum, data: parsed.data })
    else errors.push(...parsed.errors)
  }

  // Διπλότυπος κωδικός ΜΕΣΑ στο ίδιο chunk — κρατάμε την 1η εμφάνιση, οι επόμενες γίνονται error.
  // (Έλεγχος σε επίπεδο ΟΛΟΚΛΗΡΟΥ αρχείου γίνεται client-side πριν την αποστολή — βλ. findDuplicateCodes.)
  const firstSeenAt = new Map<string, number>()
  const deduped: { rowNum: number; data: ParsedProductFields }[] = []
  for (const row of okParsed) {
    const seenAtRow = firstSeenAt.get(row.data.code)
    if (seenAtRow) {
      errors.push({ row: row.rowNum, column: 'Κωδικός', message: `Διπλότυπος κωδικός μέσα στο αρχείο (ήδη στη γραμμή ${seenAtRow}).` })
      continue
    }
    firstSeenAt.set(row.data.code, row.rowNum)
    deduped.push(row)
  }

  if (deduped.length === 0) return { ok: [], errors }

  const existing = await prisma.product.findMany({
    where: { code: { in: deduped.map(r => r.data.code) } },
    select: { code: true },
  })
  const existingCodes = new Set(existing.map(p => p.code))

  const ok: PreparedRow[] = deduped.map(r => ({ rowNum: r.rowNum, data: r.data, existed: existingCodes.has(r.data.code) }))
  return { ok, errors }
}

export type ValidateChunkResult = { toCreate: number; toUpdate: number; errors: FieldError[] }

/** Dry-run — καμία γραφή. Καλείται ανά chunk (≤1000 γραμμές) από το Βήμα 4 Έλεγχος. */
export async function validateProductChunk(rows: RawImportRow[]): Promise<ValidateChunkResult> {
  const { ok, errors } = await prepareChunk(rows)
  const toCreate = ok.filter(r => !r.existed).length
  const toUpdate = ok.filter(r => r.existed).length
  return { toCreate, toUpdate, errors }
}

/**
 * Δημιουργεί/ενημερώνει Product + ProductTranslation('el') [+'en' αν δόθηκε].
 * Κενό αριθμητικό πεδίο σε ΕΝΗΜΕΡΩΣΗ = δεν αγγίζεται (δεν σβήνει υπάρχουσα τιμή) —
 * `?? undefined` παραλείπει το κλειδί από το Prisma `update`. Σε ΔΗΜΙΟΥΡΓΙΑ το
 * κενό αποθηκεύεται ως null κανονικά. mtrl πάντα null εδώ (imported-only προϊόν
 * μέχρι να συγχρονιστεί με το SoftOne — Φάση 5), status πάντα DRAFT σε δημιουργία
 * και ΔΕΝ αγγίζεται σε ενημέρωση (δεν υποβαθμίζουμε ένα ήδη PUBLISHED προϊόν).
 */
async function upsertOneProduct(data: ParsedProductFields): Promise<'created' | 'updated'> {
  return prisma.$transaction(async tx => {
    const before = await tx.product.findUnique({ where: { code: data.code }, select: { id: true } })

    const product = await tx.product.upsert({
      where: { code: data.code },
      create: {
        code: data.code,
        mtrl: null,
        status: 'DRAFT',
        priceWholesale: data.priceWholesale,
        priceRetail: data.priceRetail,
        cbmPerUnit: data.cbmPerUnit,
        weightPerUnit: data.weightPerUnit,
        stock: data.stock,
      },
      update: {
        priceWholesale: data.priceWholesale ?? undefined,
        priceRetail: data.priceRetail ?? undefined,
        cbmPerUnit: data.cbmPerUnit ?? undefined,
        weightPerUnit: data.weightPerUnit ?? undefined,
        stock: data.stock ?? undefined,
      },
    })

    await tx.productTranslation.upsert({
      where: { productId_locale: { productId: product.id, locale: 'el' } },
      create: { productId: product.id, locale: 'el', name: data.name },
      update: { name: data.name },
    })

    if (data.nameEn) {
      await tx.productTranslation.upsert({
        where: { productId_locale: { productId: product.id, locale: 'en' } },
        create: { productId: product.id, locale: 'en', name: data.nameEn },
        update: { name: data.nameEn },
      })
    }

    return before ? 'updated' : 'created'
  })
}

/** Εκτελεί ΕΝΑ chunk (γράφει στη DB) — μία μικρή transaction ανά γραμμή ώστε ένα κακό row να μην ρίχνει όλο το chunk. */
async function executeChunk(rows: RawImportRow[], totals: ImportTotals): Promise<void> {
  const { ok, errors } = await prepareChunk(rows)
  pushErrors(totals, errors)

  for (const row of ok) {
    try {
      const action = await upsertOneProduct(row.data)
      if (action === 'created') totals.created++
      else totals.updated++
    } catch (err) {
      console.error('[import] αποτυχία γραμμής', row.rowNum, err)
      pushErrors(totals, [{ row: row.rowNum, column: 'Κωδικός', message: 'Σφάλμα κατά την αποθήκευση στη βάση δεδομένων.' }])
    }
  }
  totals.processed += rows.length
}

/**
 * Τρέχει ολόκληρο το import σε chunks των IMPORT_CHUNK_SIZE. Κοινή συνάρτηση
 * για το sync path (≤500 γραμμές, actions.ts) και τον pg-boss worker
 * (>500 γραμμές) — `onProgress` γράφει το partial ImportTotals στο ImportJob
 * ανάμεσα σε chunks ώστε το polling να δείχνει πραγματική πρόοδο.
 */
export async function runProductImport(
  rows: RawImportRow[],
  onProgress?: (totals: ImportTotals) => Promise<void>,
): Promise<ImportTotals> {
  const totals = emptyTotals(rows.length)
  const chunks = chunkArray(rows, IMPORT_CHUNK_SIZE)
  for (const chunk of chunks) {
    await executeChunk(chunk, totals)
    if (onProgress) await onProgress({ ...totals, errors: [...totals.errors] })
  }
  return totals
}
