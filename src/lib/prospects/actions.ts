'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { revalidatePath } from 'next/cache'
import { newToken } from '@/lib/pm/portal-token'
import { sendMail, isMailerConfigured } from '@/lib/mailer'
import { newsletterHtml, newsletterSubject, type NewsletterProgram } from '@/lib/prospects/newsletter-template'
import { createApplication } from '@/lib/programs/actions'
import { logActivity } from '@/lib/activity/log'
import { deriveHierarchyFromMap, type RegionNodeLookup } from '@/lib/registries/regions-tree'
import {
  evaluateTrdrEligibility,
  type EligibilityCriterionKey,
  type KadRule,
  type SelectedCriteria,
} from '@/lib/prospects/eligibility'

/**
 * Server orchestration for W3 «Δυνητικοί πελάτες» (bulk eligibility matching
 * over Trdr + newsletter send + leads list + opportunity conversion). Every
 * exported action here starts with requirePermission('programs.manage') —
 * see docs/superpowers/specs/2026-07-23-prospects-w3-design.md §6 (no new
 * permission — reuses the existing Programs gate). The public click-recording
 * path (token-only, NO permission gate) lives in a separate module —
 * src/lib/prospects/click.ts — so it can never accidentally inherit this
 * file's 'use server' + permission-gated action surface.
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

const VALID_KAD_RULES = new Set<KadRule>(['ALL_EXCEPT_LISTED', 'ONLY_LISTED', 'MIXED', 'UNSPECIFIED'])

/**
 * `kadRule` has no dedicated Program column — it only lives inside the
 * `extractedData` JSON blob written by extractProgram (same read-only
 * decode idiom as src/app/(app)/programs/[id]/page.tsx#extractKadRule,
 * ported here because that page's helper isn't exported and returns the
 * looser `string | null` instead of the `KadRule` union the eligibility
 * engine expects).
 */
function extractKadRule(extractedData: unknown): KadRule {
  if (extractedData && typeof extractedData === 'object' && 'kadRule' in extractedData) {
    const v = (extractedData as Record<string, unknown>).kadRule
    if (typeof v === 'string' && VALID_KAD_RULES.has(v as KadRule)) return v as KadRule
  }
  return 'UNSPECIFIED'
}

export type ProspectRow = {
  trdrId: string
  name: string
  email: string | null
  eligible: boolean
  matched: EligibilityCriterionKey[]
  failed: EligibilityCriterionKey[]
  /** Οι ΚΑΔ του πελάτη που ταίριαξαν με το πρόγραμμα (εμφανίζονται ανά γραμμή). */
  matchedKads: string[]
  /** Υποσύνολο των matchedKads που είναι ο ΚΥΡΙΟΣ (PRIMARY) ΚΑΔ του πελάτη — highlight. */
  matchedPrimaryKads: string[]
}

/**
 * Bulk-evaluate every active customer Trdr (ISACTIVE=1, SODTYPE=13) against
 * a Program's eligibility data, restricted to the caller-selected criteria.
 * Returns ALL Trdrs (eligible and not) — the client filters/displays.
 *
 * Perf: two batch queries regardless of Trdr count — the Trdr batch (with
 * its kads relation) and a single one-shot load of the full Region table
 * (415 rows) used as an in-memory map for the level-3 (Περιφέρεια) climb
 * (deriveHierarchyFromMap, pure — see regions-tree.ts), instead of the
 * per-code deriveHierarchy() DB walk in regions.ts which would be N extra
 * queries per Trdr.
 */
export async function findProspects(programId: string, selected: SelectedCriteria): Promise<ProspectRow[]> {
  await requirePermission('programs.manage')

  const program = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: {
      extractedData: true,
      kads: { select: { code: true } },
      regions: { select: { name: true } },
      legalForms: { select: { name: true } },
    },
  })

  const programInput = {
    kadRule: extractKadRule(program.extractedData),
    // DAMASK ProgramKad has no `excluded` column (unlike the reference PIM) —
    // every listed code is treated as non-excluded; see task brief.
    kads: program.kads.map(k => ({ code: k.code, excluded: false })),
    regionNames: program.regions.map(r => r.name),
    legalFormNames: program.legalForms.map(f => f.name),
  }

  const [trdrs, regions] = await Promise.all([
    prisma.trdr.findMany({
      where: { ISACTIVE: 1, SODTYPE: 13 },
      select: {
        id: true,
        NAME: true,
        EMAIL: true,
        appLegalForm: true,
        regionCode: true,
        kads: { select: { code: true, kind: true } },
      },
    }),
    prisma.region.findMany({ select: { code: true, nameEL: true, level: true, parentCode: true } }),
  ])

  const regionMap = new Map<string, RegionNodeLookup>(regions.map(r => [r.code, r]))

  return trdrs.map(t => {
    const regionName = t.regionCode
      ? (deriveHierarchyFromMap(t.regionCode, regionMap).region?.nameEL ?? null)
      : null
    const result = evaluateTrdrEligibility(
      { trdrCodes: t.kads.map(k => k.code), legalForm: t.appLegalForm, regionName },
      programInput,
      selected,
    )
    const primaryCodes = new Set(t.kads.filter(k => k.kind === 'PRIMARY').map(k => k.code))
    return {
      trdrId: t.id,
      name: t.NAME,
      email: t.EMAIL,
      eligible: result.eligible,
      matched: result.matched,
      failed: result.failed,
      matchedKads: result.matchedKads,
      matchedPrimaryKads: result.matchedKads.filter(c => primaryCodes.has(c)),
    }
  })
}

