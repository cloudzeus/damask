import { prisma } from '@/lib/prisma'
import { deriveHierarchyFromMap, type RegionNodeLookup } from '@/lib/registries/regions-tree'
import { yearsSince } from '@/lib/prospects/eligibility'

/**
 * (Plain module.) «Προφίλ επιλεξιμότητας» επιχείρησης — ενιαία εικόνα από όλες τις πηγές της
 * εφαρμογής: ΓΕΜΗ/ΑΑΔΕ (μορφή, ίδρυση, κατάσταση), ΚΑΔ, περιφέρεια, τιμές εντύπων ανά έτος
 * (ΕΜΕ, Ε3 τζίρος/EBITDA, Δήλωση ΜΜΕ) και δικαιολογητικά με ισχύ. Το διαβάζει ο agent
 * αξιολόγησης και αποθηκεύεται ως στιγμιότυπο στην αναφορά.
 */

export type ProfileSeriesPoint = { year: number; value: number | null; text: string | null; source: string; verified: boolean }
export type ProfileSeries = { key: string; label: string; points: ProfileSeriesPoint[] }

export type CompanyProfile = {
  trdrId: string
  name: string
  afm: string | null
  legalForm: string | null
  foundingDate: string | null
  operationalYears: number | null
  gemiStatus: string | null
  aadeStatus: string | null
  aadeFirmKind: string | null
  gemiObjective: string | null
  address: string | null
  region: { periferia: string | null; perifereiakiEnotita: string | null; dimos: string | null }
  kads: { code: string; description: string; primary: boolean }[]
  /** Τελευταίες γνωστές τιμές «κεφαλίδας» (από καρτέλα εταιρίας). */
  headline: {
    eme: number | null; emeYear: number | null; emeSource: string | null
    revenue: number | null; revenueYear: number | null; revenueSource: string | null
    smeCategory: string | null
  }
  /** Χρονοσειρές από ανεβασμένα έντυπα (ΕΜΕ, Ε3, Δήλωση ΜΜΕ…). */
  series: ProfileSeries[]
  documents: { type: string; name: string; issuedAt: string | null; expiresAt: string | null; valid: boolean; programSpecific: string | null }[]
  otherPrograms: { title: string; lifecycle: string; stage: string }[]
  /** Τι λείπει από το προφίλ — για να το ζητήσει η αναφορά. */
  gaps: string[]
}

const SME_LABEL: Record<string, string> = { '1': 'Πολύ μικρή', '2': 'Μικρή', '3': 'Μεσαία', '4': 'Μεγάλη' }
const iso = (d: Date | null | undefined) => (d ? d.toISOString().slice(0, 10) : null)

