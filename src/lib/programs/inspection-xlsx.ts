import * as XLSX from 'xlsx'
import type { PurchaseItem } from '@/lib/programs/expense-purchase'

/**
 * Επιτόπιος έλεγχος — Excel όλων των δαπανών με αρ. τιμολογίων & serials, για
 * να το έχει ο ελεγκτής. Client-side (SheetJS), δεδομένα δικά μας. Ίδιο pattern
 * με το referrals/export-xlsx.ts.
 */
export function exportInspectionXlsx(items: PurchaseItem[], fileName = 'epitopios-elegxos-dapanes.xlsx'): void {
  const data = items.map((it, i) => ({
    'Α/Α': i + 1,
    'Περιγραφή δαπάνης': it.description,
    'Κατηγορία': it.categoryName ?? '',
    'Προμηθευτής': it.supplierName ?? '',
    'ΑΦΜ προμηθευτή': it.supplierAfm ?? '',
    'Αρ. παραστατικού': it.invoiceNumber ?? '',
    'Serial': it.serial ?? '',
    'Εγκεκριμένο ποσό (€)': it.amount,
    'Πληρωμένο ποσό (€)': it.paidAmount ?? '',
    'Έγγραφα': it.missingDocs.length === 0 ? 'Πλήρη' : `Λείπουν: ${it.missingDocs.join(', ')}`,
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  ws['!cols'] = [{ wch: 5 }, { wch: 40 }, { wch: 26 }, { wch: 30 }, { wch: 14 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 18 }, { wch: 28 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Δαπάνες')
  XLSX.writeFile(wb, fileName)
}
