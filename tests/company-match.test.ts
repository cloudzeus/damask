import { describe, it, expect } from 'vitest'
import { isValidAfm, matchCompany } from '@/lib/documents/company-match'

const co = { afm: '094183948', name: 'ΚΙΒΩΤΟΠΟΥΛΟΣ ΜΟΝΟΠΡΟΣΩΠΗ ΑΝΩΝΥΜΗ ΕΤΑΙΡΕΙΑ ΕΛΑΣΤΙΚΩΝ ΕΦΑΡΜΟΓΩΝ' }
const pad = '-'.repeat(50)

describe('company-match', () => {
  it('έλεγχος ΑΦΜ', () => {
    expect(isValidAfm('094183948')).toBe(true)
    expect(isValidAfm('094183947')).toBe(false)
  })
  it('ίδιο ΑΦΜ → MATCH (και με κενά/τελείες)', () => {
    expect(matchCompany(`Βεβαίωση για ΑΦΜ: 094 183 948 ${pad}`, co).status).toBe('MATCH')
  })
  it('άλλο έγκυρο ΑΦΜ με ετικέτα → MISMATCH', () => {
    const r = matchCompany(`ΦΟΡΟΛΟΓΙΚΗ ΕΝΗΜΕΡΟΤΗΤΑ Α.Φ.Μ.: 801014759 ΕΠΩΝΥΜΙΑ: MICROUTOPIA ${pad}`, co)
    expect(r.status).toBe('MISMATCH')
    expect(r.foundAfm).toBe('801014759')
  })
  it('ΕΜΕ με ΑΦΜ εργαζομένων αλλά και της εταιρίας → MATCH', () => {
    expect(matchCompany(`ΑΦΜ εργοδότη 094183948 · ΑΦΜ εργαζόμενου 069325226 ${pad}`, co).status).toBe('MATCH')
  })
  it('χωρίς ΑΦΜ αλλά με επωνυμία → MATCH· χωρίς τίποτα → UNKNOWN', () => {
    expect(matchCompany(`Η εταιρεία ΚΙΒΩΤΟΠΟΥΛΟΣ ελαστικών εφαρμογών ${pad}`, co).status).toBe('MATCH')
    expect(matchCompany(`Γενικό κείμενο χωρίς στοιχεία επιχείρησης ${pad}`, co).status).toBe('UNKNOWN')
  })
})
