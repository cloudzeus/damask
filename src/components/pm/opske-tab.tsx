'use client'

/**
 * «ΟΠΣΚΕ» tab (Task 10 — stub). Πραγματικό σώμα (κατάσταση/αριθμός
 * υποβολής/ημερομηνία μέσω updateOpske) προστίθεται στο Task 13. Props
 * κρατιούνται ευέλικτα (αρχικές τιμές προαιρετικές) ώστε το hub να μπορεί
 * να τα περνάει ήδη χωρίς να δεσμεύει το τελικό σχήμα του Task 13.
 */
export function OpskeTab({
  applicationId,
  canManage,
  initialStatus,
  initialRef,
  initialSubmittedAt,
}: {
  applicationId: string
  canManage?: boolean
  initialStatus?: string | null
  initialRef?: string | null
  initialSubmittedAt?: string | null
}) {
  void applicationId
  void canManage
  void initialStatus
  void initialRef
  void initialSubmittedAt
  return (
    <section className="glass rounded-[22px] p-4">
      <div className="p-6 text-center text-sm text-muted-foreground">(σε εξέλιξη)</div>
    </section>
  )
}
