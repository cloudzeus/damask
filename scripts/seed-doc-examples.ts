/**
 * Μαθαίνει δείγματα εγγράφων στην έξυπνη αναγνώριση δικαιολογητικών (ΜΟΝΟ εκπαίδευση — καμία καταχώριση σε πελάτη).
 *   node --env-file=.env --import tsx scripts/seed-doc-examples.ts
 *     → ανοίγει παράθυρα: διάλεξε τύπο από λίστα και μετά τα PDF από το Finder.
 *   ή χωρίς παράθυρα: … seed-doc-examples.ts "Όνομα τύπου" δείγμα.pdf [δείγμα2.pdf …]
 * π.χ. ανακοινώσεις ΓΕΜΗ εκλογής ΔΣ → «Δικαιολογητικά νόμιμης υπόστασης και εκπροσώπησης».
 * Σαρωμένα PDF ή PDF με «σπασμένη» ελληνική γραμματοσειρά (χωρίς αναγνώσιμο κείμενο) διαβάζονται με Gemini.
 */

const osa = (script: string) => {
  try { return execFileSync('osascript', ['-e', script], { encoding: 'utf8' }).trim() } catch { return '' } // Άκυρο → κενό
}
const q = (x: string) => `"${x.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`

/** Λίστα τύπων σε παράθυρο του macOS. */
function pickType(names: string[]): string | null {
  const r = osa(`choose from list {${names.map(q).join(', ')}} with title "Εκπαίδευση αναγνώρισης" with prompt "Σε ποιον τύπο ανήκουν τα δείγματα;" OK button name "Επόμενο" cancel button name "Άκυρο"`)
  return r && r !== 'false' ? r : null
}

/** Επιλογή ενός ή περισσότερων PDF από το Finder. */
function pickFiles(): string[] {
  const r = osa(`set fs to choose file with prompt "Διάλεξε δείγματα (PDF)" of type {"com.adobe.pdf"} default location (path to downloads folder) with multiple selections allowed
set out to ""
repeat with f in fs
  set out to out & POSIX path of f & linefeed
end repeat
return out`)
  return r.split('\n').map(x => x.trim()).filter(Boolean)
}

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
import { readFileSync, existsSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { basename } from 'node:path'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { prisma } from '../src/lib/prisma'
import { geminiGenerate } from '../src/lib/gemini'

async function main() {
  const types = await prisma.documentType.findMany({ where: { active: true }, select: { id: true, name: true }, orderBy: { name: 'asc' } })
  const args = process.argv.slice(2)
  // Χωρίς ορίσματα (ή με λάθος όνομα τύπου) → παράθυρα επιλογής του macOS.
  let typeName = args[0] && types.some(t => t.name === args[0]) ? args[0] : null
  let samples = typeName ? args.slice(1) : args.filter(a => existsSync(a))
  if (!typeName) {
    typeName = pickType(types.map(t => t.name))
    if (!typeName) { console.log('Ακυρώθηκε.'); process.exit(0) }
  }
  if (!samples.length) {
    samples = pickFiles()
    if (!samples.length) { console.log('Ακυρώθηκε.'); process.exit(0) }
  }
  const missing = samples.filter(f => !existsSync(f))
  if (missing.length) { console.error(`Δεν βρέθηκαν τα αρχεία: ${missing.join(', ')}`); process.exit(1) }
  const type = types.find(t => t.name === typeName)!
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
