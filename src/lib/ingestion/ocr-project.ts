import type { ExtractedDocument } from '@/lib/ocr/schema'
import type { IngestionTarget } from './target'
import type { SourceRecord } from './normalized'

function str(v: unknown): string { return v == null ? '' : String(v) }

/**
 * Προβάλλει ένα δομημένο ExtractedDocument (OCR) σε flat SourceRecord[] —
 * το ενδιάμεσο σχήμα που καταναλώνει το κοινό pipeline map/validate/commit
 * (ίδιο με Excel/API sources). Καθαρή συνάρτηση: χωρίς DB, χωρίς AI calls.
 *
 * project 'lines' → μία εγγραφή ανά γραμμή τιμολογίου (προϊόντα).
 * project 'party' → μία εγγραφή από τον εκδότη (issuer) του παραστατικού
 *   (συναλλασσόμενος/προμηθευτής, sodtype 12). issuer είναι πάντα παρόν
 *   (μη-nullable) στο ExtractedDocument schema, οπότε δεν χρειάζεται guard.
 */
export function projectOcr(doc: ExtractedDocument, target: IngestionTarget): { sourceKeys: { key: string; sample?: string }[]; records: SourceRecord[] } {
  const projection = target.ocr?.project ?? 'lines'

  if (projection === 'party') {
    const p = doc.issuer
    const rec: SourceRecord = {
      name: str(p.name), afm: str(p.afm), address: str(p.address),
      phone: str(p.phones[0] ?? ''), email: str(p.emails[0] ?? ''), website: str(p.website),
      sodtype: '12',
    }
    const keys = Object.keys(rec)
    return { sourceKeys: keys.map(k => ({ key: k, sample: rec[k] || undefined })), records: [rec] }
  }

  const records: SourceRecord[] = doc.lines.map(l => ({
    name: str(l.description), quantity: str(l.quantity), unitPrice: str(l.unitPrice),
    vatPct: str(l.vatPct), total: str(l.total),
  }))
  const keys = ['name', 'quantity', 'unitPrice', 'vatPct', 'total']
  const sample = records[0]
  return { sourceKeys: keys.map(k => ({ key: k, sample: sample?.[k] || undefined })), records }
}
