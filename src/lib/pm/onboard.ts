'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { aadeLookup, AadeLookupError } from '@/lib/aade'
import { ensureTrdrCdnFolder } from '@/lib/trdr/cdn-folder'
import { logActivity } from '@/lib/activity/log'
import { createApplication } from '@/lib/programs/actions'
import { waivePreApprovalSteps } from '@/lib/pm/onboard-core'

/**
 * «Έργο σε εξέλιξη»: εισαγωγή πελατών ενός προγράμματος που έχει ΗΔΗ εγκεκριμένες προτάσεις (εκτός συστήματος).
 * Για κάθε πελάτη: έργο + εγκεκριμένη υποβολή (ΟΠΣΚΕ/ποσό/ημ. έγκρισης) + κύκλος «Υλοποίηση»· τα βήματα πριν την
 * έγκριση σημειώνονται «απαλλαγή» και η δουλειά συνεχίζει από τα δικαιολογητικά που χρειάζονται ακόμη και μετά
 * από τις δαπάνες (αγορές → αποπληρωμή → ολοκλήρωση).
 */

const CUSTOMER_SODTYPE = 13
const PRE_APPROVAL_PHASES = new Set(['ASSESSMENT', 'SUBMISSION'])

export type OnboardForm = { id: string; name: string; phase: string | null; mandatory: boolean; neededNow: boolean }
export type OnboardCustomer = { id: string; name: string; afm: string | null; existingStage: string | null }

/** Τα δικαιολογητικά του προγράμματος + πρόταση «χρειάζεται ακόμη;» (όσα ανήκουν σε φάση πριν την έγκριση: όχι). */
export async function getOnboardForms(programId: string): Promise<OnboardForm[]> {
  await requirePermission('programs.manage')
  const forms = await prisma.programRequiredForm.findMany({
    where: { programId }, orderBy: [{ order: 'asc' }, { name: 'asc' }],
    select: { id: true, name: true, phase: true, mandatory: true },
  })
  return forms.map(f => ({ ...f, neededNow: f.mandatory && !(f.phase && PRE_APPROVAL_PHASES.has(f.phase)) }))
}

/** Αναζήτηση πελατών με επωνυμία/ΑΦΜ (+ αν έχουν ήδη έργο στο πρόγραμμα). */
export async function searchOnboardCustomers(programId: string, query: string): Promise<OnboardCustomer[]> {
  await requirePermission('programs.manage')
  const q = query.trim()
  if (q.length < 2) return []
  const digits = q.replace(/\D/g, '')
  const rows = await prisma.trdr.findMany({
    where: { SODTYPE: CUSTOMER_SODTYPE, OR: [{ NAME: { contains: q, mode: 'insensitive' } }, ...(digits.length >= 3 ? [{ AFM: { contains: digits } }] : [])] },
    orderBy: { NAME: 'asc' }, take: 15,
    select: { id: true, NAME: true, AFM: true, programApplications: { where: { programId }, select: { stage: true } } },
  })
  return rows.map(r => ({ id: r.id, name: r.NAME, afm: r.AFM, existingStage: r.programApplications[0]?.stage ?? null }))
}

/** Πελάτης μόνο με ΑΦΜ: υπάρχων ή νέος από την ΑΑΔΕ (όλα τα στοιχεία). */
export async function findOrCreateCustomerByAfm(programId: string, afm: string): Promise<{ ok: true; customer: OnboardCustomer; created: boolean } | { ok: false; message: string }> {
  await requirePermission('programs.manage')
  const clean = afm.replace(/\D/g, '').slice(0, 9)
  if (clean.length !== 9) return { ok: false, message: 'Μη έγκυρο ΑΦΜ (9 ψηφία).' }
  const existing = await prisma.trdr.findFirst({
    where: { AFM: clean, SODTYPE: CUSTOMER_SODTYPE },
    select: { id: true, NAME: true, AFM: true, programApplications: { where: { programId }, select: { stage: true } } },
  })
  if (existing) return { ok: true, created: false, customer: { id: existing.id, name: existing.NAME, afm: existing.AFM, existingStage: existing.programApplications[0]?.stage ?? null } }
  let name = `ΑΦΜ ${clean}`
  let extra: { ADDRESS?: string; ZIP?: string; CITY?: string; appLegalForm?: string } = {}
  try {
    const c = await aadeLookup(clean)
    if (c) { name = c.name || name; extra = { ADDRESS: c.address ?? undefined, ZIP: c.zip ?? undefined, CITY: c.city ?? undefined, appLegalForm: c.legalForm ?? undefined } }
  } catch (err) {
    if (err instanceof AadeLookupError) return { ok: false, message: err.message }
  }
  const created = await prisma.trdr.create({ data: { NAME: name, AFM: clean, SODTYPE: CUSTOMER_SODTYPE, ISPROSP: 0, ...extra }, select: { id: true, NAME: true, AFM: true } })
  await ensureTrdrCdnFolder(created.id).catch(() => {})
  // Γεωκωδικοποίηση + περιφέρεια + δυνητικά προγράμματα (παρασκήνιο).
  void import('@/lib/trdr/derive').then(d => d.enqueueTrdrDerive(created.id))
  return { ok: true, created: true, customer: { id: created.id, name: created.NAME, afm: created.AFM, existingStage: null } }
}

export type OnboardItem = { trdrId: string; opskeRef: string | null; approvedBudget: number | null; publicSubsidy: number | null; approvedAt: string | null }
export type OnboardResult = { trdrId: string; name: string; applicationId: string | null; stage: string | null; pendingForms: number; message: string | null }

