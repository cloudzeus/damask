import { prisma } from '@/lib/prisma'

/**
 * (Plain module.) Έργο «σε εξέλιξη» (ProgramApplication.onboardedAt): ό,τι ανήκει σε φάση ΠΡΙΝ την έγκριση
 * έγινε εκτός συστήματος — σημειώνεται «απαλλαγή» ώστε να μη μπλοκάρει τα επόμενα βήματα (τα παραδοτέα
 * έγκρισης/πιστοποίησης περιμένουν τα προηγούμενα). Καλείται στην εισαγωγή ΚΑΙ κάθε φορά που δημιουργούνται
 * νέα παραδοτέα (π.χ. όταν προστίθεται δαπάνη αργότερα). Τα δικαιολογητικά (FORM) δεν αγγίζονται εδώ.
 */
const NOTE = 'Προηγήθηκε της εισαγωγής του έργου (εγκεκριμένη πρόταση).'

export async function waivePreApprovalSteps(applicationId: string): Promise<{ tasks: number; obligations: number }> {
  const tasks = await prisma.expenseDeliverableTask.updateMany({
    where: { deliverable: { applicationId }, phase: { in: ['ASSESSMENT', 'SUBMISSION'] }, status: { in: ['PENDING', 'REJECTED'] } },
    data: { status: 'WAIVED', notes: NOTE },
  })
  const obligations = await prisma.applicationObligation.updateMany({
    where: { applicationId, kind: { in: ['TASK', 'CRITERION', 'DELIVERABLE'] }, stage: { in: ['ASSESSMENT', 'EXPENSES_DELIVERABLES', 'OPSKE_SUBMISSION'] }, status: { in: ['PENDING', 'IN_PROGRESS'] } },
    data: { status: 'WAIVED', notes: NOTE },
  })
  return { tasks: tasks.count, obligations: obligations.count }
}
