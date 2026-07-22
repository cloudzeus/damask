import { prisma } from '@/lib/prisma'
import { emptyTotals, type ImportTotals } from '@/lib/import/product-upsert'
import type { ParsedRow } from '@/lib/ingestion/validate'

/**
 * server-only module (εισάγει prisma) — ΠΟΤΕ μην το κάνεις import από αρχείο
 * με 'use client'. Καλείται μόνο από src/lib/ingestion/commit/index.ts.
 */

const str = (v: unknown): string | null => {
  const s = v == null ? '' : String(v).trim()
  return s === '' ? null : s
}

export type PreparedPartner = {
  rowNum: number
  afm: string
  data: {
    NAME: string; AFM: string | null; ADDRESS: string | null; CITY: string | null; ZIP: string | null
    PHONE01: string | null; EMAIL: string | null; WEBPAGE: string | null; SODTYPE: number
  }
}

/** PURE: parsed valid rows → Trdr write-data. Άκυρες γραμμές παραλείπονται. */
export function preparePartnerRows(parsed: ParsedRow[]): PreparedPartner[] {
  const out: PreparedPartner[] = []
  for (const p of parsed) {
    if (!p.ok) continue
    const d = p.data
    const afm = String(d.afm ?? '')
    out.push({
      rowNum: p.rowNum, afm,
      data: {
        NAME: String(d.name ?? ''), AFM: str(d.afm), ADDRESS: str(d.address), CITY: str(d.city), ZIP: str(d.zip),
        PHONE01: str(d.phone), EMAIL: str(d.email), WEBPAGE: str(d.website),
        SODTYPE: typeof d.sodtype === 'number' ? d.sodtype : 13,
      },
    })
  }
  return out
}

/** SERVER: upsert σε Trdr by AFM (AFM δεν είναι @unique → findFirst + create/update). TRDR=null (unsynced). */
export async function runPartnerUpsert(parsed: ParsedRow[]): Promise<ImportTotals> {
  const prepared = preparePartnerRows(parsed)
  const totals = emptyTotals(parsed.length)
  totals.failed = parsed.length - prepared.length
  for (const row of prepared) {
    try {
      const existing = row.afm ? await prisma.trdr.findFirst({ where: { AFM: row.afm } }) : null
      if (existing) {
        await prisma.trdr.update({ where: { id: existing.id }, data: row.data })
        totals.updated++
      } else {
        await prisma.trdr.create({ data: { ...row.data, TRDR: null, ISPROSP: 0 } })
        totals.created++
      }
      totals.processed++
    } catch (err) {
      totals.failed++
      if (totals.errors.length < 50) totals.errors.push({ row: row.rowNum, column: 'Συναλλασσόμενος', message: err instanceof Error ? err.message : 'Σφάλμα αποθήκευσης.' })
    }
  }
  return totals
}
