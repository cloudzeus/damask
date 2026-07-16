'use server'

import crypto from 'crypto'
import bcrypt from 'bcryptjs'
import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { isMailerConfigured, sendMail, renderEmailShell, escapeHtml } from '@/lib/mailer'

export type ActionResult =
  | { ok: true; message: string }
  | { ok: false; message: string; fieldErrors?: Record<string, string> }

/** Ενεργοποίηση/απενεργοποίηση χρήστη. Ποτέ στον εαυτό σου — έλεγχος server-side, όχι μόνο UI. */
export async function toggleUserActive(userId: string): Promise<ActionResult> {
  const session = await requirePermission('user.manage')

  if (userId === session.user.id) {
    return { ok: false, message: 'Δεν μπορείς να απενεργοποιήσεις τον εαυτό σου.' }
  }

  const user = await prisma.user.findUnique({ where: { id: userId } })
  if (!user) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }

  const updated = await prisma.user.update({
    where: { id: userId },
    data: { active: !user.active },
  })

  revalidatePath('/users')
  return {
    ok: true,
    message: updated.active ? 'Ο χρήστης ενεργοποιήθηκε.' : 'Ο χρήστης απενεργοποιήθηκε.',
  }
}

/** Αλλαγή ρόλου χρήστη — ισχύει από το επόμενο login (JWT permissions). */
export async function changeUserRole(userId: string, roleId: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  const [user, role] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId } }),
    prisma.role.findUnique({ where: { id: roleId } }),
  ])
  if (!user) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }
  if (!role) return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.' }

  await prisma.user.update({ where: { id: userId }, data: { roleId } })

  revalidatePath('/users')
  return { ok: true, message: `Ο ρόλος του/της ${user.name} άλλαξε σε ${role.name}.` }
}

function randomTempPassword(): string {
  return crypto.randomBytes(12).toString('base64url')
}

/** Τύποι B2B αιτήματος που γίνονται δεκτοί — mapping 1:1 σε όνομα ρόλου. */
const ACCESS_REQUEST_ROLE_NAMES = new Set(['CUSTOMER', 'ARCHITECT', 'SUPPLIER'])

/**
 * Εγκρίνει ένα B2B αίτημα πρόσβασης: δημιουργεί User (CUSTOMER, ARCHITECT ή
 * SUPPLIER — το type του αιτήματος γίνεται απευθείας το όνομα του ρόλου),
 * ενεργό, με τυχαίο προσωρινό password· σημειώνει το αίτημα ως APPROVED.
 *
 * Όταν το αίτημα προέρχεται από επαφή συναλλασσόμενου (contactId — βλ.
 * requestContactAccess, src/app/(app)/partners/actions.ts) ο νέος χρήστης
 * συνδέεται ΚΑΙ με την καρτέλα Trdr της επαφής (User.trdrId) ΚΑΙ η
 * ίδια η επαφή γράφεται ως «έχει λογαριασμό» (Contact.userId) — ώστε το
 * /partners/[id] να δείχνει «User ✓» στη λίστα επαφών.
 */
