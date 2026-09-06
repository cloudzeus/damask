import { prisma } from '@/lib/prisma'
import type { ProgramCms } from '@/lib/programs/cms'

/**
 * Read-only data για τις ΔΗΜΟΣΙΕΣ σελίδες προγραμμάτων (/programmata). Χωρίς
 * 'use server'/permission — μόνο ACTIVE προγράμματα εκτίθενται. Χρησιμοποιεί το
 * cmsContent (SEO/GEO/AEO από DeepSeek) με fallback στα raw πεδία.
 */

const GR_MAP: Record<string, string> = {
  α: 'a', β: 'v', γ: 'g', δ: 'd', ε: 'e', ζ: 'z', η: 'i', θ: 'th', ι: 'i', κ: 'k', λ: 'l', μ: 'm',
  ν: 'n', ξ: 'x', ο: 'o', π: 'p', ρ: 'r', σ: 's', ς: 's', τ: 't', υ: 'y', φ: 'f', χ: 'ch', ψ: 'ps', ω: 'o',
}

/** Ελληνικά → latin kebab-case slug (SEO). */
export function slugify(input: string): string {
  const noAccents = input.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  let out = ''
  for (const ch of noAccents) out += GR_MAP[ch] ?? ch
  return out
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70) || 'programma'
}

/** Εξασφαλίζει μοναδικό publicSlug για το πρόγραμμα (persist). */
export async function ensureProgramSlug(programId: string, title: string, existing: string | null): Promise<string> {
  if (existing) return existing
  const base = slugify(title)
  let slug = base
  for (let i = 0; i < 20; i++) {
    const clash = await prisma.program.findFirst({ where: { publicSlug: slug, NOT: { id: programId } }, select: { id: true } })
    if (!clash) break
    slug = `${base}-${i + 2}`
  }
  await prisma.program.update({ where: { id: programId }, data: { publicSlug: slug } })
  return slug
}

const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const cmsOf = (v: unknown): ProgramCms | null => (v ?? null) as ProgramCms | null

/** Σύντομη ετικέτα περιφέρειας για badge (όχι ολόκληρη πρόταση από το CMS). */
function shortRegion(cmsRegion: string | undefined | null, regionNames: string[], totalRegions?: number): string | null {
  const n = totalRegions ?? regionNames.length
  // Πολλές περιφέρειες → μάλλον πανελλαδικό (13 περιφέρειες σύνολο).
  if (n >= 8) return 'Όλη η Ελλάδα'
  if (n > 1) return `${n} περιφέρειες`
  if (regionNames.length === 1) return regionNames[0]
  const t = (cmsRegion || '').trim()
  if (!t) return null
  const low = t.toLowerCase()
  if (low.includes('όλ') || low.includes('ολ') || low.includes('πανελλαδικ') || low.includes('επικράτ') || low.includes('ελλάδ')) return 'Όλη η Ελλάδα'
  return t.length <= 32 ? t : 'Όλη η Ελλάδα'
}

/**
 * Ενιαίο «headline» ποσό για κάρτες & summary: ΠΑΝΤΑ το ποσοστό επιχορήγησης ως
 * κύριο νούμερο (συγκρίσιμο μεταξύ προγραμμάτων), και το ποσό/προϋπολογισμό (€)
 * ως δευτερεύουσα σημείωση. Έτσι δεν δείχνει το ένα πρόγραμμα % και το άλλο €.
 */
function headlineAmount(fundingRate: number | null, cms: ProgramCms | null): { amount: string; amountNote: string } {
  const pct = fundingRate != null ? `έως ${fundingRate}%` : null
  const cmsAmount = (cms?.amountDisplay || '').trim()
  const euro = cmsAmount.includes('€') ? cmsAmount : ''
  if (pct) return { amount: pct, amountNote: euro || cms?.amountNote || '' }
  return { amount: cmsAmount || '—', amountNote: cms?.amountNote || '' }
}

export type PublicProgramCard = {
  slug: string
  title: string
  summary: string
  amount: string
  amountNote: string
  deadline: string | null      // ΜΟΝΟ πραγματική ημερομηνία (submissionEnd)
  deadlineOpen: boolean          // χωρίς προθεσμία → badge «Ανοιχτή πρόσκληση»
  region: string | null          // σύντομη ετικέτα για badge
  image: string
  heroTitle: string              // για το hero της αρχικής (πιο πρόσφατο πρόγραμμα)
  heroSubtitle: string
}

