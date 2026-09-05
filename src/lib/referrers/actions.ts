'use server'

import { revalidatePath } from 'next/cache'
import { ReferrerType } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'

/**
 * Server actions για τους «Συστήστες» (Referrers) — ποιος έφερε έναν πελάτη.
 * Gating: 'referrer.view' για αναγνώσεις, 'referrer.manage' για κάθε mutation.
 * Ο συστήστης μπορεί να είναι εταιρία/συνεργάτης (COMPANY) ή ιδιώτης
 * (INDIVIDUAL) και προαιρετικά συνδέεται με υπάρχοντα Trdr (trdrId).
 */

export type ReferrerRow = {
  id: string
  name: string
  type: ReferrerType
  email: string | null
  phone: string | null
  afm: string | null
  notes: string | null
  active: boolean
  trdrId: string | null
  referredCount: number
}

export type ReferrerInput = {
  name: string
  type: ReferrerType
  email?: string | null
  phone?: string | null
  afm?: string | null
  notes?: string | null
  active?: boolean
  trdrId?: string | null
}

const s = (v: string | null | undefined): string | null => {
  const t = (v ?? '').trim()
  return t === '' ? null : t
}

export async function listReferrers(): Promise<ReferrerRow[]> {
  await requirePermission('referrer.view')
  const rows = await prisma.referrer.findMany({
    orderBy: [{ active: 'desc' }, { name: 'asc' }],
    include: { _count: { select: { referred: true } } },
  })
  return rows.map(r => ({
    id: r.id,
    name: r.name,
    type: r.type,
    email: r.email,
    phone: r.phone,
    afm: r.afm,
    notes: r.notes,
    active: r.active,
    trdrId: r.trdrId,
    referredCount: r._count.referred,
  }))
}

/** Ενεργοί συστήστες ως {value,label} για το searchable combobox στην καρτέλα πελάτη. */
export async function getReferrerOptions(): Promise<{ value: string; label: string }[]> {
  await requirePermission('referrer.view')
  const rows = await prisma.referrer.findMany({
    where: { active: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, type: true },
  })
  return rows.map(r => ({
    value: r.id,
    label: `${r.name} · ${r.type === 'COMPANY' ? 'Εταιρία' : 'Ιδιώτης'}`,
  }))
}

export async function createReferrer(input: ReferrerInput): Promise<{ id: string }> {
  await requirePermission('referrer.manage')
  const name = s(input.name)
  if (!name) throw new Error('Το όνομα του συστήστη είναι υποχρεωτικό.')
  const created = await prisma.referrer.create({
    data: {
      name,
      type: input.type,
      email: s(input.email),
      phone: s(input.phone),
      afm: s(input.afm),
      notes: s(input.notes),
      active: input.active ?? true,
      trdrId: s(input.trdrId),
    },
    select: { id: true },
  })
  revalidatePath('/referrers')
  return { id: created.id }
}

export async function updateReferrer(id: string, input: ReferrerInput): Promise<void> {
  await requirePermission('referrer.manage')
  const name = s(input.name)
  if (!name) throw new Error('Το όνομα του συστήστη είναι υποχρεωτικό.')
  await prisma.referrer.update({
    where: { id },
    data: {
      name,
      type: input.type,
      email: s(input.email),
      phone: s(input.phone),
      afm: s(input.afm),
      notes: s(input.notes),
      ...(input.active !== undefined ? { active: input.active } : {}),
      trdrId: s(input.trdrId),
    },
  })
  revalidatePath('/referrers')
}

export async function deleteReferrer(id: string): Promise<void> {
  await requirePermission('referrer.manage')
  // onDelete: SetNull στο Trdr.referrerId — οι πελάτες δεν χάνονται, απλώς
  // αποσυνδέονται από τον διαγραμμένο συστήστη.
  await prisma.referrer.delete({ where: { id } })
  revalidatePath('/referrers')
}
