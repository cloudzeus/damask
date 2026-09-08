'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { aadeLookup, AadeLookupError } from '@/lib/aade'
import { evaluateTrdrEligibility } from '@/lib/prospects/eligibility'
import { extractKadRule } from '@/lib/prospects/evaluate-pair'
import { regionFromZip } from '@/lib/referrals/region-from-zip'
import { associateTrdrPrograms } from '@/lib/pm/program-link'
import { ensureTrdrCdnFolder } from '@/lib/trdr/cdn-folder'

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
  revalidatePath('/referrals/eligible')

  return { ok: true, batchId: batch.id, companies: results, total: clean.length, eligible: eligibleCount }
}

// ── Επιλέξιμοι ανά παραπομπή ────────────────────────────────────────────────

export type EligibleCompanyRow = {
  id: string
  afm: string
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  regionName: string | null
  regionConfident: boolean
  referrerId: string
  referrerName: string
  eligiblePrograms: EligibleProgramLite[]
  existingTrdrId: string | null
  existingIsCustomer: boolean
}

/** Όλες οι επιλέξιμες εταιρίες (status ELIGIBLE) που δεν έχουν ακόμη αναχθεί σε
 * δυνητικό πελάτη (convertedTrdrId=null) — για τη σελίδα «Επιλέξιμοι ανά
 * παραπομπή». Επιστρέφει και τη λίστα εταιριών παραπομπής για φίλτρο. */
export async function listEligibleReferralCompanies(): Promise<{
  rows: EligibleCompanyRow[]
  referrers: ReferrerOption[]
}> {
  await requirePermission('programs.manage')
  const companies = await prisma.referralCompany.findMany({
    where: { status: 'ELIGIBLE', convertedTrdrId: null },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true, afm: true, name: true, email: true, phone: true, city: true,
      regionName: true, regionConfident: true, referrerId: true,
      eligiblePrograms: true, existingTrdrId: true, existingIsCustomer: true,
      referrer: { select: { name: true } },
    },
  })
  const rows: EligibleCompanyRow[] = companies.map(c => ({
    id: c.id, afm: c.afm, name: c.name, email: c.email, phone: c.phone, city: c.city,
    regionName: c.regionName, regionConfident: c.regionConfident,
    referrerId: c.referrerId, referrerName: c.referrer?.name ?? '—',
    eligiblePrograms: (c.eligiblePrograms as unknown as EligibleProgramLite[]) ?? [],
    existingTrdrId: c.existingTrdrId, existingIsCustomer: c.existingIsCustomer,
  }))
  const referrerMap = new Map<string, string>()
  for (const r of rows) referrerMap.set(r.referrerId, r.referrerName)
  const referrers = [...referrerMap.entries()].map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name, 'el'))
  return { rows, referrers }
}

/**
 * Αναγωγή μιας επιλέξιμης εταιρίας σε δυνητικό πελάτη για τα επιλεγμένα
 * προγράμματα. Εξασφαλίζει Trdr μέσω ΑΦΜ (ΟΧΙ διπλοεγγραφή — reuse υπάρχοντος),
 * συνδέει τον συστήνοντα (referrer), δημιουργεί ProgramApplication(s) POTENTIAL,
 * και μαρκάρει τη ReferralCompany ως αναχθείσα (convertedTrdrId).
 */
export async function convertReferralToProspect(
  companyId: string,
  programIds: string[],
): Promise<{ ok: boolean; trdrId?: string; linked?: number; message?: string }> {
  await requirePermission('programs.manage')
  if (programIds.length === 0) return { ok: false, message: 'Επίλεξε τουλάχιστον ένα πρόγραμμα.' }

  const c = await prisma.referralCompany.findUnique({
    where: { id: companyId },
    select: { id: true, afm: true, name: true, email: true, phone: true, referrerId: true, existingTrdrId: true, convertedTrdrId: true },
  })
  if (!c) return { ok: false, message: 'Η εγγραφή δεν βρέθηκε.' }
  if (c.convertedTrdrId) return { ok: false, message: 'Έχει ήδη δημιουργηθεί δυνητικός πελάτης για αυτή την εταιρία.' }

  // 1) Εξασφάλιση Trdr — ΠΟΤΕ διπλοεγγραφή: existingTrdrId → lookup ΑΦΜ → create.
  let trdrId = c.existingTrdrId ?? (await prisma.trdr.findFirst({ where: { AFM: c.afm }, select: { id: true } }))?.id ?? null
  if (!trdrId) {
    const created = await prisma.trdr.create({
      data: {
        NAME: c.name || `ΑΦΜ ${c.afm}`,
        AFM: c.afm,
        SODTYPE: 13,
        ISPROSP: 1,
        EMAIL: c.email ?? undefined,
        PHONE01: c.phone ?? undefined,
        referrerId: c.referrerId,
        appNotes: 'Δημιουργήθηκε από χαρτογράφηση παραπομπής.',
      },
      select: { id: true },
    })
    trdrId = created.id
    await ensureTrdrCdnFolder(trdrId).catch(() => {})
  } else {
    // Υπάρχων συναλλασσόμενος → σύνδεσε τον συστήνοντα αν λείπει (χωρίς overwrite).
    await prisma.trdr.updateMany({ where: { id: trdrId, referrerId: null }, data: { referrerId: c.referrerId } })
  }

  // 2) ProgramApplication(s) POTENTIAL για τα επιλεγμένα προγράμματα.
  const res = await associateTrdrPrograms(trdrId, programIds)

  // 3) Μαρκάρισμα αναχθείσας.
  await prisma.referralCompany.update({ where: { id: companyId }, data: { convertedTrdrId: trdrId } })
  revalidatePath('/referrals/eligible')
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true, trdrId, linked: res.linked }
}
