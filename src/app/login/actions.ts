'use server'

import { signIn } from '@/auth'
import { AuthError } from 'next-auth'

export async function loginAction(
  _prev: { error?: string } | undefined,
  formData: FormData,
): Promise<{ error?: string }> {
  try {
    await signIn('credentials', {
      email: formData.get('email'),
      password: formData.get('password'),
      redirectTo: '/',
    })
    return {}
  } catch (e) {
    if (e instanceof AuthError) return { error: 'Λάθος email ή κωδικός.' }
    throw e // τα redirects του Next πρέπει να ξαναπεταχτούν
  }
}
