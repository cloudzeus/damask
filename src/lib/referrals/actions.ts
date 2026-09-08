'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { aadeLookup, AadeLookupError } from '@/lib/aade'
import { evaluateTrdrEligibility } from '@/lib/prospects/eligibility'
import { extractKadRule } from '@/lib/prospects/evaluate-pair'
import { regionFromZip } from '@/lib/referrals/region-from-zip'

/**
 * Batch χαρτογράφησης επιλεξιμότητας ανά εταιρία παραπομπής: Excel (ΑΦΜ/email/
 * τηλέφωνο) → ΑΑΔΕ lookup + best-effort Περιφέρεια (ΤΚ) + έλεγχος επιλεξιμότητας
 * σε ενεργά προγράμματα. Αποθηκεύει ReferralBatch + ReferralCompany.
 * Gated: 'programs.manage'. Σύγχρονη επεξεργασία (μικρά batch <50).
 */

export type ReferrerOption = { id: string; name: string }

export async function listReferrerOptions(): Promise<ReferrerOption[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.referrer.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } })
  return rows
}

/** Ενεργά προγράμματα (id+τίτλος) — για το dropdown του δοκιμαστικού preview email. */
export async function listActiveProgramTitles(): Promise<{ id: string; title: string }[]> {
  await requirePermission('programs.manage')
  return prisma.program.findMany({ where: { status: 'ACTIVE' }, orderBy: { title: 'asc' }, select: { id: true, title: true } })
}

export type ReferralRowInput = { afm: string; email?: string | null; phone?: string | null }
export type EligibleProgramLite = { programId: string; title: string; fundingRate: number | null }

export type ReferralCompanyResult = {
  id: string
  afm: string
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  regionName: string | null
  regionConfident: boolean
  status: string
  eligiblePrograms: EligibleProgramLite[]
  existingTrdrId: string | null
  existingIsCustomer: boolean
  error: string | null
}

async function loadActivePrograms() {
  const programs = await prisma.program.findMany({
    where: { status: 'ACTIVE' },
    select: {
      id: true, title: true, fundingRate: true, extractedData: true,
      kads: { select: { code: true } },
      regions: { select: { name: true } },
      legalForms: { select: { name: true } },
    },
  })
  return programs.map(p => ({
    id: p.id,
    title: p.title,
    fundingRate: p.fundingRate == null ? null : Number(p.fundingRate),
    kadRule: extractKadRule(p.extractedData),
    kads: p.kads.map(k => ({ code: k.code, excluded: false })),
    regionNames: p.regions.map(r => r.name),
    legalFormNames: p.legalForms.map(f => f.name),
  }))
}

export async function runReferralBatch(
  referrerId: string,
  fileName: string | null,
  rows: ReferralRowInput[],
): Promise<{ ok: boolean; batchId?: string; message?: string; companies: ReferralCompanyResult[]; total: number; eligible: number }> {
  const session = await requirePermission('programs.manage')
  const referrer = await prisma.referrer.findUnique({ where: { id: referrerId }, select: { id: true } })
  if (!referrer) return { ok: false, message: 'Η εταιρία παραπομπής δεν βρέθηκε.', companies: [], total: 0, eligible: 0 }

  // dedupe ανά ΑΦΜ (9ψήφιο), κράτα email/phone από την πρώτη εμφάνιση.
  const seen = new Map<string, ReferralRowInput>()
  for (const r of rows) {
    const afm = (r.afm ?? '').replace(/\D/g, '').slice(0, 9)
    if (afm.length !== 9 || seen.has(afm)) continue
    seen.set(afm, { afm, email: r.email?.trim() || null, phone: r.phone?.trim() || null })
  }
  const clean = [...seen.values()]
  if (clean.length === 0) return { ok: false, message: 'Δεν βρέθηκαν έγκυρα ΑΦΜ (9 ψηφία) στο αρχείο.', companies: [], total: 0, eligible: 0 }

  const programs = await loadActivePrograms()

  const batch = await prisma.referralBatch.create({
    data: { referrerId, fileName: fileName?.slice(0, 200) ?? null, total: clean.length, createdById: session.user.id },
  })

  const results: ReferralCompanyResult[] = []
  let eligibleCount = 0

  for (const row of clean) {
    const existing = await prisma.trdr.findFirst({ where: { AFM: row.afm }, select: { id: true, ISPROSP: true } })
    let name: string | null = null
    let legalForm: string | null = null
    let city: string | null = null
    let zip: string | null = null
    let kadCodes: string[] = []
    let status = 'INELIGIBLE'
    let error: string | null = null
    const eligiblePrograms: EligibleProgramLite[] = []
    let regionName: string | null = null
    let regionConfident = false

    try {
      const company = await aadeLookup(row.afm)
      if (!company) {
        status = 'NOT_FOUND'
      } else {
        name = company.name
        legalForm = company.legalForm
        city = company.city
        zip = company.zip
        kadCodes = company.activities.map(a => a.code).filter((c): c is string => !!c)
        const reg = regionFromZip(company.zip)
        regionName = reg.name
        regionConfident = reg.confident

        for (const prog of programs) {
          const r = evaluateTrdrEligibility(
            { trdrCodes: kadCodes, legalForm, regionName },
            { kadRule: prog.kadRule, kads: prog.kads, regionNames: prog.regionNames, legalFormNames: prog.legalFormNames },
            // Best-effort Περιφέρεια → αν δεν βρέθηκε ΤΚ, μην κόβεις στο region.
            { kad: true, region: regionName != null, legalForm: true },
          )
          if (r.eligible) eligiblePrograms.push({ programId: prog.id, title: prog.title, fundingRate: prog.fundingRate })
        }
        status = eligiblePrograms.length > 0 ? 'ELIGIBLE' : 'INELIGIBLE'
      }
    } catch (err) {
      status = 'ERROR'
      error = err instanceof AadeLookupError ? err.message : 'Σφάλμα αναζήτησης ΑΑΔΕ.'
    }

    if (status === 'ELIGIBLE') eligibleCount++

    const saved = await prisma.referralCompany.create({
      data: {
        batchId: batch.id, referrerId, afm: row.afm, name, email: row.email, phone: row.phone,
        legalForm, city, zip, regionName, regionConfident,
        kads: kadCodes, eligiblePrograms: eligiblePrograms as unknown as object[],
        status, error,
        existingTrdrId: existing?.id ?? null, existingIsCustomer: existing ? existing.ISPROSP === 0 : false,
      },
      select: { id: true },
    })

    results.push({
      id: saved.id, afm: row.afm, name, email: row.email ?? null, phone: row.phone ?? null, city,
      regionName, regionConfident, status, eligiblePrograms,
      existingTrdrId: existing?.id ?? null, existingIsCustomer: existing ? existing.ISPROSP === 0 : false, error,
    })
  }

  await prisma.referralBatch.update({ where: { id: batch.id }, data: { eligibleCount } })
  revalidatePath('/referrals')

  return { ok: true, batchId: batch.id, companies: results, total: clean.length, eligible: eligibleCount }
}
