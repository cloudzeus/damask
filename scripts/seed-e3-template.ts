/**
 * Εξασφαλίζει τον τύπο δικαιολογητικού + Οδηγό Εντύπου «Ε3» και μαθαίνει στην
 * αναγνώριση δείγματα Ε3 (ΔΕΝ περνά στοιχεία σε πελάτες — μόνο εκπαίδευση).
 *   node --env-file=.env --import tsx scripts/seed-e3-template.ts [δείγμα1.pdf δείγμα2.pdf …]
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { prisma } from '../src/lib/prisma'
import { ensureE3Template } from '../src/lib/tax/e3'

async function main() {
  const { templateId, documentTypeId } = await ensureE3Template()
  console.log('template', templateId, 'docType', documentTypeId)
  for (const sample of process.argv.slice(2)) {
    const doc = await getDocument({ data: new Uint8Array(readFileSync(sample)) }).promise
    let text = ''
    for (let p = 1; p <= Math.min(doc.numPages, 3); p++) {
      const tc = await (await doc.getPage(p)).getTextContent()
      text += tc.items.map(i => ('str' in i ? i.str : '')).join(' ') + ' '
    }
    text = text.replace(/\s+/g, ' ').trim()
    // Σαρωμένο (χωρίς κείμενο): κρατάμε τις λέξεις-κλειδιά του εντύπου για τη μνήμη.
    if (text.length < 80) text = 'Ε3 ΚΑΤΑΣΤΑΣΗ ΟΙΚΟΝΟΜΙΚΩΝ ΣΤΟΙΧΕΙΩΝ ΑΠΟ ΕΠΙΧΕΙΡΗΜΑΤΙΚΗ ΔΡΑΣΤΗΡΙΟΤΗΤΑ ΑΑΔΕ Φορολογικό έτος ΠΙΝΑΚΑΣ Α ΣΤΟΙΧΕΙΑ ΦΟΡΟΛΟΓΟΥΜΕΝΟΥ ΠΙΝΑΚΑΣ Δ ΟΙΚΟΝΟΜΙΚΑ ΔΕΔΟΜΕΝΑ ΕΠΙΧΕΙΡΗΣΕΩΝ Πωλήσεις αγαθών και παροχή υπηρεσιών Κύκλος Εργασιών'
    const fileName = basename(sample)
    const exists = await prisma.documentClassificationExample.findFirst({ where: { documentTypeId, fileName } })
    if (!exists) {
      await prisma.documentClassificationExample.create({ data: { documentTypeId, fileName, snippet: text.slice(0, 1500), wasCorrect: false } })
      console.log('learned example from', fileName)
    }
  }
  await prisma.$disconnect()
}
main()