export async function buildCompanyProfile(trdrId: string, now = new Date()): Promise<CompanyProfile> {
  const [t, values, docs, apps, regions] = await Promise.all([
    prisma.trdr.findUniqueOrThrow({
      where: { id: trdrId },
      select: {
        id: true, NAME: true, AFM: true, ADDRESS: true, ZIP: true, CITY: true, appLegalForm: true, foundingDate: true,
        gemiStatus: true, gemiObjective: true, aadeStatus: true, aadeFirmKind: true, regionCode: true,
        appEme: true, appEmployeesYear: true, appEmployeesSource: true,
        appAnnualRevenue: true, appRevenueYear: true, appRevenueSource: true,
        kads: { select: { code: true, description: true, kind: true }, orderBy: [{ kind: 'asc' }, { order: 'asc' }] },
      },
    }),
    prisma.trdrFinancialValue.findMany({
      where: { trdrId, kind: 'SINGLE' },
      select: { fieldKey: true, year: true, value: true, valueText: true, source: true, verified: true },
      orderBy: [{ fieldKey: 'asc' }, { year: 'asc' }],
    }),
    prisma.trdrDossierDocument.findMany({
      where: { trdrId },
      select: { name: true, issuedAt: true, expiresAt: true, documentType: { select: { name: true } }, program: { select: { title: true } }, reusable: true },
      orderBy: { createdAt: 'desc' },
    }),
    prisma.programApplication.findMany({ where: { trdrId }, select: { lifecycle: true, stage: true, program: { select: { title: true } } } }),
    prisma.region.findMany({ select: { code: true, nameEL: true, level: true, parentCode: true } }),
  ])

  // Ετικέτες πεδίων εντύπων (fieldKey → label) από τους Οδηγούς Εντύπων.
  const keys = [...new Set(values.map(v => v.fieldKey))]
  const labelRows = keys.length
    ? await prisma.taxFormTemplateField.findMany({ where: { fieldKey: { in: keys } }, select: { fieldKey: true, label: true } })
    : []
  const labelOf = new Map<string, string>()
  for (const r of labelRows) if (!labelOf.has(r.fieldKey)) labelOf.set(r.fieldKey, r.label)

  const byKey = new Map<string, ProfileSeriesPoint[]>()
  for (const v of values) {
    const arr = byKey.get(v.fieldKey) ?? []
    arr.push({ year: v.year, value: v.value == null ? null : Number(v.value), text: v.valueText, source: v.source, verified: v.verified })
    byKey.set(v.fieldKey, arr)
  }
  const series = [...byKey.entries()].map(([key, points]) => ({ key, label: labelOf.get(key) ?? key, points }))

  const regionMap = new Map<string, RegionNodeLookup>(regions.map(r => [r.code, r]))
  const h = t.regionCode ? deriveHierarchyFromMap(t.regionCode, regionMap) : null

  const smePoints = byKey.get('mme_katigoria') ?? []
  const smeLast = smePoints[smePoints.length - 1]
  const documents = docs.map(d => ({
    type: d.documentType.name,
    name: d.name,
    issuedAt: iso(d.issuedAt),
    expiresAt: iso(d.expiresAt),
    valid: !d.expiresAt || d.expiresAt.getTime() >= now.getTime(),
    programSpecific: !d.reusable && d.program ? d.program.title : null,
  }))

  const profile: CompanyProfile = {
    trdrId: t.id,
    name: t.NAME,
    afm: t.AFM,
    legalForm: t.appLegalForm,
    foundingDate: iso(t.foundingDate),
    operationalYears: yearsSince(t.foundingDate, now),
    gemiStatus: t.gemiStatus,
    aadeStatus: t.aadeStatus,
    aadeFirmKind: t.aadeFirmKind,
    gemiObjective: t.gemiObjective,
    address: [t.ADDRESS, t.ZIP, t.CITY].filter(Boolean).join(', ') || null,
    region: {
      periferia: h?.region?.nameEL ?? null,
      perifereiakiEnotita: h?.regionalUnit?.nameEL ?? null,
      dimos: h?.municipality?.nameEL ?? null,
    },
    kads: t.kads.map(k => ({ code: k.code, description: k.description, primary: k.kind === 'PRIMARY' })),
    headline: {
      eme: t.appEme == null ? null : Number(t.appEme), emeYear: t.appEmployeesYear, emeSource: t.appEmployeesSource,
      revenue: t.appAnnualRevenue == null ? null : Number(t.appAnnualRevenue), revenueYear: t.appRevenueYear, revenueSource: t.appRevenueSource,
      smeCategory: smeLast?.value != null ? (SME_LABEL[String(Math.round(smeLast.value))] ?? null) : null,
    },
    series,
    documents,
    otherPrograms: apps.map(a => ({ title: a.program.title, lifecycle: a.lifecycle, stage: a.stage })),
    gaps: [],
  }

  if (!profile.kads.length) profile.gaps.push('Δεν υπάρχουν ΚΑΔ — συγχρονισμός από ΑΑΔΕ.')
  if (!profile.foundingDate) profile.gaps.push('Λείπει η ημερομηνία ίδρυσης — συγχρονισμός από ΓΕΜΗ.')
  if (!profile.legalForm) profile.gaps.push('Λείπει η νομική μορφή.')
  if (!profile.region.periferia) profile.gaps.push('Λείπει η περιφέρεια (διεύθυνση/ΤΚ).')
  if (profile.headline.eme == null && !byKey.has('eme')) profile.gaps.push('Δεν υπάρχουν ΕΜΕ — ανέβασε ΕΜΕ ή Δήλωση ΜΜΕ.')
  if (profile.headline.revenue == null && !byKey.has('e3_kyklos_ergasion') && !byKey.has('mme_kyklos_ergasion')) profile.gaps.push('Δεν υπάρχει κύκλος εργασιών — ανέβασε Ε3.')
  return profile
}
