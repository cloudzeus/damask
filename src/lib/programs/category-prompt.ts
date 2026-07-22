// Prompt builder for AI-assisted expense categorization — matches an expense
// to one of a program's eligible expense categories.
//
// ISOMORPHIC: no prisma/react imports — plain string building so it can be
// unit-tested and reused from both server actions and any client preview.

export type CatInput = {
  categories: {
    id: string
    name: string
    minPercentage?: number | null
    maxPercentage?: number | null
    mandatory?: boolean
    notes?: string | null
  }[]
  expense: { description: string; amount?: number | null; vendor?: string | null }
}

export function buildCategorizeMessages(input: CatInput): { role: 'system' | 'user'; content: string }[] {
  const cats = input.categories
    .map(
      c =>
        `- id="${c.id}" name="${c.name}"${c.maxPercentage != null ? ` (έως ${c.maxPercentage}% π/υ)` : ''}${
          c.mandatory ? ' [υποχρεωτική]' : ''
        }${c.notes ? ` — ${c.notes}` : ''}`,
    )
    .join('\n')

  const system = [
    'Είσαι σύμβουλος ΕΣΠΑ. Ταξινομείς μια δαπάνη σε ΜΙΑ από τις επιλέξιμες κατηγορίες δαπανών ενός προγράμματος.',
    'Απάντησε ΜΟΝΟ με raw JSON: { "categoryId": "<id ή null>", "reason": "<σύντομη ελληνική αιτιολόγηση>", "confidence": <0..1> }.',
    'Αν καμία κατηγορία δεν ταιριάζει, categoryId=null.',
  ].join('\n')

  const user = [
    'Κατηγορίες δαπανών:',
    cats || '(καμία)',
    '',
    'Δαπάνη:',
    `περιγραφή: ${input.expense.description}`,
    input.expense.amount != null ? `ποσό: ${input.expense.amount}€` : '',
    input.expense.vendor ? `προμηθευτής: ${input.expense.vendor}` : '',
  ]
    .filter(Boolean)
    .join('\n')

  return [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ]
}
