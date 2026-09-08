import * as XLSX from 'xlsx'

/**
 * Client-side εξαγωγή επιλέξιμων εταιριών σε Excel (SheetJS). Καλείται από τα
 * 'use client' components — τα δεδομένα είναι δικά μας (όχι untrusted parse),
 * οπότε το γρήγορο μονοπάτι writeFile είναι ασφαλές. Ελληνικά cell values
 * υποστηρίζονται πλήρως.
 */

export type EligibleExportRow = {
  afm: string
  name: string | null
  email: string | null
  phone: string | null
  city: string | null
  regionName: string | null
  regionConfident: boolean
  referrerName?: string | null
  eligiblePrograms: { title: string; fundingRate: number | null }[]
  existingIsCustomer: boolean
}

export function exportEligibleXlsx(rows: EligibleExportRow[], fileName = 'epilexima.xlsx'): void {
  const data = rows.map(r => ({
    'ΑΦΜ': r.afm,
    'Επωνυμία': r.name ?? '',
    'Email': r.email ?? '',
    'Τηλέφωνο': r.phone ?? '',
    'Πόλη': r.city ?? '',
    'Περιφέρεια': r.regionName ? `${r.regionName}${r.regionConfident ? '' : ' (εκτίμηση)'}` : '',
    ...(rows.some(x => x.referrerName != null) ? { 'Εταιρία παραπομπής': r.referrerName ?? '' } : {}),
    'Επιλέξιμα προγράμματα': r.eligiblePrograms.map(p => `${p.title}${p.fundingRate != null ? ` (${p.fundingRate}%)` : ''}`).join(' · '),
    'Ήδη πελάτης': r.existingIsCustomer ? 'ΝΑΙ' : '',
  }))
  const ws = XLSX.utils.json_to_sheet(data)
  // Πλάτη στηλών για ευανάγνωστο αρχείο.
  ws['!cols'] = [{ wch: 12 }, { wch: 32 }, { wch: 26 }, { wch: 14 }, { wch: 16 }, { wch: 22 }, { wch: 24 }, { wch: 48 }, { wch: 12 }]
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Επιλέξιμοι')
  XLSX.writeFile(wb, fileName)
}
