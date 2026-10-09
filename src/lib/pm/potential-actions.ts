'use server'

import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { logActivity } from '@/lib/activity/log'
import { runPotentialMatching, type MatchRunResult } from '@/lib/pm/potential-matching'

/** Κουμπί στα Προγράμματα: όλοι οι πελάτες × όλα τα ενεργά/αναμενόμενα προγράμματα. */
export async function runPotentialMatchingAction(): Promise<{ ok: boolean; result?: MatchRunResult; error?: string }> {
  const session = await requirePermission('programs.manage')
  try {
    const result = await runPotentialMatching()
    await logActivity('program.potential_check', { userId: session.user.id, entityType: 'program', entityId: 'all', summary: `${result.matches} αντιστοιχίσεις σε ${result.customers} πελάτες`, meta: { matches: result.matches, programs: result.programs } })
    revalidatePath('/partners', 'layout')
    return { ok: true, result }
  } catch (err) {
    console.error('runPotentialMatchingAction', err)
    return { ok: false, error: 'Ο έλεγχος απέτυχε. Δοκιμάστε ξανά.' }
  }
}

/** Επανέλεγχος ενός πελάτη (tab «Δυνητικά προγράμματα»). */
export async function recheckTrdrPotentialAction(trdrId: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('programs.manage')
  try {
    await runPotentialMatching({ trdrIds: [trdrId] })
    revalidatePath(`/partners/${trdrId}`)
    return { ok: true }
  } catch (err) {
    console.error('recheckTrdrPotentialAction', err)
    return { ok: false, error: 'Ο έλεγχος απέτυχε.' }
  }
}
