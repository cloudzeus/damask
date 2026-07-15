import { describe, it, expect } from 'vitest'
import * as XLSX from 'xlsx'
import {
  colIndexToLetter, deriveColumns, isRowBlank, listSheets, readSheetRows, readWorkbookFromFile, type RawRow,
} from '@/lib/import/xlsx-parse'

describe('colIndexToLetter()', () => {
  it('μετατρέπει 0-based index σε γράμμα Excel', () => {
    expect(colIndexToLetter(0)).toBe('A')
    expect(colIndexToLetter(1)).toBe('B')
    expect(colIndexToLetter(25)).toBe('Z')
    expect(colIndexToLetter(26)).toBe('AA')
    expect(colIndexToLetter(27)).toBe('AB')
    expect(colIndexToLetter(51)).toBe('AZ')
    expect(colIndexToLetter(52)).toBe('BA')
  })
})

describe('isRowBlank()', () => {
  it('true όταν όλα τα κελιά είναι null/κενά', () => {
    expect(isRowBlank({ rowNum: 1, cells: [null, '', '   '] })).toBe(true)
  })
  it('false όταν έστω ένα κελί έχει τιμή', () => {
    expect(isRowBlank({ rowNum: 1, cells: [null, 'κάτι', null] })).toBe(false)
  })
  it('true για εντελώς άδεια γραμμή', () => {
    expect(isRowBlank({ rowNum: 1, cells: [] })).toBe(true)
  })
})

describe('deriveColumns()', () => {
  const rows: RawRow[] = [
    { rowNum: 1, cells: ['Κωδικός', 'Ονομασία', null] },
    { rowNum: 2, cells: ['DM-1', 'Καρέκλα', null] },
    { rowNum: 3, cells: ['DM-2', 'Τραπέζι', null] },
  ]

  it('παίρνει το κείμενο επικεφαλίδας από τη σωστή γραμμή', () => {
    const cols = deriveColumns(rows, 1, 3)
    expect(cols.map(c => c.header)).toEqual(['Κωδικός', 'Ονομασία', 'Στήλη C'])
  })

  it('σημειώνει isEmpty=true για στήλη χωρίς καμία τιμή στα data rows', () => {
    const cols = deriveColumns(rows, 1, 3)
    expect(cols[2].isEmpty).toBe(true)
    expect(cols[0].isEmpty).toBe(false)
    expect(cols[1].isEmpty).toBe(false)
  })

  it('χρησιμοποιεί fallback "Στήλη X" όταν η επικεφαλίδα είναι κενή', () => {
    const withBlankHeader: RawRow[] = [{ rowNum: 1, cells: [null] }, { rowNum: 2, cells: ['x'] }]
    expect(deriveColumns(withBlankHeader, 1, 1)[0].header).toBe('Στήλη A')
  })

  it('αλλάζοντας τη γραμμή επικεφαλίδων αλλάζουν τα headers', () => {
    const cols = deriveColumns(rows, 2, 3)
    expect(cols.map(c => c.header)).toEqual(['DM-1', 'Καρέκλα', 'Στήλη C'])
  })
})

describe('listSheets() / readSheetRows() (πραγματικό in-memory workbook)', () => {
  function buildWorkbook() {
    const wb = XLSX.utils.book_new()
    const sheet1 = XLSX.utils.aoa_to_sheet([['Κωδικός', 'Ονομασία'], ['DM-1', 'Καρέκλα'], ['DM-2', 'Τραπέζι']])
    XLSX.utils.book_append_sheet(wb, sheet1, 'Προϊόντα')
    const sheet2 = XLSX.utils.aoa_to_sheet([['Σημείωση']])
    XLSX.utils.book_append_sheet(wb, sheet2, 'Άλλο')
    return wb
  }

  it('listSheets() επιστρέφει όνομα + διαστάσεις κάθε φύλλου', () => {
    const sheets = listSheets(buildWorkbook())
    expect(sheets).toEqual([
      { name: 'Προϊόντα', rowCount: 3, colCount: 2 },
      { name: 'Άλλο', rowCount: 1, colCount: 1 },
    ])
  })

  it('readSheetRows() διαβάζει όλα τα κελιά με σωστά rowNum (1-based) και στήλες από A', () => {
    const wb = buildWorkbook()
    const { rows, colCount } = readSheetRows(wb.Sheets['Προϊόντα'])
    expect(colCount).toBe(2)
    expect(rows).toEqual([
      { rowNum: 1, cells: ['Κωδικός', 'Ονομασία'] },
      { rowNum: 2, cells: ['DM-1', 'Καρέκλα'] },
      { rowNum: 3, cells: ['DM-2', 'Τραπέζι'] },
    ])
  })

  it('αριθμητικά κελιά διαβάζονται ως έγκυρη JS αναπαράσταση αριθμού (χωρίς ασάφεια μορφοποίησης)', () => {
    const wb = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['Τιμή'], [12.5], [3]])
    XLSX.utils.book_append_sheet(wb, sheet, 'S')
    const { rows } = readSheetRows(sheet)
    expect(rows[1].cells[0]).toBe('12.5')
    expect(rows[2].cells[0]).toBe('3')
  })
})

describe('readWorkbookFromFile() — CSV (regression: mojibake + lossy κόμμα σε ποσά)', () => {
  it('διαβάζει ελληνικό κείμενο CSV σωστά (χωρίς mojibake) — CSV πρέπει να διαβάζεται ως κείμενο, ΟΧΙ ArrayBuffer χωρίς codepage', async () => {
    const csv = 'Κωδικός,Περιγραφή\nVIS-1,Οπτικός Έλεγχος Καρέκλα\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const wb = await readWorkbookFromFile(file)
    const { rows } = readSheetRows(wb.Sheets[wb.SheetNames[0]])
    expect(rows[0].cells).toEqual(['Κωδικός', 'Περιγραφή'])
    expect(rows[1].cells).toEqual(['VIS-1', 'Οπτικός Έλεγχος Καρέκλα'])
  })

  it('διατηρεί το κόμμα σε εισαγωγικά-ποσό CSV κελί χωρίς να το μετατρέπει σε αριθμό (χρειάζεται raw:true στο XLSX.read)', async () => {
    const csv = 'Κωδικός,Τιμή\nVIS-1,"19,90"\n'
    const file = new File([csv], 'test.csv', { type: 'text/csv' })
    const wb = await readWorkbookFromFile(file)
    const { rows } = readSheetRows(wb.Sheets[wb.SheetNames[0]])
    // Χωρίς το fix αυτό θα ήταν "1990" (το SheetJS μαντεύει τύπο "αριθμός" σε CSV κείμενο).
    expect(rows[1].cells[1]).toBe('19,90')
  })

  it('.xlsx (όχι CSV) διαβάζεται μέσω ArrayBuffer κανονικά — δεν επηρεάζεται από το CSV-only text path', async () => {
    const wb0 = XLSX.utils.book_new()
    const sheet = XLSX.utils.aoa_to_sheet([['Κωδικός'], ['DM-1']])
    XLSX.utils.book_append_sheet(wb0, sheet, 'S')
    const buf = XLSX.write(wb0, { bookType: 'xlsx', type: 'buffer' }) as Buffer
    const file = new File([new Uint8Array(buf)], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    })
    const wb = await readWorkbookFromFile(file)
    const { rows } = readSheetRows(wb.Sheets[wb.SheetNames[0]])
    expect(rows[1].cells).toEqual(['DM-1'])
  })
})
