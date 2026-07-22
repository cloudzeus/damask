'use server'

import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { revalidatePath } from 'next/cache'
import { extractProgramFromText } from '@/lib/programs/extract'
import { persistExtractedProgram } from '@/lib/programs/persist'
import { buildOcrCostViewForSession, type OcrCostView } from '@/lib/ingestion/ocr-cost'

/**
 * Server orchestration για τη διαχείριση Προγραμμάτων Χρηματοδότησης
 * (Task 10): list/create/update/delete Program + upload του πηγαίου PDF
 * στο ιδιωτικό BunnyCDN + AI εξαγωγή δομημένων δεδομένων (extractProgram).
 * Κάθε exported action ΞΕΚΙΝΑΕΙ με requirePermission('programs.manage')
 * (ΠΟΤΕ render-time gating — δες node_modules/next/dist/docs/01-app/02-guides/
 * server-actions.md#security).
 *
 * Task 11 (applications/expenses/AI category suggestion) προστίθεται στο
 * τέλος αυτού του ίδιου module.
 */

export type ProgramListItem = {
  id: string
  title: string
  referenceCode: string | null
  totalBudget: number | null
  fundingRate: number | null
  submissionEnd: string | null
  status: string
  extractStatus: string
}

export async function listPrograms(): Promise<ProgramListItem[]> {
  await requirePermission('programs.manage')
  const rows = await prisma.program.findMany({ orderBy: { updatedAt: 'desc' } })
  return rows.map(r => ({
    id: r.id,
    title: r.title,
    referenceCode: r.referenceCode,
    totalBudget: r.totalBudget != null ? Number(r.totalBudget) : null,
    fundingRate: r.fundingRate != null ? Number(r.fundingRate) : null,
    submissionEnd: r.submissionEnd ? r.submissionEnd.toISOString() : null,
    status: r.status,
    extractStatus: r.extractStatus,
  }))
}

export async function createProgram(input: {
  title: string
  sourceFileName?: string
  pdfBase64?: string
  mimeType?: string
}): Promise<{ id: string }> {
  const session = await requirePermission('programs.manage')
  const id = crypto.randomUUID()

  let storageKey: string | null = null
  let mimeType: string | null = null
  let size: number | null = null

  if (input.pdfBase64) {
    const body = Buffer.from(input.pdfBase64, 'base64')
    mimeType = input.mimeType ?? 'application/pdf'
    storageKey = `programs/${id}/source.pdf`
    await bunnyUploadPrivate({ key: storageKey, body, contentType: mimeType })
    size = body.length
  }

  await prisma.program.create({
    data: {
      id,
      title: input.title.trim(),
      sourceFileName: input.sourceFileName ?? null,
      storageKey,
      mimeType,
      size,
      status: 'DRAFT',
      extractStatus: 'PENDING',
      createdById: session.user.id,
    },
  })
  revalidatePath('/programs')
  return { id }
}

function parseDateOrNull(v: string | null | undefined): Date | null | undefined {
  if (v === undefined) return undefined
  if (v === null) return null
  const d = new Date(v)
  return Number.isNaN(d.getTime()) ? null : d
}

export async function updateProgramMeta(
  id: string,
  input: {
    title?: string
    summary?: string | null
    referenceCode?: string | null
    totalBudget?: number | null
    fundingRate?: number | null
    durationMonths?: number | null
    submissionStart?: string | null
    submissionEnd?: string | null
    publicationDate?: string | null
    minEmployeesFte?: number | null
    minOperationalYears?: number | null
    eligibilityNote?: string | null
    status?: 'DRAFT' | 'ACTIVE' | 'CLOSED'
    notes?: string | null
  },
): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.program.update({
    where: { id },
    data: {
      ...(input.title !== undefined ? { title: input.title.trim() } : {}),
      ...(input.summary !== undefined ? { summary: input.summary } : {}),
      ...(input.referenceCode !== undefined ? { referenceCode: input.referenceCode } : {}),
      ...(input.totalBudget !== undefined ? { totalBudget: input.totalBudget } : {}),
      ...(input.fundingRate !== undefined ? { fundingRate: input.fundingRate } : {}),
      ...(input.durationMonths !== undefined ? { durationMonths: input.durationMonths } : {}),
      ...(input.submissionStart !== undefined ? { submissionStart: parseDateOrNull(input.submissionStart) } : {}),
      ...(input.submissionEnd !== undefined ? { submissionEnd: parseDateOrNull(input.submissionEnd) } : {}),
      ...(input.publicationDate !== undefined ? { publicationDate: parseDateOrNull(input.publicationDate) } : {}),
      ...(input.minEmployeesFte !== undefined ? { minEmployeesFte: input.minEmployeesFte } : {}),
      ...(input.minOperationalYears !== undefined ? { minOperationalYears: input.minOperationalYears } : {}),
      ...(input.eligibilityNote !== undefined ? { eligibilityNote: input.eligibilityNote } : {}),
      ...(input.status ? { status: input.status } : {}),
      ...(input.notes !== undefined ? { notes: input.notes } : {}),
    },
  })
  revalidatePath(`/programs/${id}`)
}

export async function deleteProgram(id: string): Promise<void> {
  await requirePermission('programs.manage')
  await prisma.program.delete({ where: { id } })
  revalidatePath('/programs')
}

export async function extractProgram(programId: string, text: string): Promise<{ ok: boolean; cost: OcrCostView | null; error?: string }> {
  const session = await requirePermission('programs.manage')
  await prisma.program.update({ where: { id: programId }, data: { extractStatus: 'RUNNING' } })

  try {
    const r = await extractProgramFromText(text, { refId: programId, userId: session.user.id })
    await persistExtractedProgram(programId, r.data)
    await prisma.program.update({
      where: { id: programId },
      data: { model: r.model, extractedData: r.data as Prisma.InputJsonValue },
    })
    const cost = await buildOcrCostViewForSession(session.user.role, r.model, r.tokensUsed)
    revalidatePath(`/programs/${programId}`)
    return { ok: true, cost }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Άγνωστο σφάλμα εξαγωγής'
    await prisma.program.update({
      where: { id: programId },
      data: { extractStatus: 'FAILED', errorMessage: `Η εξαγωγή απέτυχε: ${message}` },
    })
    revalidatePath(`/programs/${programId}`)
    return { ok: false, cost: null, error: message }
  }
}
