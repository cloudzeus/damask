/**
 * (Isomorphic.) Ψηφιακό κείμενο που διαβάζεται: αρκετά γράμματα/αριθμοί. PDF με «σπασμένη» κωδικοποίηση γραμματοσειράς
 * (π.χ. έντυπα ΑΑΔΕ όπως το Φ2) δίνουν χαρακτήρες ελέγχου — τότε χρειάζεται OCR αντί για το «κείμενο».
 */
export function isReadableText(text: string | null | undefined): boolean {
  const t = (text ?? '').replace(/\s+/g, '')
  if (t.length < 80) return false
  const good = (t.match(/[A-Za-zΑ-Ωα-ωΆ-Ώά-ώϊϋΐΰ0-9]/g) ?? []).length
  return good >= 60 && good / t.length >= 0.6
}
