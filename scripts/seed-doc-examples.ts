/**
 * Μαθαίνει δείγματα εγγράφων στην έξυπνη αναγνώριση δικαιολογητικών (ΜΟΝΟ εκπαίδευση — καμία καταχώριση σε πελάτη).
 *   node --env-file=.env --import tsx scripts/seed-doc-examples.ts "<όνομα τύπου>" δείγμα.pdf [δείγμα2.pdf …]
 * π.χ. ανακοινώσεις ΓΕΜΗ εκλογής ΔΣ → «Δικαιολογητικά νόμιμης υπόστασης και εκπροσώπησης».
 * Σαρωμένα PDF ή PDF με «σπασμένη» ελληνική γραμματοσειρά (χωρίς αναγνώσιμο κείμενο) διαβάζονται με Gemini.
 */

/** Αναγνώσιμο ελληνικό/λατινικό κείμενο; (όχι σύμβολα από σπασμένες γραμματοσειρές) */
const readable = (t: string) => (t.match(/[Α-Ωα-ωάέήίόύώϊϋΐΰA-Za-z]/g) ?? []).length >= 150

async function readWithAi(file: string): Promise<string> {
  const res = await geminiGenerate({
    parts: [
      { inlineData: { data: readFileSync(file).toString('base64'), mimeType: 'application/pdf' } },
      { text: 'Μετέγραψε αυτούσιο το κείμενο των 2 πρώτων σελίδων του εγγράφου (χωρίς σχόλια, χωρίς markdown).' },
    ],
    scope: 'OCR_VISION',
    refType: 'seed-doc-example',
    maxOutputTokens: 2000,
  })
  return res.text
}
import { readFileSync } from 'node:fs'
import { basename } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { prisma } from '../src/lib/prisma'
import { geminiGenerate } from '../src/lib/gemini'

async function main() {
  const [typeName, ...samples] = process.argv.slice(2)
  const type = typeName ? await prisma.documentType.findUnique({ where: { name: typeName }, select: { id: true } }) : null
  if (!type || !samples.length) {
    const types = await prisma.documentType.findMany({ where: { active: true }, select: { name: true }, orderBy: { name: 'asc' } })
    console.error(!type
      ? `Δεν βρέθηκε τύπος «${typeName ?? ''}». Γράψε το όνομα ακριβώς όπως εδώ:\n${types.map(t => `  ${t.name}`).join('\n')}`
      : 'Λείπει το αρχείο-δείγμα (π.χ. ~/Downloads/ανακοίνωση.pdf).')
    console.error('\nΧρήση: node --env-file=.env --import tsx scripts/seed-doc-examples.ts "Όνομα τύπου" αρχείο.pdf [αρχείο2.pdf …]')
    process.exit(1)
  }
  const { existsSync } = await import('node:fs')
  const missing = samples.filter(f => !existsSync(f))
  if (missing.length) { console.error(`Δεν βρέθηκαν τα αρχεία: ${missing.join(', ')}`); process.exit(1) }
  for (const sample of samples) {
    const doc = await getDocument({ data: new Uint8Array(readFileSync(sample)) }).promise
    let text = ''
    for (let p = 1; p <= Math.min(doc.numPages, 2); p++) text += (await (await doc.getPage(p)).getTextContent()).items.map(i => ('str' in i ? i.str : '')).join(' ') + ' '
    if (!readable(text)) {
      console.log('χωρίς αναγνώσιμο κείμενο → ανάγνωση με AI:', basename(sample))
      text = await readWithAi(sample)
    }
    const fileName = basename(sample)
    if (await prisma.documentClassificationExample.findFirst({ where: { documentTypeId: type.id, fileName } })) continue
    await prisma.documentClassificationExample.create({ data: { documentTypeId: type.id, fileName, snippet: text.replace(/\s+/g, ' ').trim().slice(0, 1500), wasCorrect: false } })
    console.log('learned', fileName, '→', typeName)
  }
  await prisma.$disconnect()
}
main()