export type SendNewsletterResult = { sent: number; skipped: number; failed: number }

/**
 * Πεδία προγράμματος που τροφοδοτούν το marketing template + μετατροπή των
 * Prisma Decimal σε number. ΙΔΙΟ select/mapping για κανονική και δοκιμαστική
 * αποστολή ώστε το preview να μην αποκλίνει ποτέ.
 */
const NEWSLETTER_PROGRAM_SELECT = {
  title: true, summary: true, referenceCode: true, submissionEnd: true,
  fundingRate: true, totalBudget: true, durationMonths: true,
} as const

function toNewsletterProgram(p: {
  title: string; summary: string | null; referenceCode: string | null; submissionEnd: Date | null
  fundingRate: unknown; totalBudget: unknown; durationMonths: number | null
}): NewsletterProgram {
  return {
    title: p.title,
    summary: p.summary,
    referenceCode: p.referenceCode,
    submissionEnd: p.submissionEnd,
    fundingRate: p.fundingRate == null ? null : Number(p.fundingRate),
    totalBudget: p.totalBudget == null ? null : Number(p.totalBudget),
    durationMonths: p.durationMonths,
  }
}

export type SendNewsletterTestResult = { ok: boolean; message: string }

/**
 * Δοκιμαστική αποστολή (preview) του newsletter σε διεύθυνση που δίνει ο
 * χειριστής — ΙΔΙΟ template με την κανονική αποστολή, με [ΔΟΚΙΜΗ] στο θέμα
 * και δείγμα επωνυμίας παραλήπτη. ΔΕΝ δημιουργεί ProgramLead — ο σύνδεσμος
 * εκδήλωσης ενδιαφέροντος έχει τη μορφή του κανονικού αλλά δεν είναι ενεργός.
 */
export async function sendProgramNewsletterTest(programId: string, email: string): Promise<SendNewsletterTestResult> {
  await requirePermission('programs.manage')

  const clean = email.trim()
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) {
    return { ok: false, message: 'Μη έγκυρη διεύθυνση email.' }
  }
  if (!(await isMailerConfigured())) {
    return { ok: false, message: 'Ο mailer (Mailgun) δεν έχει ρυθμιστεί — Ρυθμίσεις → Διασυνδέσεις.' }
  }

  const dbProgram = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: NEWSLETTER_PROGRAM_SELECT,
  })
  const program = toNewsletterProgram(dbProgram)

  const { raw } = newToken() // δεν αποθηκεύεται πουθενά — ο σύνδεσμος του test δεν κάνει match σε lead
  const html = newsletterHtml('Δείγμα Επωνυμίας Α.Ε.', program, `${APP_URL}/go/${raw}`)

  const result = await sendMail({
    to: clean,
    subject: `[ΔΟΚΙΜΗ] ${newsletterSubject(program)}`,
    html,
    refType: 'program-newsletter-test',
    refId: programId,
  })

  return result.ok
    ? { ok: true, message: `Το δοκιμαστικό στάλθηκε στο ${clean}.` }
    : { ok: false, message: 'Η αποστολή του δοκιμαστικού απέτυχε — έλεγξε τις ρυθμίσεις Mailgun.' }
}

/**
 * Send a personalized «Ενημέρωση προγράμματος» email to each selected Trdr,
 * tracked via a per-recipient ProgramLead + magic click link (/go/[token]).
 * Mailer-gated: if Mailgun isn't configured, this is a pure no-op (every
 * recipient counts as skipped, nothing is queried/written). Per-recipient
 * try/catch — one bad address or a Mailgun error never aborts the batch.
 */
