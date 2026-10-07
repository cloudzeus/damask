/**
 * Εξασφαλίζει τον τύπο δικαιολογητικού + Οδηγό Εντύπου «ΕΜΕ» και (προαιρετικά)
 * μαθαίνει στην αναγνώριση ένα δείγμα ΕΜΕ PDF ως παράδειγμα.
 *   node --env-file=.env --import tsx scripts/seed-eme-template.ts [δείγμα.pdf]
 */
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { prisma } from '../src/lib/prisma'
import { ensureEmeTemplate } from '../src/lib/tax/eme'

async function main() {
  const { templateId, documentTypeId } = await ensureEmeTemplate()
  console.log('template', templateId, 'docType', documentTypeId)
  const sample = process.argv[2]
  if (sample) {
    const doc = await getDocument({ data: new Uint8Array(readFileSync(sample)) }).promise
    let text = ''
    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) {
      const tc = await (await doc.getPage(p)).getTextContent()
      text += tc.items.map(i => ('str' in i ? i.str : '')).join(' ') + '\n'
    }
    const fileName = basename(sample)
    const exists = await prisma.documentClassificationExample.findFirst({ where: { documentTypeId, fileName } })
    if (!exists) {
      await prisma.documentClassificationExample.create({ data: { documentTypeId, fileName, snippet: text.replace(/\s+/g, ' ').slice(0, 1500), wasCorrect: false } })
      console.log('learned example from', fileName)
    }
  }
  await prisma.$disconnect()
}
main()