export async function approveAccessRequest(requestId: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  const request = await prisma.accessRequest.findUnique({ where: { id: requestId } })
  if (!request || request.status !== 'PENDING') {
    return { ok: false, message: 'Το αίτημα δεν βρέθηκε ή έχει ήδη διεκπεραιωθεί.' }
  }

  const roleName = ACCESS_REQUEST_ROLE_NAMES.has(request.type) ? request.type : 'CUSTOMER'
  const role = await prisma.role.findUnique({ where: { name: roleName } })
  if (!role) return { ok: false, message: `Ο ρόλος ${roleName} δεν υπάρχει.` }

  const contact = request.contactId
    ? await prisma.contact.findUnique({ where: { id: request.contactId } })
    : null

  const tempPassword = randomTempPassword()

  let newUserId: string
  try {
    const created = await prisma.user.create({
      data: {
        email: request.email,
        name: request.name,
        passwordHash: await bcrypt.hash(tempPassword, 12),
        active: true,
        roleId: role.id,
        trdrId: contact?.trdrId ?? null,
      },
    })
    newUserId = created.id
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: 'Υπάρχει ήδη χρήστης με αυτό το email.' }
    }
    throw e
  }

  if (contact) {
    await prisma.contact.update({ where: { id: contact.id }, data: { userId: newUserId } })
  }

  await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'APPROVED' } })

  if (await isMailerConfigured()) {
    const loginUrl = `${process.env.AUTH_URL ?? 'http://localhost:3000'}/login`
    const html = renderEmailShell({
      heading: 'Ο λογαριασμός σου είναι έτοιμος',
      bodyHtml:
        `<p>Γεια σου ${escapeHtml(request.name)},</p>` +
        '<p>Το αίτημα πρόσβασής σου στο DAMASK PIM εγκρίθηκε. Στοιχεία σύνδεσης:</p>' +
        `<p><b>Email:</b> ${escapeHtml(request.email)}<br/><b>Προσωρινός κωδικός:</b> ${escapeHtml(tempPassword)}</p>` +
        '<p>Σύνδεσου και άλλαξε τον κωδικό σου το συντομότερο.</p>',
      ctaLabel: 'Σύνδεση',
      ctaUrl: loginUrl,
    })
    const result = await sendMail({ to: request.email, subject: 'Ο λογαριασμός σου στο DAMASK εγκρίθηκε', html })
    if (!result.ok) {
      // Mailgun ρυθμισμένο αλλά η αποστολή απέτυχε live — fallback σε log ώστε να μη χαθεί ο κωδικός.
      console.log(`[access-request] Αποστολή Mailgun απέτυχε (${result.error}) — Εγκρίθηκε ${request.email} (${roleName}) — προσωρινός κωδικός: ${tempPassword}`)
    }
  } else {
    // TODO(SMTP): κρατάμε το log fallback μέχρι να ρυθμιστεί το Mailgun στο /settings.
    console.log(`[access-request] Εγκρίθηκε ${request.email} (${roleName}) — προσωρινός κωδικός: ${tempPassword}`)
  }

  revalidatePath('/users')
  if (contact) {
    revalidatePath('/partners')
    revalidatePath(`/partners/${contact.trdrId}`)
  }
  return { ok: true, message: `Ο λογαριασμός για ${request.name} δημιουργήθηκε.` }
}

/** Απορρίπτει ένα B2B αίτημα πρόσβασης — δεν δημιουργεί χρήστη. */
export async function rejectAccessRequest(requestId: string): Promise<ActionResult> {
  await requirePermission('user.manage')

  const request = await prisma.accessRequest.findUnique({ where: { id: requestId } })
  if (!request || request.status !== 'PENDING') {
    return { ok: false, message: 'Το αίτημα δεν βρέθηκε ή έχει ήδη διεκπεραιωθεί.' }
  }

  await prisma.accessRequest.update({ where: { id: requestId }, data: { status: 'REJECTED' } })

  revalidatePath('/users')
  return { ok: true, message: `Το αίτημα του/της ${request.name} απορρίφθηκε.` }
}

// ── Δημιουργία / Επεξεργασία χρήστη (dialog «+ Νέος χρήστης» + ⋮ Επεξεργασία) ──

const contactField = z.string().trim().max(120, 'Πολύ μεγάλο πεδίο.')

const userFormShape = {
  name: z.string().trim().min(2, 'Συμπλήρωσε το ονοματεπώνυμο.').max(120),
  email: z.email('Μη έγκυρο email.'),
  roleId: z.string().min(1, 'Επίλεξε ρόλο.'),
  phone: contactField,
  mobile: contactField,
  address: contactField,
  city: contactField,
  country: contactField,
  active: z.boolean(),
}

