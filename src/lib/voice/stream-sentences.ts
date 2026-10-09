/**
 * Κείμενο που ρέει (streaming) → ολοκληρωμένες προτάσεις για φωνή, ώστε η εκφώνηση να ξεκινά από την
 * πρώτη πρόταση όσο γράφεται το υπόλοιπο. Καθαρό module (χωρίς DOM) — βλ. tests/thanos/stream-sentences.test.ts.
 */

/** Χωρίς markdown (έντονα/επικεφαλίδες) για εκφώνηση. */
export const plain = (t: string) => t.replace(/\*\*(.+?)\*\*/g, '$1').replace(/^#{1,4}\s+/gm, '')

export const LIST_ITEM = /^\s*([-•*–]|\d+[.)])\s+/
/** Σπάει σε προτάσεις· η τελευταία που καταλήγει σε «:» (προαναγγέλλει λίστα) πετιέται. */
export function sentencesOf(line: string): string[] {
  const parts = line.split(/(?<=[.!;;])\s+/).map(x => x.trim()).filter(Boolean)
  if (parts.length && parts[parts.length - 1].endsWith(':')) parts.pop()
  return parts
}

/**
 * Από το κείμενο που ρέει → ολοκληρωμένες προτάσεις για φωνή. Δεν εκφωνεί γραμμές-λίστας (μετρά πόσες ήταν)
 * και ενώνει πολύ σύντομες προτάσεις (≥40 χαρ. ανά κομμάτι) για λιγότερες κλήσεις.
 */
export class SentenceFeeder {
  private buf = ''
  private carry = ''
  listItems = 0
  feed(delta: string): string[] { this.buf += delta; return this.drain(false) }
  flush(): string[] { return this.drain(true) }
  private drain(final: boolean): string[] {
    const out: string[] = []
    const emit = (sentence: string) => {
      const t = plain(sentence).trim()
      if (!t) return
      this.carry = this.carry ? `${this.carry} ${t}` : t
      if (this.carry.length >= 40) { out.push(this.carry); this.carry = '' }
    }
    let nl: number
    while ((nl = this.buf.indexOf('\n')) >= 0) {
      const line = this.buf.slice(0, nl)
      this.buf = this.buf.slice(nl + 1)
      if (LIST_ITEM.test(line)) { this.listItems++; continue }
      sentencesOf(line).forEach(emit)
    }
    if (final) {
      if (this.buf.trim()) { if (LIST_ITEM.test(this.buf)) this.listItems++; else sentencesOf(this.buf).forEach(emit) }
      this.buf = ''
      if (this.carry) { out.push(this.carry); this.carry = '' }
    } else if (this.buf && !/^\s*([-•*–]|\d+[.)])/.test(this.buf)) {
      // μισή γραμμή: μόνο ως το τελευταίο τέλος πρότασης που ακολουθείται από κενό
      let cut = -1
      for (const m of this.buf.matchAll(/[.!;;](?=\s)/g)) cut = (m.index ?? -1) + 1
      if (cut > 0) { sentencesOf(this.buf.slice(0, cut)).forEach(emit); this.buf = this.buf.slice(cut) }
    }
    return out
  }
}

