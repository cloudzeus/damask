/**
 * Εξασφαλίζει τύπο + Οδηγό Εντύπου «Δήλωση ΜΜΕ» και μαθαίνει δείγματα στην αναγνώριση
 * (ΜΟΝΟ εκπαίδευση — καμία καταχώριση σε πελάτη).
 *   node --env-file=.env --import tsx scripts/seed-mme-template.ts [δείγμα.pdf …]
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { prisma } from '../src/lib/prisma'
import { ensureMmeTemplate } from '../src/lib/tax/mme'

// Τα δείγματα είναι συνήθως σαρωμένα με ψηφιακή βεβαίωση gov.gr — το κείμενο-κλειδί του εντύπου.
const KEYWORDS = 'ΥΠΟΔΕΙΓΜΑ ΔΗΛΩΣΗΣ ΣΤΟΙΧΕΙΑ ΣΧΕΤΙΚΑ ΜΕ ΤΗΝ ΙΔΙΟΤΗΤΑ ΜΜΕ Ακριβή στοιχεία της επιχείρησης Τύπος της επιχείρησης Ανεξάρτητη επιχείρηση Συνεργαζόμενη Συνδεδεμένη Στοιχεία για τον προσδιορισμό της κατηγορίας επιχείρησης Παράρτημα Ι ΕΚ 651/2014 Περίοδος αναφοράς Αριθμός απασχολουμένων (ΕΜΕ) Κύκλος εργασιών Σύνολο ισολογισμού σε χιλιάδες ευρώ'

async function main() {
  const { templateId, documentTypeId } = await ensureMmeTemplate()
  console.log('template', templateId, 'docType', documentTypeId)
  for (const sample of process.argv.slice(2)) {
    const doc = await getDocument({ data: new Uint8Array(readFileSync(sample)) }).promise
    let text = ''
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) text += (await (await doc.getPage(p)).getTextContent()).items.map(i => ('str' in i ? i.str : '')).join(' ') + ' '
    const fileName = basename(sample)
    if (await prisma.documentClassificationExample.findFirst({ where: { documentTypeId, fileName } })) continue
    await prisma.documentClassificationExample.create({ data: { documentTypeId, fileName, snippet: `${KEYWORDS} ${text.replace(/\s+/g, ' ')}`.slice(0, 1500), wasCorrect: false } })
    console.log('learned example from', fileName)
  }
  await prisma.$disconnect()
}
main()