export async function onboardApprovedApplications(input: {
  programId: string
  items: OnboardItem[]
  /** Δικαιολογητικά του προγράμματος που ΔΕΝ χρειάζονται πια (υποβλήθηκαν πριν την εισαγωγή). */
  doneFormIds: string[]
}): Promise<OnboardResult[]> {
  const session = await requirePermission('programs.manage')
  const program = await prisma.program.findUnique({ where: { id: input.programId }, select: { id: true, title: true } })
  if (!program) throw new Error('Το πρόγραμμα δεν βρέθηκε.')
  const doneForms = new Set(input.doneFormIds)
  const out: OnboardResult[] = []

  for (const item of input.items) {
    const trdr = await prisma.trdr.findUnique({ where: { id: item.trdrId }, select: { id: true, NAME: true } })
    if (!trdr) { out.push({ trdrId: item.trdrId, name: '—', applicationId: null, stage: null, pendingForms: 0, message: 'Ο πελάτης δεν βρέθηκε.' }); continue }
    try {
      const approvedAt = item.approvedAt && !Number.isNaN(Date.parse(item.approvedAt)) ? new Date(item.approvedAt) : new Date()
      // 1. Έργο (ίδια ροή με κάθε ένταξη: φάκελος, βήματα, δικαιολογητικά από την αποθήκη, παραδοτέα).
      await prisma.programApplication.updateMany({ where: { trdrId: trdr.id, programId: program.id }, data: { onboardedAt: approvedAt } })
      const existed = await prisma.programApplication.findUnique({ where: { trdrId_programId: { trdrId: trdr.id, programId: program.id } }, select: { id: true } })
      if (!existed) {
        await prisma.programApplication.create({ data: { trdrId: trdr.id, programId: program.id, onboardedAt: approvedAt, createdById: session.user.id } })
      }
      const { id: applicationId } = await createApplication({ trdrId: trdr.id, programId: program.id })
      const { seedFormObligationsForApplication } = await import('@/lib/pm/form-obligations')
      await seedFormObligationsForApplication(applicationId, program.id).catch(() => null)

      // 2. Εγκεκριμένη υποβολή (αν δεν υπάρχει ήδη).
      if (!(await prisma.proposalSubmission.findFirst({ where: { applicationId, status: 'APPROVED' }, select: { id: true } }))) {
        const last = await prisma.proposalSubmission.findFirst({ where: { applicationId }, orderBy: { version: 'desc' }, select: { version: true } })
        const fmt = (n: number) => n.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
        await prisma.proposalSubmission.create({
          data: {
            applicationId, version: (last?.version ?? 0) + 1, status: 'APPROVED',
            opskeRef: item.opskeRef?.trim() || null,
            totalAmount: item.approvedBudget ?? null,
            submittedAt: approvedAt, decidedAt: approvedAt, decidedById: session.user.id, createdById: session.user.id,
            note: ['Εισαγωγή έργου σε εξέλιξη — η πρόταση εγκρίθηκε πριν την καταχώριση στο σύστημα.', item.publicSubsidy != null ? `Δημόσια δαπάνη (ενίσχυση): ${fmt(item.publicSubsidy)} €.` : null].filter(Boolean).join(' '),
          },
        })
      }

      // 3. Δικαιολογητικά που υποβλήθηκαν ήδη → απαλλαγή· βήματα πριν την έγκριση → απαλλαγή.
      if (doneForms.size) {
        await prisma.applicationObligation.updateMany({
          where: { applicationId, kind: 'FORM', sourceId: { in: [...doneForms] }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
          data: { status: 'WAIVED' },
        })
      }
      await waivePreApprovalSteps(applicationId)

      // 4. Σημείο εκκίνησης: δικαιολογητικά (αν εκκρεμούν υποχρεωτικά) αλλιώς υλοποίηση.
      const pendingForms = await prisma.applicationObligation.count({ where: { applicationId, kind: 'FORM', mandatory: true, status: { notIn: ['APPROVED', 'WAIVED'] } } })
      const stage = pendingForms > 0 ? 'DOCUMENTS' : 'INSPECTION'
      await prisma.programApplication.update({
        where: { id: applicationId },
        data: {
          stage, lifecycle: 'IMPLEMENTATION', assessmentVerdict: 'ELIGIBLE', onboardedAt: approvedAt,
          opskeRef: item.opskeRef?.trim() || undefined, opskeStatus: 'Εγκρίθηκε', opskeSubmittedAt: approvedAt,
        },
      })
      await logActivity('application.onboard', { entityType: 'application', entityId: applicationId, userId: session.user.id, meta: { programId: program.id, stage } })
      revalidatePath(`/programs/${program.id}/applications/${applicationId}`)
      revalidatePath(`/partners/${trdr.id}`)
      out.push({ trdrId: trdr.id, name: trdr.NAME, applicationId, stage, pendingForms, message: null })
    } catch (err) {
      console.error('[onboard] failed', trdr.id, err)
      out.push({ trdrId: trdr.id, name: trdr.NAME, applicationId: null, stage: null, pendingForms: 0, message: 'Η εισαγωγή απέτυχε — δοκιμάστε ξανά ή επικοινωνήστε με τον διαχειριστή.' })
    }
  }
  revalidatePath('/pm')
  revalidatePath(`/programs/${program.id}`)
  return out
}

/** Προγράμματα για επιλογή στον οδηγό (όταν ανοίγει από τα Έργα). */
export async function listOnboardPrograms(): Promise<{ id: string; title: string }[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.program.findMany({ orderBy: { updatedAt: 'desc' }, take: 300, select: { id: true, title: true, cmsContent: true } })
  return rows.map(r => ({ id: r.id, title: (r.cmsContent as { cardTitle?: string } | null)?.cardTitle || r.title }))
}