// CDN (Media Gallery «WWA — Δημόσιο site») — βλ. app/(public)/_wwa/assets.ts
const WWA_CDN = 'https://damask-1.b-cdn.net/wwa/site'
const FALLBACK_IMAGES = [
  `${WWA_CDN}/photo-manufacturing.webp`, `${WWA_CDN}/photo-startup.webp`, `${WWA_CDN}/photo-hotel.webp`,
  `${WWA_CDN}/photo-ecommerce.webp`, `${WWA_CDN}/photo-cosmetics.webp`, `${WWA_CDN}/photo-consulting.webp`,
]

export async function listPublicPrograms(): Promise<PublicProgramCard[]> {
  const rows = await prisma.program.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { updatedAt: 'desc' },
    select: {
      id: true, title: true, summary: true, publicSlug: true, imageUrl: true, cmsContent: true,
      totalBudget: true, fundingRate: true, submissionEnd: true,
      regions: { select: { name: true }, take: 4 },
      _count: { select: { regions: true } },
    },
    take: 60,
  })
  const out: PublicProgramCard[] = []
  for (let i = 0; i < rows.length; i++) {
    const p = rows[i]
    const cms = cmsOf(p.cmsContent)
    const slug = await ensureProgramSlug(p.id, p.title, p.publicSlug)
    const { amount, amountNote } = headlineAmount(p.fundingRate != null ? Number(p.fundingRate) : null, cms)
    out.push({
      slug,
      title: cms?.cardTitle || p.title,
      summary: cms?.cardSummary || p.summary || '',
      amount,
      amountNote,
      deadline: p.submissionEnd ? dateFmt.format(p.submissionEnd) : null,
      deadlineOpen: !p.submissionEnd,
      region: shortRegion(cms?.regionText, p.regions.map(r => r.name), p._count.regions),
      image: p.imageUrl || FALLBACK_IMAGES[i % FALLBACK_IMAGES.length],
      heroTitle: cms?.heroTitle || p.title,
      heroSubtitle: cms?.heroSubtitle || cms?.cardSummary || p.summary || '',
    })
  }
  return out
}

export type PublicProgramDetail = {
  slug: string
  title: string
  image: string
  cms: ProgramCms | null
  amount: string
  amountNote: string
  deadline: string | null
  deadlineOpen: boolean
  region: string | null
  fundingRate: number | null
  totalBudget: number | null
  durationMonths: number | null
}

export async function getPublicProgramBySlug(slug: string): Promise<PublicProgramDetail | null> {
  const p = await prisma.program.findFirst({
    where: { publicSlug: slug, status: 'ACTIVE' },
    select: {
      id: true, title: true, summary: true, publicSlug: true, imageUrl: true, cmsContent: true,
      totalBudget: true, fundingRate: true, durationMonths: true, submissionEnd: true,
      regions: { select: { name: true }, take: 4 },
      _count: { select: { regions: true } },
    },
  })
  if (!p) return null
  const cms = cmsOf(p.cmsContent)
  const { amount, amountNote } = headlineAmount(p.fundingRate != null ? Number(p.fundingRate) : null, cms)
  return {
    slug: p.publicSlug!,
    title: p.title,
    image: p.imageUrl || FALLBACK_IMAGES[0],
    cms,
    amount,
    amountNote,
    deadline: p.submissionEnd ? dateFmt.format(p.submissionEnd) : null,
    deadlineOpen: !p.submissionEnd,
    region: shortRegion(cms?.regionText, p.regions.map(r => r.name), p._count.regions),
    fundingRate: p.fundingRate != null ? Number(p.fundingRate) : null,
    totalBudget: p.totalBudget != null ? Number(p.totalBudget) : null,
    durationMonths: p.durationMonths,
  }
}

/** Κοινά βήματα διαδικασίας — ίδια για ΟΛΑ τα προγράμματα (όχι ανά πρόγραμμα). */
export const PROGRAM_PROCESS_STEPS: { title: string; description: string }[] = [
  { title: 'Αξιολόγηση επιλεξιμότητας', description: 'Δωρεάν, εντός μίας εργάσιμης. Ελέγχουμε επιχείρηση, ΚΑΔ, μέγεθος, περιοχή και ώριμες δράσεις.' },
  { title: 'Επενδυτικό σχέδιο', description: 'Διαμορφώνουμε προϋπολογισμό, χρονοδιάγραμμα και τεκμηρίωση που μεγιστοποιεί τη βαθμολογία.' },
  { title: 'Υποβολή και αξιολόγηση', description: 'Ηλεκτρονική υποβολή στο ΟΠΣΚΕ, απάντηση σε διευκρινίσεις, παρακολούθηση μέχρι την απόφαση ένταξης.' },
  { title: 'Υλοποίηση και εκταμίευση', description: 'Διαχείριση τροποποιήσεων, πιστοποίηση δαπανών, αίτημα τελικής επαλήθευσης και εκταμίευση.' },
]
