'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { createPaymentOrder, refreshPaymentOrderStatus, VivaConfigError } from '@/lib/viva'

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

// ── Δημιουργία πληρωμής ──────────────────────────────────────────────────

const createPaymentSchema = z.object({
  amountCents: z.number().int('Το ποσό πρέπει να είναι ακέραιος αριθμός λεπτών.').positive('Το ποσό πρέπει να είναι μεγαλύτερο από 0.'),
  description: z.string().trim().min(1, 'Η περιγραφή είναι υποχρεωτική.').max(300),
  customerId: z.string().trim().max(60).optional(),
  customerName: z.string().trim().max(200).optional(),
  customerEmail: z.union([z.literal(''), z.email('Μη έγκυρο email.')]).optional(),
  customerPhone: z.string().trim().max(40).optional(),
})

export type CreatePaymentInput = z.infer<typeof createPaymentSchema>

export type CreatePaymentResult =
  | { ok: true; id: string; orderCode: string; checkoutUrl: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

/**
 * «+ Νέα πληρωμή» — δημιουργεί την παραγγελία στο Viva (ενεργό environment)
 * ΚΑΙ το τοπικό PaymentOrder (μέσα στο lib/viva.ts createPaymentOrder, ώστε
 * να μείνουν ατομικά συνδεδεμένα). Λάθη ρύθμισης (VivaConfigError) φτάνουν
 * στον χρήστη ΑΥΤΟΥΣΙΑ — ήδη περιέχουν το «Ρύθμισε το Viva στις Ρυθμίσεις.».
 */
export async function createPayment(input: CreatePaymentInput): Promise<CreatePaymentResult> {
  const session = await requirePermission('payment.manage')
  const parsed = createPaymentSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }

  try {
    const { payment, checkoutUrl } = await createPaymentOrder({
      amountCents: parsed.data.amountCents,
      description: parsed.data.description,
      customerId: parsed.data.customerId || undefined,
      customerName: parsed.data.customerName || undefined,
      customerEmail: parsed.data.customerEmail || undefined,
      customerPhone: parsed.data.customerPhone || undefined,
      createdById: session.user.id,
    })
    revalidatePath('/payments')
    return { ok: true, id: payment.id, orderCode: payment.orderCode, checkoutUrl }
  } catch (err) {
    if (err instanceof VivaConfigError) return { ok: false, message: err.message }
    return {
      ok: false,
      message: err instanceof Error ? `Αποτυχία δημιουργίας πληρωμής: ${err.message}` : 'Άγνωστο σφάλμα κατά τη δημιουργία πληρωμής.',
    }
  }
}

// ── Λοιπές ενέργειες γραμμής ─────────────────────────────────────────────

export type SimpleActionResult = { ok: true; message: string } | { ok: false; message: string }

/** «Έλεγχος κατάστασης» — GET transaction στη Viva (αν υπάρχει ήδη transactionId) + best-effort ενημέρωση. */
export async function refreshPaymentStatus(id: string): Promise<SimpleActionResult> {
  await requirePermission('payment.manage')
  try {
    const { changed, checked } = await refreshPaymentOrderStatus(id)
    revalidatePath('/payments')
    if (!checked) return { ok: true, message: 'Δεν υπάρχει ακόμα συναλλαγή Viva για αυτή την πληρωμή — περίμενε το webhook ή δοκίμασε ξανά αργότερα.' }
    return { ok: true, message: changed ? 'Η κατάσταση ενημερώθηκε.' : 'Ελέγχθηκε — καμία αλλαγή κατάστασης.' }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Αποτυχία ελέγχου κατάστασης.' }
  }
}

/** «Ακύρωση» — ΤΟΠΙΚΗ μόνο (δεν ακυρώνει/επιστρέφει τίποτα στο Viva) — μόνο για πληρωμές ακόμα σε αναμονή. */
export async function cancelPayment(id: string): Promise<SimpleActionResult> {
  await requirePermission('payment.manage')
  const existing = await prisma.paymentOrder.findUnique({ where: { id } })
  if (!existing) return { ok: false, message: 'Η πληρωμή δεν βρέθηκε.' }
  if (existing.status !== 'PENDING') {
    return { ok: false, message: 'Μόνο πληρωμές «Σε αναμονή» μπορούν να ακυρωθούν τοπικά.' }
  }
  await prisma.paymentOrder.update({ where: { id }, data: { status: 'CANCELED' } })
  revalidatePath('/payments')
  return { ok: true, message: 'Η πληρωμή ακυρώθηκε τοπικά (δεν επηρεάζει τίποτα στο Viva).' }
}
