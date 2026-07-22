'use server'

import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { revalidatePath } from 'next/cache'

/**
 * Server orchestration για την authoring πλευρά των Tax Form Templates:
 * list/create/update/delete templates + upload του κενού δείγματος (sample)
 * στο ιδιωτικό BunnyCDN. Κάθε exported action ΞΕΚΙΝΑΕΙ με requirePermission
 * (ΠΟΤΕ render-time gating). `listReadyTemplates` πυλωρείται με `taxform.scan`
 * (χαμηλότερο δικαίωμα) — προορίζεται για το dialog σάρωσης πελάτη.
 */

export type TemplateListItem = {
  id: string
  code: string
  name: string
  year: number | null
  description: string | null
  status: string
  fieldCount: number
}

export async function listTemplates(): Promise<TemplateListItem[]> {
  await requirePermission('taxform.manage')
  const rows = await prisma.taxFormTemplate.findMany({
    orderBy: { updatedAt: 'desc' },
    include: { _count: { select: { fields: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    code: r.code,
    name: r.name,
    year: r.year,
    description: r.description,
    status: r.status,
    fieldCount: r._count.fields,
  }))
}

export async function listReadyTemplates(): Promise<{ id: string; code: string; name: string; year: number | null }[]> {
  await requirePermission('taxform.scan')
  const rows = await prisma.taxFormTemplate.findMany({
    where: { status: 'READY' },
    orderBy: { name: 'asc' },
    select: { id: true, code: true, name: true, year: true },
  })
  return rows
}

export async function createTemplate(input: { code: string; name: string; year?: number | null; description?: string | null }): Promise<{ id: string }> {
  const session = await requirePermission('taxform.manage')
  const t = await prisma.taxFormTemplate.create({
    data: {
      code: input.code.trim(),
      name: input.name.trim(),
      year: input.year ?? null,
      description: input.description?.trim() || null,
      status: 'DRAFT',
      createdById: session.user.id,
    },
  })
  revalidatePath('/tax-templates')
  return { id: t.id }
}

export async function updateTemplateMeta(
  id: string,
  input: { name?: string; year?: number | null; description?: string | null; status?: 'DRAFT' | 'READY' },
): Promise<void> {
  await requirePermission('taxform.manage')
  await prisma.taxFormTemplate.update({
    where: { id },
    data: {
      ...(input.name != null ? { name: input.name.trim() } : {}),
      ...(input.year !== undefined ? { year: input.year } : {}),
      ...(input.description !== undefined ? { description: input.description?.trim() || null } : {}),
      ...(input.status ? { status: input.status } : {}),
    },
  })
  revalidatePath(`/tax-templates/${id}`)
}

export async function deleteTemplate(id: string): Promise<void> {
  await requirePermission('taxform.manage')
  await prisma.taxFormTemplate.delete({ where: { id } })
  revalidatePath('/tax-templates')
}

export async function uploadSample(
  templateId: string,
  input: { base64: string; mimeType: string; ext: string; pageCount: number; thumbUrl?: string | null },
): Promise<{ storageKey: string }> {
  await requirePermission('taxform.manage')
  const key = `tax-templates/${templateId}/sample.${input.ext}`
  await bunnyUploadPrivate({ key, body: Buffer.from(input.base64, 'base64'), contentType: input.mimeType })
  await prisma.taxFormTemplate.update({
    where: { id: templateId },
    data: { sampleStorageKey: key, samplePageCount: input.pageCount, sampleThumbUrl: input.thumbUrl ?? null },
  })
  revalidatePath(`/tax-templates/${templateId}`)
  return { storageKey: key }
}
