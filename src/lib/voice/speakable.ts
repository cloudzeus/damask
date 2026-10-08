/**
 * Κείμενο → εκφώνηση. Τηλέφωνα/ΑΦΜ/κωδικοί (≥7 ψηφία, με ή χωρίς κενά/παύλες) λέγονται ΨΗΦΙΟ-ΨΗΦΙΟ σε ομάδες
 * των 3, με παύση ανάμεσα: 6940960701 → «έξι εννιά τέσσερα, μηδέν εννιά έξι, μηδέν εφτά μηδέν ένα».
 * Ποτέ ως αριθμός («έξι δισεκατομμύρια…») ή ζευγάρια («ενενήντα τέσσερα»). Τα ψηφία γράφονται ως λέξεις ώστε
 * η φωνή να μην τα ενώνει. Ποσά με διαχωριστικά (12.500 · 1.250,50) και έτη μένουν ως έχουν.
 */
const DIGIT = ['μηδέν', 'ένα', 'δύο', 'τρία', 'τέσσερα', 'πέντε', 'έξι', 'εφτά', 'οχτώ', 'εννιά']

/** 3-3-…-4: ένα μονοψήφιο υπόλοιπο κολλά στην τελευταία ομάδα (694 096 0701). */
export function groupDigits(digits: string): string[] {
  const groups = digits.match(/.{1,3}/g) ?? [digits]
  if (groups.length > 1 && groups[groups.length - 1].length === 1) groups.splice(-2, 2, groups.slice(-2).join(''))
  return groups
}

export function speakable(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/(?<![\d.,])\+?\d(?:[\d \-]{5,}\d)(?![\d.,])/g, m => {
      const digits = m.replace(/\D/g, '')
      if (digits.length < 7) return m
      return groupDigits(digits).map(g => g.split('').map(d => DIGIT[Number(d)]).join(' ')).join(', ')
    })
}
