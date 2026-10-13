/**
 * (Μόνο browser.) Κείμενο από αρχεία γραφείου για αναγνώριση/σάρωση τιμών: Word (.docx) με mammoth,
 * Excel/CSV (.xlsx/.xls/.csv/.ods) με SheetJS (CSV ανά φύλλο), απλό κείμενο. Τα PDF/εικόνες διαβάζονται αλλού (OCR).
 * Παλιά .doc δεν υποστηρίζονται (δυαδική μορφή) — αναγνωρίζονται μόνο από το όνομα.
 */

export function officeKind(file: File): 'docx' | 'sheet' | 'text' | null {
  const n = file.name.toLowerCase()
  if (n.endsWith('.docx')) return 'docx'
  if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(n)) return 'sheet'
  if (/\.(txt|md|json|xml)$/.test(n)) return 'text'
  return null
}

export async function readOfficeText(file: File, max = 60_000): Promise<string> {
  const kind = officeKind(file)
  if (!kind) return ''
  const buf = await file.arrayBuffer()
  if (kind === 'docx') {
    // @ts-expect-error — το browser bundle του mammoth δεν έχει types
    const mod = await import('mammoth/mammoth.browser')
    const mammoth = mod.default ?? mod
    const out = await mammoth.extractRawText({ arrayBuffer: buf })
    return String(out.value ?? '').slice(0, max)
  }
  if (kind === 'sheet') {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'array' })
    return wb.SheetNames.map(n => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n').slice(0, max)
  }
  return new TextDecoder().decode(buf).slice(0, max)
}