const createUserSchema = z.object({
  ...userFormShape,
  password: z.string().min(8, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.'),
})

const updateUserSchema = z.object({
  ...userFormShape,
  // κενό = δεν αλλάζει ο κωδικός· αλλιώς πρέπει να πληροί το ελάχιστο μήκος
  password: z.union([z.string().min(8, 'Ο κωδικός πρέπει να έχει τουλάχιστον 8 χαρακτήρες.'), z.literal('')]),
})

/** Πεδία της φόρμας χρήστη (δημιουργία & επεξεργασία) — controlled inputs, πάντα strings. */
export type UserFormValues = {
  name: string
  email: string
  roleId: string
  password: string
  phone: string
  mobile: string
  address: string
  city: string
  country: string
  active: boolean
}

function fieldErrorsFromZod(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {}
  for (const issue of error.issues) {
    const key = String(issue.path[0] ?? '')
    if (key && !out[key]) out[key] = issue.message
  }
  return out
}

/** '' → null (δεν αποθηκεύουμε κενά strings σε προαιρετικά πεδία επικοινωνίας). */
function normalizeContact(value: string): string | null {
  const trimmed = value.trim()
  return trimmed === '' ? null : trimmed
}

const UNIQUE_EMAIL_MESSAGE = 'Υπάρχει ήδη χρήστης με αυτό το email.'

/** Δημιουργεί χρήστη (dialog «+ Νέος χρήστης»). zod validation, unique email friendly error, bcrypt(12). */
export async function createUser(input: UserFormValues): Promise<ActionResult> {
  await requirePermission('user.manage')

  const parsed = createUserSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const role = await prisma.role.findUnique({ where: { id: data.roleId } })
  if (!role) {
    return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.', fieldErrors: { roleId: 'Ο ρόλος δεν βρέθηκε.' } }
  }

  try {
    await prisma.user.create({
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        passwordHash: await bcrypt.hash(data.password, 12),
        roleId: data.roleId,
        active: data.active,
        phone: normalizeContact(data.phone),
        mobile: normalizeContact(data.mobile),
        address: normalizeContact(data.address),
        city: normalizeContact(data.city),
        country: normalizeContact(data.country),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: UNIQUE_EMAIL_MESSAGE, fieldErrors: { email: UNIQUE_EMAIL_MESSAGE } }
    }
    throw e
  }

  revalidatePath('/users')
  return { ok: true, message: `Ο χρήστης ${data.name} δημιουργήθηκε.` }
}

/**
 * Επεξεργασία χρήστη (⋮ → Επεξεργασία). Ίδια validation με το createUser· ο
 * κωδικός αλλάζει μόνο αν συμπληρωθεί. Guards (ισχύουν και εδώ, όχι μόνο στο
 * toggleUserActive/changeUserRole): δεν αλλάζεις τον δικό σου ρόλο, δεν
 * απενεργοποιείς τον εαυτό σου — έλεγχος server-side, όχι μόνο UI.
 */
export async function updateUser(userId: string, input: UserFormValues): Promise<ActionResult> {
  const session = await requirePermission('user.manage')

  const parsed = updateUserSchema.safeParse(input)
  if (!parsed.success) {
    return { ok: false, message: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors: fieldErrorsFromZod(parsed.error) }
  }
  const data = parsed.data

  const existing = await prisma.user.findUnique({ where: { id: userId } })
  if (!existing) return { ok: false, message: 'Ο χρήστης δεν βρέθηκε.' }

  const isSelf = userId === session.user.id
  if (isSelf && data.roleId !== existing.roleId) {
    return { ok: false, message: 'Δεν μπορείς να αλλάξεις τον δικό σου ρόλο.' }
  }
  if (isSelf && !data.active) {
    return { ok: false, message: 'Δεν μπορείς να απενεργοποιήσεις τον εαυτό σου.' }
  }

  const role = await prisma.role.findUnique({ where: { id: data.roleId } })
  if (!role) {
    return { ok: false, message: 'Ο ρόλος δεν βρέθηκε.', fieldErrors: { roleId: 'Ο ρόλος δεν βρέθηκε.' } }
  }

  try {
    await prisma.user.update({
      where: { id: userId },
      data: {
        name: data.name,
        email: data.email.toLowerCase(),
        roleId: data.roleId,
        active: data.active,
        phone: normalizeContact(data.phone),
        mobile: normalizeContact(data.mobile),
        address: normalizeContact(data.address),
        city: normalizeContact(data.city),
        country: normalizeContact(data.country),
        ...(data.password ? { passwordHash: await bcrypt.hash(data.password, 12) } : {}),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { ok: false, message: UNIQUE_EMAIL_MESSAGE, fieldErrors: { email: UNIQUE_EMAIL_MESSAGE } }
    }
    throw e
  }

  revalidatePath('/users')
  return { ok: true, message: `Οι αλλαγές για ${data.name} αποθηκεύτηκαν.` }
}
