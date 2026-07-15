'use server'

import { redirect } from 'next/navigation'
import { auth, signIn } from '@/auth'
import { AuthError } from 'next-auth'
import { roleHome } from '@/lib/role-home'

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    // redirect:false — θέλουμε να διαβάσουμε τον ρόλο πριν αποφασίσουμε πού πάμε.
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirect: false,
    })
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Λάθος email ή κωδικός.' }
    throw e
  }

  // Το redirect() πετάει NEXT_REDIRECT εκτός try/catch — δεν πρέπει να καταπιεί
  // ποτέ από το catch(AuthError) παραπάνω, γι' αυτό ζει εδώ έξω.
  const session = await auth()
  redirect(roleHome(session?.user?.role ?? ''))
}
