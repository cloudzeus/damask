import { prisma } from '@/lib/prisma'
import { resolveIrsdataCode } from '@/lib/trdr/irsdata'
import { applyAadeToTrdr, gemiSyncTrdr, matchTrdrRegionAction } from '@/lib/trdr/enrich-actions'
import { geocodeSearchParts } from '@/lib/geocode'
import { getIntegration } from '@/lib/settings'
import { emptyTotals, type ImportTotals } from '@/lib/import/product-upsert'
import type { ParsedRow } from '@/lib/ingestion/validate'
import type { CommitEnrichOptions } from '@/lib/ingestion/target'

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
  /** ΔΟΥ όπως ήρθε από την πηγή (κωδικός ή όνομα) — resolve σε Irsdata.CODE στο runPartnerUpsert (async). */
  doy: string | null
  data: {
    NAME: string; AFM: string | null; ADDRESS: string | null; CITY: string | null; DISTRICT: string | null; ZIP: string | null
    PHONE01: string | null; PHONE02: string | null; FAX: string | null; EMAIL: string | null; EMAILACC: string | null
    WEBPAGE: string | null; JOBTYPETRD: string | null; appLegalForm: string | null; foundingDate: Date | null
    appEmployees: number | null; appAnnualRevenue: number | null
    appNotes: string | null; SODTYPE: number
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
      rowNum: p.rowNum, afm, doy: str(d.doy),
      data: {
        NAME: String(d.name ?? ''), AFM: str(d.afm), ADDRESS: str(d.address), CITY: str(d.city), DISTRICT: str(d.district), ZIP: str(d.zip),
        PHONE01: str(d.phone), PHONE02: str(d.phone2), FAX: str(d.fax), EMAIL: str(d.email), EMAILACC: str(d.emailAcc),
        WEBPAGE: str(d.website), JOBTYPETRD: str(d.jobtype), appLegalForm: str(d.legalForm),
        foundingDate: d.foundingDate instanceof Date ? d.foundingDate : null,
        appEmployees: typeof d.employees === 'number' ? d.employees : null,
        appAnnualRevenue: typeof d.annualRevenue === 'number' ? d.annualRevenue : null,
        appNotes: str(d.notes),
        SODTYPE: typeof d.sodtype === 'number' ? d.sodtype : 13,
      },
    })
  }
  return out
}

/** UPDATE data: never overwrite an existing field with null/blank, and never change SODTYPE on re-import
 *  (blank type cells default to 13 upstream, which would silently flip an existing supplier 12→13). */
export function buildPartnerUpdateData(d: PreparedPartner['data'], irsdataCode: string | null): Record<string, unknown> {
  const out: Record<string, unknown> = { NAME: d.NAME }
  for (const k of [
    'AFM', 'ADDRESS', 'CITY', 'DISTRICT', 'ZIP', 'PHONE01', 'PHONE02', 'FAX',
    'EMAIL', 'EMAILACC', 'WEBPAGE', 'JOBTYPETRD', 'appLegalForm', 'foundingDate',
    'appEmployees', 'appAnnualRevenue', 'appNotes',
  ] as const) {
    if (d[k] != null) out[k] = d[k]
  }
  if (irsdataCode) out.IRSDATA = irsdataCode
  return out // SODTYPE intentionally omitted on update
}

/** Προαιρετικός εμπλουτισμός ανά γραμμή μετά το upsert — επιλέγεται στο βήμα «Καταχώριση».
 *  Ο τύπος ζει στο client-safe @/lib/ingestion/target (βλ. σχόλιο εκεί). */
export type PartnerEnrichOptions = CommitEnrichOptions

/**
 * Ανά-γραμμή εμπλουτισμός με per-step try/catch — μια αποτυχία (π.χ. ΑΦΜ εκτός
 * μητρώου ΓΕΜΗ) καταγράφεται στα errors χωρίς να χαλάει το upsert της γραμμής.
 * Σειρά: ΑΑΔΕ → ΓΕΜΗ → Geocode → Περιφέρεια (η περιφέρεια αξιοποιεί ό,τι
 * συμπλήρωσαν τα προηγούμενα — διεύθυνση/gemiData/συντεταγμένες).
 */
