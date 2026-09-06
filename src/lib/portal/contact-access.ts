import crypto from 'node:crypto'
import bcrypt from 'bcryptjs'
import { prisma } from '@/lib/prisma'
import { createResetToken } from '@/lib/password-reset'
import { isMailerConfigured, sendMail, renderEmailShell, escapeHtml } from '@/lib/mailer'

/**
 * Χορήγηση πρόσβασης portal σε επαφή πελάτη: εξασφαλίζει User (ρόλος CUSTOMER,
 * b2b → /portal) συνδεδεμένο με την επαφή & τον πελάτη της, και στέλνει email με
 * σύνδεσμο ώστε ο χρήστης να ΟΡΙΣΕΙ ΜΟΝΟΣ τον κωδικό του (reset-password token,
 * ισχύς 30'). Plain module — καλείται από server actions ΜΕΤΑ τον permission gate.
 * Transactional email (ορισμός κωδικού) → χωρίς correlation tags (δεν είναι νήμα
 * επικοινωνίας πελάτη· ίδιο idiom με forgot-password).
 */

const APP_URL = process.env.AUTH_URL ?? 'http://localhost:3000'

export async function grantContactPortalAccess(contactId: string): Promise<{ ok: boolean; error?: string; created?: boolean }> {
  const contact = await prisma.contact.findUnique({
    where: { id: contactId },
    select: { id: true, name: true, email: true, trdrId: true, userId: true },
  })
  if (!contact) return { ok: false, error: 'Η επαφή δεν βρέθηκε.' }
  const email = contact.email?.trim().toLowerCase()
  if (!email) return { ok: false, error: 'Η επαφή δεν έχει καταχωρημένο email.' }

  const role = await prisma.role.findUnique({ where: { name: 'CUSTOMER' } })
  if (!role) return { ok: false, error: 'Ο ρόλος CUSTOMER δεν υπάρχει.' }

  // 1) Εξασφάλιση User + σύνδεση με την επαφή.
  let userId = contact.userId
  let created = false
  if (!userId) {
    const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } })
    if (existing) {
      userId = existing.id
    } else {
      const randomHash = await bcrypt.hash(crypto.randomBytes(24).toString('hex'), 12)
      const user = await prisma.user.create({
        data: { email, name: contact.name, passwordHash: randomHash, roleId: role.id, trdrId: contact.trdrId, active: true },
        select: { id: true },
      })
      userId = user.id
      created = true
    }
    await prisma.contact.update({ where: { id: contact.id }, data: { userId } })
  }

  // 2) Σύνδεσμος ορισμού κωδικού (ο χρήστης ορίζει τον δικό του κωδικό).
  const token = await createResetToken(userId)
  const url = `${APP_URL}/reset-password?token=${token}`

  if (await isMailerConfigured()) {
    const html = renderEmailShell({
      preheader: 'Πρόσβαση στο Portal',
      heading: 'Πρόσβαση στο Portal',
      bodyHtml:
        `<p>Γεια σας ${escapeHtml(contact.name)},</p>` +
        '<p>Σας δόθηκε πρόσβαση στο portal της World Wide Associates. Πατήστε το παρακάτω κουμπί για να ' +
        'ορίσετε τον κωδικό πρόσβασής σας — ο σύνδεσμος ισχύει για 30 λεπτά.</p>' +
        `<p style="font-size:12.5px;color:#8098A5;">Είσοδος: ${escapeHtml(email)}</p>`,
      ctaLabel: 'Ορισμός κωδικού',
      ctaUrl: url,
    })
    const result = await sendMail({ to: email, subject: 'Πρόσβαση στο Portal — World Wide Associates', html })
    if (!result.ok) console.log(`[portal-access] Αποστολή απέτυχε (${result.error}) — ${email} → ${url}`)
  } else {
    console.log(`[portal-access] ${email} → ${url}`)
  }

  return { ok: true, created }
}