export async function sendProgramNewsletter(programId: string, trdrIds: string[]): Promise<SendNewsletterResult> {
  await requirePermission('programs.manage')

  if (!(await isMailerConfigured())) {
    return { sent: 0, skipped: trdrIds.length, failed: 0 }
  }

  const dbProgram = await prisma.program.findUniqueOrThrow({
    where: { id: programId },
    select: NEWSLETTER_PROGRAM_SELECT,
  })
  const program = toNewsletterProgram(dbProgram)
  const trdrs = await prisma.trdr.findMany({
    where: { id: { in: trdrIds } },
    select: { id: true, NAME: true, EMAIL: true },
  })

  let sent = 0
  let skipped = 0
  let failed = 0

  for (const trdr of trdrs) {
    if (!trdr.EMAIL) {
      skipped++
      continue
    }
    try {
      const { raw, hash } = newToken()
      await prisma.programLead.upsert({
        where: { programId_trdrId: { programId, trdrId: trdr.id } },
        create: { programId, trdrId: trdr.id, email: trdr.EMAIL, tokenHash: hash, status: 'SENT', sentAt: new Date() },
        update: { email: trdr.EMAIL, tokenHash: hash, status: 'SENT', sentAt: new Date() },
      })

      const html = newsletterHtml(trdr.NAME, program, `${APP_URL}/go/${raw}`)

      const result = await sendMail({
        to: trdr.EMAIL,
        subject: newsletterSubject(program),
        html,
        refType: 'program-newsletter',
        refId: programId,
      })

      if (result.ok) {
        sent++
      } else {
        failed++
        await prisma.programLead
          .update({ where: { programId_trdrId: { programId, trdrId: trdr.id } }, data: { status: 'FAILED' } })
          .catch(() => {})
      }
    } catch (err) {
      console.error(`sendProgramNewsletter: αποτυχία αποστολής σε trdr ${trdr.id}`, err)
      failed++
      await prisma.programLead
        .update({ where: { programId_trdrId: { programId, trdrId: trdr.id } }, data: { status: 'FAILED' } })
        .catch(() => {})
    }
  }

  await logActivity('newsletter.send', { entityType: 'program', entityId: programId, meta: { sent, skipped, failed } })
  revalidatePath(`/programs/${programId}`)
  return { sent, skipped, failed }
}

/**
 * Αποθήκευση δυνητικών πελατών ΧΩΡΙΣ αποστολή email (status SAVED). Το email δεν
 * είναι υποχρεωτικό. Δεν υποβαθμίζει υπάρχοντα leads (SENT/CLICKED) — μόνο
 * δημιουργεί νέα SAVED εγγραφή όπου δεν υπάρχει.
 */
export async function saveProgramLeads(programId: string, trdrIds: string[]): Promise<{ saved: number }> {
  await requirePermission('programs.manage')
  const trdrs = await prisma.trdr.findMany({ where: { id: { in: trdrIds } }, select: { id: true, EMAIL: true } })
  let saved = 0
  for (const trdr of trdrs) {
    await prisma.programLead.upsert({
      where: { programId_trdrId: { programId, trdrId: trdr.id } },
      create: { programId, trdrId: trdr.id, email: trdr.EMAIL, status: 'SAVED' },
      update: {}, // αν υπάρχει ήδη (π.χ. SENT), μην το αγγίξεις
    })
    saved++
  }
  await logActivity('prospect.save', { entityType: 'program', entityId: programId, meta: { saved } })
  revalidatePath(`/programs/${programId}`)
  return { saved }
}

export type ProgramLeadRow = {
  id: string
  trdrId: string
  name: string
  email: string | null
  status: string
  sentAt: string | null
  clickedAt: string | null
}

/** Ordered: clicked leads first (most recent click), then by most recent send. */
export async function listProgramLeads(programId: string): Promise<ProgramLeadRow[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.programLead.findMany({
    where: { programId },
    include: { trdr: { select: { NAME: true } } },
    orderBy: [{ clickedAt: { sort: 'desc', nulls: 'last' } }, { sentAt: 'desc' }],
  })
  return rows.map(r => ({
    id: r.id,
    trdrId: r.trdrId,
    name: r.trdr.NAME,
    email: r.email,
    status: r.status,
    sentAt: r.sentAt ? r.sentAt.toISOString() : null,
    clickedAt: r.clickedAt ? r.clickedAt.toISOString() : null,
  }))
}

/**
 * A CLICKED lead = εκδήλωση ενδιαφέροντος (opportunity) → enroll into the
 * program via the existing createApplication (already gated itself with
 * programs.manage — we gate here too so this action's contract is
 * self-sufficient regardless of the callee's internals).
 */
export async function createOpportunityApplication(leadId: string): Promise<{ applicationId: string }> {
  await requirePermission('programs.manage')
  const lead = await prisma.programLead.findUniqueOrThrow({
    where: { id: leadId },
    select: { trdrId: true, programId: true },
  })
  const app = await createApplication({ trdrId: lead.trdrId, programId: lead.programId })
  return { applicationId: app.id }
}