async function enrichTrdrRow(
  trdrId: string,
  rowNum: number,
  opts: PartnerEnrichOptions,
  geocodeApiKey: string,
  pushError: (row: number, column: string, message: string) => void,
): Promise<void> {
  if (opts.aade) {
    try {
      await applyAadeToTrdr(trdrId)
    } catch (err) {
      pushError(rowNum, 'ΑΑΔΕ', err instanceof Error ? err.message : 'Αποτυχία ελέγχου ΑΑΔΕ.')
    }
  }
  if (opts.gemi) {
    try {
      await gemiSyncTrdr(trdrId, { syncDocuments: false })
    } catch (err) {
      pushError(rowNum, 'ΓΕΜΗ', err instanceof Error ? err.message : 'Αποτυχία συγχρονισμού ΓΕΜΗ.')
    }
  }
  if (opts.geocode) {
    try {
      const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { ADDRESS: true, CITY: true, DISTRICT: true, ZIP: true, appLat: true } })
      if (trdr && trdr.appLat == null && geocodeApiKey && (trdr.ADDRESS || trdr.CITY || trdr.ZIP)) {
        // ZIP-aware fallback chain — η ΑΑΔΕ «πόλη» είναι συχνά παραπλανητική (βλ. geocodeSearchParts).
        const hit = await geocodeSearchParts(
          { address: trdr.ADDRESS, city: trdr.DISTRICT ?? trdr.CITY, zip: trdr.ZIP },
          geocodeApiKey,
        )
        if (hit) await prisma.trdr.update({ where: { id: trdrId }, data: { appLat: hit.lat, appLng: hit.lng } })
      }
    } catch (err) {
      pushError(rowNum, 'Geodata', err instanceof Error ? err.message : 'Αποτυχία γεωκωδικοποίησης.')
    }
  }
  if (opts.region) {
    try {
      await matchTrdrRegionAction(trdrId)
    } catch (err) {
      pushError(rowNum, 'Περιφέρεια', err instanceof Error ? err.message : 'Αποτυχία αντιστοίχισης περιφέρειας.')
    }
  }
}

/** SERVER: upsert σε Trdr by AFM (AFM δεν είναι @unique → findFirst + create/update). TRDR=null (unsynced). */
export async function runPartnerUpsert(parsed: ParsedRow[], enrich: PartnerEnrichOptions = {}): Promise<ImportTotals> {
  const prepared = preparePartnerRows(parsed)
  const totals = emptyTotals(parsed.length)
  totals.failed = parsed.length - prepared.length
  totals.processed = parsed.length - prepared.length

  const anyEnrich = !!(enrich.aade || enrich.gemi || enrich.region || enrich.geocode)
  const geocodeApiKey = enrich.geocode
    ? ((await getIntegration<{ geocodeApiKey?: string }>('maps')).geocodeApiKey?.trim() ?? '')
    : ''
  const pushError = (row: number, column: string, message: string) => {
    if (totals.errors.length < 50) totals.errors.push({ row, column, message })
  }

  // ΔΟΥ κελί: ψηφία → match κατά Irsdata.CODE, αλλιώς κατά NAME (resolveIrsdataCode).
  // Cache ανά μοναδική τιμή — τα Excel έχουν συνήθως λίγες διαφορετικές ΔΟΥ.
  const doyCache = new Map<string, string | null>()
  async function doyToIrsdata(doy: string | null): Promise<string | null> {
    if (!doy) return null
    if (!doyCache.has(doy)) {
      const isCode = /^\d+$/.test(doy)
      doyCache.set(doy, await resolveIrsdataCode(isCode ? doy : null, isCode ? null : doy))
    }
    return doyCache.get(doy) ?? null
  }

  for (const row of prepared) {
    try {
      const irsdataCode = await doyToIrsdata(row.doy)
      // defensive: afm is always a validated 9-digit string here
      const existing = row.afm ? await prisma.trdr.findFirst({ where: { AFM: row.afm } }) : null
      let trdrId: string
      if (existing) {
        await prisma.trdr.update({ where: { id: existing.id }, data: buildPartnerUpdateData(row.data, irsdataCode) })
        totals.updated++
        trdrId = existing.id
      } else {
        const created = await prisma.trdr.create({ data: { ...row.data, IRSDATA: irsdataCode, TRDR: null, ISPROSP: 0 } })
        totals.created++
        trdrId = created.id
      }
      if (anyEnrich) {
        await enrichTrdrRow(trdrId, row.rowNum, enrich, geocodeApiKey, pushError)
        // Throttle μεταξύ γραμμών όταν καλείται το ΓΕΜΗ (~2 κλήσεις/γραμμή) —
        // το API έχει αυστηρό rate limit (429)· το gemiFetch κάνει και retry με backoff.
        if (enrich.gemi) await new Promise(resolve => setTimeout(resolve, 800))
      }
    } catch (err) {
      totals.failed++
      if (totals.errors.length < 50) totals.errors.push({ row: row.rowNum, column: 'Συναλλασσόμενος', message: err instanceof Error ? err.message : 'Σφάλμα αποθήκευσης.' })
    }
    totals.processed++
  }
  return totals
}
