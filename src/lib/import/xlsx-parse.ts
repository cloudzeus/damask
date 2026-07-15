import * as XLSX from 'xlsx'

/**
 * Client-side Excel parsing (SheetJS) — ΟΧΙ server round-trip. Καλείται από
 * step-upload.tsx/step-sheet.tsx ('use client') πάνω σε ArrayBuffer από το
 * File API. Καθαρές συναρτήσεις, καμία εξάρτηση Next/React, εύκολα testable.
 */

export type SheetMeta = { name: string; rowCount: number; colCount: number }

/** rowNum = 1-based, όπως θα το έβλεπε ο χρήστης μέσα στο Excel. cells = 0-based, πάντα από τη στήλη A. */
export type RawRow = { rowNum: number; cells: (string | null)[] }

export type ColumnInfo = { index: number; colLetter: string; header: string; isEmpty: boolean }

/** 0-based index → γράμμα(τα) στήλης Excel: 0→A, 25→Z, 26→AA. */
export function colIndexToLetter(idx: number): string {
  let letter = ''
  let n = idx + 1
  while (n > 0) {
    const rem = (n - 1) % 26
    letter = String.fromCharCode(65 + rem) + letter
    n = Math.floor((n - 1) / 26)
  }
  return letter
}

/**
 * `raw: true` είναι ΥΠΟΧΡΕΩΤΙΚΟ εδώ: χωρίς αυτό, το SheetJS "μαντεύει" τύπο για
 * CSV κελιά-κείμενο και ένα ποσοστιαία-ελληνικό "19,90" γίνεται σιωπηλά ο
 * αριθμός 1990 (χάνεται το κόμμα) — επαληθεύτηκε manual test. Με raw:true όλα
 * τα CSV κελιά μένουν string όπως γράφτηκαν, και το parseGreekNumber
 * (targets.ts) αναλαμβάνει τη σωστή μετατροπή. Για ΠΡΑΓΜΑΤΙΚΑ xlsx/xls
 * αριθμητικά κελιά το raw δεν έχει καμία επίδραση — είναι ήδη typed στη
 * μορφή του αρχείου (επαληθεύτηκε manual test), άρα το γρήγορο μονοπάτι
 * cellToString() για t==='n' συνεχίζει να δουλεύει κανονικά.
 */
export function readWorkbook(buffer: ArrayBuffer): XLSX.WorkBook {
  return XLSX.read(buffer, { type: 'array', cellDates: true, raw: true })
}

/** true αν το αρχείο είναι CSV βάσει επέκτασης/MIME type. */
function isCsvFile(file: File): boolean {
  return /\.csv$/i.test(file.name) || file.type === 'text/csv'
}

/**
 * Διαβάζει ένα File σε XLSX.WorkBook. CSV διαβάζεται ως ΚΕΙΜΕΝΟ (file.text(),
 * πάντα UTF-8 κατά το File API) — ΠΟΤΕ ως ArrayBuffer για CSV: χωρίς αυτό, το
 * SheetJS δεν ξέρει τι codepage να υποθέσει για τα raw bytes και ελληνικό
 * κείμενο γίνεται mojibake (π.χ. "Κωδικός" → "ÎÏÎ´Î¹ÎºÏÏ") — επαληθεύτηκε
 * manual test. Binary .xlsx/.xls έχουν δικό τους encoding μέσα στο αρχείο,
 * άρα διαβάζονται κανονικά ως ArrayBuffer.
 */
export async function readWorkbookFromFile(file: File): Promise<XLSX.WorkBook> {
  if (isCsvFile(file)) {
    const text = await file.text()
    return XLSX.read(text, { type: 'string', raw: true })
  }
  const buffer = await file.arrayBuffer()
  return readWorkbook(buffer)
}

export function listSheets(wb: XLSX.WorkBook): SheetMeta[] {
  return wb.SheetNames.map(name => {
    const ws = wb.Sheets[name]
    const ref = ws['!ref']
    if (!ref) return { name, rowCount: 0, colCount: 0 }
    const range = XLSX.utils.decode_range(ref)
    return { name, rowCount: range.e.r + 1, colCount: range.e.c + 1 }
  })
}

/**
 * Μετατρέπει ένα SheetJS κελί σε string|null. Αριθμητικά/boolean κελιά
 * διαβάζουν το raw `.v` (πάντα έγκυρη JS αναπαράσταση, π.χ. "12.5" — καμία
 * ασάφεια μορφοποίησης). Μόνο κείμενο/CSV περνάει από τον Ελληνικό
 * number parser (parseGreekNumber στο targets.ts) παρακάτω στο pipeline,
 * όπου "12,50" γραμμένο ως κείμενο γίνεται σωστά δεκτό.
 */
function cellToString(cell: XLSX.CellObject | undefined): string | null {
  if (!cell || cell.t === 'z' || cell.v === undefined || cell.v === null) return null
  if (cell.t === 'n' || cell.t === 'b') return String(cell.v)
  if (cell.t === 'd') {
    const d = cell.v instanceof Date ? cell.v : new Date(String(cell.v))
    return Number.isNaN(d.getTime()) ? null : d.toISOString().slice(0, 10)
  }
  const s = String(cell.v).trim()
  return s === '' ? null : s
}

/** Διαβάζει ΟΛΕΣ τις γραμμές ενός φύλλου, πάντα από A1 (τα γράμματα/αριθμοί ταιριάζουν πάντα με το πραγματικό Excel). */
export function readSheetRows(ws: XLSX.WorkSheet): { rows: RawRow[]; colCount: number } {
  const ref = ws['!ref']
  if (!ref) return { rows: [], colCount: 0 }
  const range = XLSX.utils.decode_range(ref)
  const colCount = range.e.c + 1
  const rows: RawRow[] = []
  for (let r = 0; r <= range.e.r; r++) {
    const cells: (string | null)[] = []
    for (let c = 0; c < colCount; c++) {
      cells.push(cellToString(ws[XLSX.utils.encode_cell({ r, c })]))
    }
    rows.push({ rowNum: r + 1, cells })
  }
  return { rows, colCount }
}

/** Παράγει ColumnInfo[] (header text + isEmpty) από όλες τις γραμμές δεδομένων (rowNum > headerRow). */
export function deriveColumns(rows: RawRow[], headerRow: number, colCount: number): ColumnInfo[] {
  const headerRawRow = rows.find(r => r.rowNum === headerRow)
  const dataRows = rows.filter(r => r.rowNum > headerRow)
  const cols: ColumnInfo[] = []
  for (let i = 0; i < colCount; i++) {
    const headerText = headerRawRow?.cells[i]?.trim()
    const isEmpty = dataRows.every(r => !r.cells[i] || r.cells[i]!.trim() === '')
    cols.push({
      index: i,
      colLetter: colIndexToLetter(i),
      header: headerText || `Στήλη ${colIndexToLetter(i)}`,
      isEmpty,
    })
  }
  return cols
}

/** true αν ΟΛΑ τα κελιά της γραμμής είναι κενά — τέτοιες γραμμές παραλείπονται πάντα σιωπηλά (ουρές κενών γραμμών σε πραγματικά αρχεία). */
export function isRowBlank(row: RawRow): boolean {
  return row.cells.every(c => !c || c.trim() === '')
}
