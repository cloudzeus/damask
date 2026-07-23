'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { s1 } from '@/lib/softone'
import { getIntegration, isIntegrationConfigured } from '@/lib/settings'
import { aadeLookup } from '@/lib/trdr/aade'
import type { ExtractedDocument } from '@/lib/ocr/schema'
import {
  decideTrdrSodtype,
  matchLineToProducts,
  buildTrdrCreateFromInvoice,
  buildProductCreateFromLine,
  type InvoiceDocKind,
  type InvoiceFlowReport,
  type ProductMatchCandidate,
} from './prep'

/**
 * Workflow Α («Εταιρία» — λογιστική παρακολούθηση ΕΛΠ), W4 design doc
 * (docs/superpowers/specs/2026-07-23-invoice-ocr-w4-design.md §Workflow Α):
 * OCR-extracted παραστατικό → Trdr lookup/create (by ΑΦΜ+SODTYPE, προαιρετικός
 * ΑΑΔΕ εμπλουτισμός) → S1 push ΜΟΝΟ αν ενεργή σύνδεση (non-fatal) → γραμμές →
 * Product match/create (+ S1 push ανά νέο είδος, non-fatal) → σύνοψη report.
 *
 * Gating: ΙΔΙΟ permission με το υπάρχον OCR entry point
 * (src/lib/ocr/actions.ts#runOcrExtraction) — 'media.manage' ΠΡΟΣΩΡΙΝΑ (δεν
 * υπάρχει ακόμα dedicated permission για OCR, βλ. TODO εκεί).
 */

export interface ProcessCompanyInvoiceInput {
  extracted: ExtractedDocument
  docKind: InvoiceDocKind
  /** Προαιρετικός εμπλουτισμός ΑΑΔΕ (W2 aadeLookup) όταν δημιουργείται νέος Trdr — non-fatal αν αποτύχει. */
  enrichAade?: boolean
}

/** Ελάχιστα πεδία Trdr που χρειάζεται το setData CUSTOMER/SUPPLIER payload. */
type S1TrdrFields = {
  NAME: string
  AFM: string | null
  ADDRESS: string | null
  CITY: string | null
  ZIP: string | null
  PHONE01: string | null
  EMAIL: string | null
  WEBPAGE: string | null
}

/** Ανεκτικό parse ενός αριθμητικού S1 id από τα διάφορα πιθανά σχήματα απάντησης setData. */
function extractS1Id(res: unknown, object: string): number | null {
  if (!res || typeof res !== 'object') return null
  const r = res as Record<string, unknown>
  const nested = r[object] as Record<string, unknown> | undefined
  const raw = r.id ?? nested?.id ?? (r.data as Record<string, unknown> | undefined)?.id
  if (raw == null) return null
  const n = Number(raw)
  return Number.isFinite(n) ? n : null
}

/** setData CUSTOMER (SODTYPE 13) / SUPPLIER (SODTYPE 12) — ίδιο υποκείμενο TRDR στο SoftOne, βλ. prisma schema comment. */
async function pushTrdrToS1(trdr: S1TrdrFields, sodtype: 12 | 13): Promise<number | null> {
  const object = sodtype === 12 ? 'SUPPLIER' : 'CUSTOMER'
  const res = await s1('setData', {
    OBJECT: object,
    data: {
      [object]: [{
        NAME: trdr.NAME,
        AFM: trdr.AFM,
        ADDRESS: trdr.ADDRESS,
        CITY: trdr.CITY,
        ZIP: trdr.ZIP,
        PHONE01: trdr.PHONE01,
        EMAIL: trdr.EMAIL,
        WEBPAGE: trdr.WEBPAGE,
      }],
    },
  })
  if (!res?.success) throw new Error(res?.error ?? `S1 setData (${object}) απέτυχε`)
  return extractS1Id(res, object)
}

/** setData ITEM — νέο είδος στο SoftOne για προϊόν που μόλις δημιουργήθηκε από γραμμή παραστατικού. */
async function pushItemToS1(code: string, name: string): Promise<number | null> {
  const res = await s1('setData', {
    OBJECT: 'ITEM',
    data: { ITEM: [{ CODE: code, NAME: name }] },
  })
  if (!res?.success) throw new Error(res?.error ?? 'S1 setData (ITEM) απέτυχε')
  return extractS1Id(res, 'ITEM')
}

async function isS1Active(): Promise<boolean> {
  const softone = await getIntegration('softone')
  return isIntegrationConfigured('softone', softone)
}

