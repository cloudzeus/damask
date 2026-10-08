'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { addLesson, distillTurns, reembedLesson } from '@/lib/thanos/learning'

/** Διαχείριση «γνώσης» του Thanos (μαθήματα) — ΜΟΝΟ Super Admin & Admin. */
const THANOS_ADMIN_ROLES = ['SUPER_ADMIN', 'ADMIN']
async function requireThanosAdmin() {
  const session = await requirePermission('settings.manage')
  if (!THANOS_ADMIN_ROLES.includes(session.user.role)) throw new Error('Μόνο Super Admin / Admin.')
  return session
}

type R = { ok: true; message: string } | { ok: false; message: string }
const done = (message: string): R => { revalidatePath('/settings'); return { ok: true, message } }

export async function setLessonStatus(id: string, status: 'ACTIVE' | 'REJECTED' | 'SUGGESTED'): Promise<R> {
  await requireThanosAdmin()
  if (!['ACTIVE', 'REJECTED', 'SUGGESTED'].includes(status)) return { ok: false, message: 'Μη έγκυρη κατάσταση.' }
  await prisma.thanosLesson.update({ where: { id }, data: { status } })
  return done(status === 'ACTIVE' ? 'Εγκρίθηκε — ο Thanos θα το χρησιμοποιεί.' : status === 'REJECTED' ? 'Απορρίφθηκε.' : 'Σε αναμονή.')
}

export async function updateLesson(id: string, input: { question: string; answer: string }): Promise<R> {
  await requireThanosAdmin()
  const question = input.question.trim(); const answer = input.answer.trim()
  if (question.length < 8 || answer.length < 15) return { ok: false, message: 'Γράψε πλήρη ερώτηση και απάντηση.' }
  await prisma.thanosLesson.update({ where: { id }, data: { question: question.slice(0, 1000), answer: answer.slice(0, 4000) } })
  await reembedLesson(id).catch(() => {})
  return done('Αποθηκεύτηκε.')
}

export async function deleteLesson(id: string): Promise<R> {
  await requireThanosAdmin()
  await prisma.thanosLesson.delete({ where: { id } })
  return done('Διαγράφηκε.')
}

export async function addManualLesson(input: { question: string; answer: string }): Promise<R> {
  await requireThanosAdmin()
  const id = await addLesson({ question: input.question, answer: input.answer, status: 'ACTIVE', source: 'MANUAL' }).catch(err => { throw err })
  return id ? done('Προστέθηκε — ο Thanos το ξέρει πλέον.') : { ok: false, message: 'Υπάρχει ήδη παρόμοιο μάθημα ή το κείμενο είναι πολύ σύντομο.' }
}

export async function distillNow(): Promise<R> {
  await requireThanosAdmin()
  try {
    const r = await distillTurns(120)
    return done(r.turns ? `Διάβασα ${r.turns} συζητήσεις → ${r.lessons} νέα μαθήματα.` : 'Δεν υπάρχουν νέες συζητήσεις για μάθηση.')
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : String(err) }
  }
}
