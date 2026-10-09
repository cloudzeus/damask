/**
 * Αναγνώριση τύπου αρχείου από το ΠΕΡΙΕΧΟΜΕΝΟ (magic bytes) — για αρχεία χωρίς κατάληξη στο όνομα ή με γενικό
 * mime (application/octet-stream). Καθαρό module, δουλεύει σε browser και server.
 */
export type SniffedKind = 'pdf' | 'image' | 'docx' | 'sheet' | 'text' | 'other'

export function sniffFile(buf: ArrayBuffer): { kind: SniffedKind; mime: string } {
  const b = new Uint8Array(buf)
  const at = (...xs: number[]) => xs.every((x, i) => b[i] === x)
  if (at(0x25, 0x50, 0x44, 0x46)) return { kind: 'pdf', mime: 'application/pdf' }
  if (at(0x89, 0x50, 0x4e, 0x47)) return { kind: 'image', mime: 'image/png' }
  if (at(0xff, 0xd8, 0xff)) return { kind: 'image', mime: 'image/jpeg' }
  if (at(0x47, 0x49, 0x46, 0x38)) return { kind: 'image', mime: 'image/gif' }
  if (at(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return { kind: 'image', mime: 'image/webp' }
  if (at(0x50, 0x4b, 0x03, 0x04)) {
    // ZIP (Office Open XML): τα ονόματα των εσωτερικών αρχείων είναι σε ASCII μέσα στο αρχείο.
    const ascii = new TextDecoder('latin1').decode(b.subarray(0, Math.min(b.length, 2_000_000)))
    if (ascii.includes('word/')) return { kind: 'docx', mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' }
    if (ascii.includes('xl/')) return { kind: 'sheet', mime: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }
    return { kind: 'other', mime: 'application/zip' }
  }
  if (at(0xd0, 0xcf, 0x11, 0xe0)) return { kind: 'other', mime: 'application/x-ole-storage' } // παλιό .doc/.xls
  // Κείμενο: έγκυρο UTF-8 χωρίς δυαδικούς χαρακτήρες ελέγχου στα πρώτα 4 KB.
  const head = b.subarray(0, 4096)
  if (head.length && !head.some(x => x === 0 || (x < 9) || (x > 13 && x < 32 && x !== 27))) {
    try { new TextDecoder('utf-8', { fatal: true }).decode(head); return { kind: 'text', mime: 'text/plain' } } catch { /* όχι κείμενο */ }
  }
  return { kind: 'other', mime: 'application/octet-stream' }
}
