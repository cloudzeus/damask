'use server'

import { z } from 'zod'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'

const schema = z.object({
  type: z.enum(['CUSTOMER', 'ARCHITECT'], { error: 'Επίλεξε τύπο λογαριασμού.' }),
  name: z.string().trim().min(2, 'Συμπλήρωσε το ονοματεπώνυμό σου.'),
  phone: z
    .string()
    .trim()
    .regex(/^[\d\s()+-]{7,20}$/, 'Μη έγκυρο τηλέφωνο.'),
  company: z.string().trim().min(2, 'Συμπλήρωσε την επωνυμία της εταιρείας.'),
  afm: z
    .string()
    .trim()
    .regex(/^\d{9}$/, 'Το ΑΦΜ πρέπει να έχει 9 ψηφία.'),
  email: z.email('Μη έγκυρο email.'),
})

export type RegisterState = {
  success?: boolean
  error?: string
  fieldErrors?: Partial<Record<keyof z.infer<typeof schema>, string>>
}

export async function requestAccess(
  _prev: RegisterState | undefined,
  formData: FormData,
): Promise<RegisterState> {
  const raw = {
    type: formData.get('type'),
    name: formData.get('name'),
    phone: formData.get('phone'),
    company: formData.get('company'),
    afm: formData.get('afm'),
    email: formData.get('email'),
  }

  const parsed = schema.safeParse(raw)
  if (!parsed.success) {
    const fieldErrors: RegisterState['fieldErrors'] = {}
    for (const issue of parsed.error.issues) {
      const key = issue.path[0] as keyof z.infer<typeof schema> | undefined
      if (key && !fieldErrors[key]) fieldErrors[key] = issue.message
    }
    return { error: 'Έλεγξε τα στοιχεία που συμπλήρωσες.', fieldErrors }
  }

  const data = parsed.data

  try {
    await prisma.accessRequest.create({
      data: {
        type: data.type,
        name: data.name,
        company: data.company,
        afm: data.afm,
        phone: data.phone,
        email: data.email.toLowerCase(),
      },
    })
  } catch (e) {
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
      return { error: 'Υπάρχει ήδη αίτημα με αυτό το email.' }
    }
    throw e
  }

  return { success: true }
}