export async function processCompanyInvoice(input: ProcessCompanyInvoiceInput): Promise<InvoiceFlowReport> {
  await requirePermission('media.manage')

  const sodtype = decideTrdrSodtype(input.docKind)
  // Αγορά: εμείς είμαστε ο παραλήπτης, ο αντισυμβαλλόμενος είναι ο εκδότης (issuer).
  // Πώληση: εμείς είμαστε ο εκδότης, ο αντισυμβαλλόμενος είναι ο παραλήπτης (counterparty).
  const party = input.docKind === 'purchase' ? input.extracted.issuer : input.extracted.counterparty

  const afm = party?.afm?.trim() ?? ''
  if (!/^\d{9}$/.test(afm)) {
    throw new Error('Το ΑΦΜ του αντισυμβαλλόμενου λείπει ή δεν είναι έγκυρο (9 ψηφία) — δεν μπορεί να συνεχίσει η καταχώριση.')
  }

  const s1Active = await isS1Active()
  let s1Failed = 0
  let trdrPushed: boolean | undefined

  let trdrRow = await prisma.trdr.findFirst({ where: { AFM: afm, SODTYPE: sodtype } })
  let trdrStatus: 'matched' | 'created' = 'matched'

  if (!trdrRow) {
    trdrStatus = 'created'

    let aadeMapped = null
    if (input.enrichAade) {
      try {
        const result = await aadeLookup(afm)
        aadeMapped = result?.mapped ?? null
      } catch (err) {
        console.error('[processCompanyInvoice] ΑΑΔΕ enrich απέτυχε (non-fatal)', err)
      }
    }

    const createData = buildTrdrCreateFromInvoice(
      {
        name: party?.name ?? null,
        afm,
        address: party?.address ?? null,
        city: null,
        zip: null,
        phones: party?.phones ?? [],
        emails: party?.emails ?? [],
        website: party?.website ?? null,
        sodtype,
      },
      aadeMapped,
    )
    trdrRow = await prisma.trdr.create({ data: createData })

    if (s1Active) {
      try {
        const s1Id = await pushTrdrToS1(trdrRow, sodtype)
        if (s1Id != null) {
          trdrRow = await prisma.trdr.update({ where: { id: trdrRow.id }, data: { TRDR: s1Id, syncedAt: new Date() } })
          trdrPushed = true
        } else {
          trdrPushed = false
          s1Failed += 1
        }
      } catch (err) {
        console.error('[processCompanyInvoice] S1 TRDR push απέτυχε (non-fatal)', err)
        trdrPushed = false
        s1Failed += 1
      }
    }
  }

  // ── Γραμμές: μία query για όλα τα candidate products, μετά match/create ανά γραμμή ──
  const lines = input.extracted.lines ?? []
  const productRows = await prisma.product.findMany({
    select: { id: true, code: true, translations: { where: { locale: 'el' }, select: { name: true } } },
  })
  const candidates: ProductMatchCandidate[] = productRows.map(p => ({
    id: p.id, code: p.code, name: p.translations[0]?.name ?? '',
  }))
  const usedCodes = new Set(candidates.map(c => (c.code ?? '').trim().toUpperCase()))

  let matched = 0
  let created = 0
  let itemsPushed = 0

  for (const line of lines) {
    const lineInput = { name: line.description ?? '' }
    const match = matchLineToProducts(lineInput, candidates)
    if (match) {
      matched += 1
      continue
    }

    const base = buildProductCreateFromLine(lineInput)
    let code = base.code
    let attempt = 1
    while (usedCodes.has(code.toUpperCase())) {
      attempt += 1
      code = `${base.code}-${attempt}`
    }
    usedCodes.add(code.toUpperCase())

    const product = await prisma.product.create({ data: { ...base, code } })
    created += 1
    candidates.push({ id: product.id, code: product.code, name: lineInput.name })

    if (s1Active) {
      try {
        const mtrl = await pushItemToS1(product.code, lineInput.name)
        if (mtrl != null) {
          await prisma.product.update({ where: { id: product.id }, data: { mtrl, s1UpdatedAt: new Date() } })
          itemsPushed += 1
        } else {
          s1Failed += 1
        }
      } catch (err) {
        console.error('[processCompanyInvoice] S1 ITEM push απέτυχε (non-fatal)', err)
        s1Failed += 1
      }
    }
  }

  return {
    trdr: { status: trdrStatus, id: trdrRow.id },
    lines: { matched, created },
    s1: { trdrPushed, itemsPushed, failed: s1Failed },
  }
}
