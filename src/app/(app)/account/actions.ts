'use server'

import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { auth } from '@/auth'
import { prisma } from '@/lib/prisma'

/**
 * «Ο λογαριασμός μου» — ο συνδεδεμένος χρήστης αλλάζει ΜΟΝΟ τα δικά του στοιχεία
 * (όνομα/επικοινωνία) και τον κωδικό του. Το userId έρχεται πάντα από το session,
 * ποτέ από τη φόρμα. Email/ρόλος αλλάζουν μόνο από τη διαχείριση χρηστών.
 */

export type AccountActionState = { ok?: boolean; error?: string; message?: string }

async function currentUserId(): Promise<string | null> {
  const session = await auth()
  return session?.user?.id ?? null
}

const optional = z.string().trim().max(150).transform(v => v || null)

const profileSchema = z.object({
  name: z.string().trim().min(2, 'Συμπλήρωσε το ονοματεπώνυμο.').max(120, 'Το όνομα είναι πολύ μεγάλο.'),
  phone: optional,
  mobile: optional,
  address: optional,
  city: optional,
})

export async function updateMyProfile(_prev: AccountActionState | undefined, formData: FormData): Promise<AccountActionState> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Η συνεδρία έληξε. Συνδέσου ξανά.' }
  const parsed = profileSchema.safeParse({
    name: formData.get('name') ?? '',
    phone: formData.get('phone') ?? '',
    mobile: formData.get('mobile') ?? '',
    address: formData.get('address') ?? '',
    city: formData.get('city') ?? '',
  })
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? 'Μη έγκυρα στοιχεία.' }
  await prisma.user.update({ where: { id: userId }, data: parsed.data })
  revalidatePath('/', 'layout')
  return { ok: true, message: 'Τα στοιχεία σου αποθηκεύτηκαν.' }
}

export async function changeMyPassword(_prev: AccountActionState | undefined, formData: FormData): Promise<AccountActionState> {
  const userId = await currentUserId()
  if (!userId) return { error: 'Η συνεδρία έληξε. Συνδέσου ξανά.' }
  const current = String(formData.get('current') ?? '')
  const next = String(formData.get('password') ?? '')
  const confirm = String(formData.get('confirm') ?? '')

  if (next.length < 8) return { error: 'Ο νέος κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.' }
  if (next !== confirm) return { error: 'Οι δύο νέοι κωδικοί δεν ταιριάζουν.' }
  if (next === current) return { error: 'Ο νέος κωδικός πρέπει να διαφέρει από τον τρέχοντα.' }

  const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } })
  if (!user) return { error: 'Ο χρήστης δεν βρέθηκε.' }
  if (!(await bcrypt.compare(current, user.passwordHash))) return { error: 'Ο τρέχων κωδικός δεν είναι σωστός.' }

  await prisma.user.update({ where: { id: userId }, data: { passwordHash: await bcrypt.hash(next, 12) } })
  return { ok: true, message: 'Ο κωδικός άλλαξε.' }
}
