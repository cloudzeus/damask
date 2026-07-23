'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { aadeLookup } from '@/lib/trdr/aade'
import { createExpense, suggestExpenseCategory } from '@/lib/programs/actions'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import { buildTrdrCreateFromInvoice } from './prep'

/**
 * Workflow Β («Ευρωπαϊκό Πρόγραμμα»), W4 design doc §Workflow Β: OCR-extracted
 * παραστατικό αγοράς → προμηθευτής → Trdr SODTYPE 12 (lookup/create, ΧΩΡΙΣ S1
 * push — καθαρά δικό μας μητρώο, δεν αγγίζει το SoftOne) → createExpense στο
 * συγκεκριμένο application (C3, ήδη υπάρχον) → auto-suggest κατηγορίας
 * (non-fatal). ΚΑΝΕΝΑ Product δεν δημιουργείται ποτέ σε αυτό το workflow.
 *
 * Gating: 'programs.manage' — ΙΔΙΟ permission με createExpense/
 * listApplicationExpenses (src/lib/programs/actions.ts). createExpense κάνει
 * ήδη το δικό του requirePermission('programs.manage') — ο gate εδώ (πριν
 * αγγίξουμε Trdr) είναι επιπλέον άμυνα, όχι υποκατάστατο.
 */

export interface ProcessProgramInvoiceInput {
  applicationId: string
  extracted: ExtractedDocument
  /** Προαιρετικός εμπλουτισμός ΑΑΔΕ (W2 aadeLookup) όταν δημιουργείται νέος Trdr — non-fatal αν αποτύχει. */
  enrichAade?: boolean
}

export interface ProcessProgramInvoiceReport {
  trdr: { status: 'matched' | 'created'; id: string }
  expenseId: string
  suggested: Awaited<ReturnType<typeof suggestExpenseCategory>> | null
}

const SUPPLIER_SODTYPE = 12

export async function processProgramInvoice(input: ProcessProgramInvoiceInput): Promise<ProcessProgramInvoiceReport> {
  await requirePermission('programs.manage')

  const supplier = input.extracted.issuer
  const afm = supplier?.afm?.trim() ?? ''
  if (!/^\d{9}$/.test(afm)) {
    throw new Error('Το ΑΦΜ του προμηθευτή λείπει ή δεν είναι έγκυρο (9 ψηφία) — δεν μπορεί να συνεχίσει η καταχώριση.')
  }

  let trdrRow = await prisma.trdr.findFirst({ where: { AFM: afm, SODTYPE: SUPPLIER_SODTYPE } })
  let trdrStatus: 'matched' | 'created' = 'matched'

  if (!trdrRow) {
    trdrStatus = 'created'

    let aadeMapped = null
    if (input.enrichAade) {
      try {
        const result = await aadeLookup(afm)
        aadeMapped = result?.mapped ?? null
      } catch (err) {
        console.error('[processProgramInvoice] ΑΑΔΕ enrich απέτυχε (non-fatal)', err)
      }
    }

    const createData = buildTrdrCreateFromInvoice(
      {
        name: supplier.name ?? null,
        afm,
        address: supplier.address ?? null,
        city: null,
        zip: null,
        phones: supplier.phones ?? [],
        emails: supplier.emails ?? [],
        website: supplier.website ?? null,
        sodtype: SUPPLIER_SODTYPE,
      },
      aadeMapped,
    )
    // ΧΩΡΙΣ S1 push — Workflow Β είναι καθαρά δικό μας μητρώο (δες design doc).
    trdrRow = await prisma.trdr.create({ data: createData })
  }

  const description =
    input.extracted.notes?.trim()
    || [supplier.name, input.extracted.documentNumber].filter(Boolean).join(' — ')
    || 'Δαπάνη από τιμολόγιο (OCR)'
  const amount = input.extracted.totals.gross ?? input.extracted.totals.net ?? 0

  const { id: expenseId } = await createExpense(input.applicationId, {
    description,
    amount,
    vatAmount: input.extracted.totals.vat ?? null,
    date: input.extracted.date ?? null,
    vendor: supplier.name ?? null,
    vendorAfm: afm,
    docNumber: input.extracted.documentNumber ?? null,
  })

  let suggested: Awaited<ReturnType<typeof suggestExpenseCategory>> | null = null
  try {
    suggested = await suggestExpenseCategory(expenseId)
  } catch (err) {
    console.error('[processProgramInvoice] suggestExpenseCategory απέτυχε (non-fatal)', err)
  }

  return { trdr: { status: trdrStatus, id: trdrRow.id }, expenseId, suggested }
}
