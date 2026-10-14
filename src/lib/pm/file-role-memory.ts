import { prisma } from '@/lib/prisma'
import { classifyImplDoc, foldText, type ClassifyInput, type ImplDocRole } from '@/lib/pm/impl-doc-classify'

/**
 * (Plain module.) Μνήμη ρόλων εγγράφων που ΜΑΘΑΙΝΕΙ: κάθε επιτυχής καταχώριση (AUTO) ή επιλογή χρήστη (USER) κρατά το
 * «σχήμα» ονόματος/φακέλου → ρόλος. Αναγνώριση: κανόνες (γνώση) → μνήμη (όταν οι κανόνες δεν είναι σίγουροι ή ο χρήστης
 * έχει διορθώσει ίδιο σχήμα) → αλλιώς «Λοιπό». Κοινή για όλο το γραφείο, ώστε κάθε έργο να βοηθά τα επόμενα.
 */

/** «Πληρωμή (2) - 10.000.pdf» → «πληρωμη # #» (κάθε αριθμός → #, ώστε όμοια αρχεία = ίδιο σχήμα). */
export function namePattern(fileName: string): string {
  return foldText(fileName.replace(/\.[a-z0-9]{1,5}$/i, '').replace(/\d[\d.,]*/g, ' NUM ')).replace(/num/g, '#').replace(/\s+/g, ' ').trim().slice(0, 120)
}
/** Οι 2 τελευταίοι φάκελοι (π.χ. «# netscope / τδα #») — ο «τύπος» θέσης στον φάκελο του γραφείου. */
export function folderPattern(relPath: string | null | undefined): string {
  const parts = (relPath ?? '').replace(/\\/g, '/').split('/').slice(0, -1)
  return parts.slice(-2).map(p => foldText(p.replace(/\d[\d.,]*/g, ' NUM ')).replace(/num/g, '#').replace(/\s+/g, ' ').trim()).join(' / ').slice(0, 120)
}

/** Λέξεις σχήματος (για ομοιότητα). */
const words = (s: string) => new Set(s.split(/[^a-zα-ω#]+/).filter(w => w.length > 1))
function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0
  let hit = 0
  for (const w of a) if (b.has(w)) hit++
  return hit / (a.size + b.size - hit)
}

export type RoleDecision = { role: ImplDocRole; source: 'user' | 'rules' | 'memory' | 'none'; confidence: number }

/** Αναγνώριση ρόλου: διόρθωση χρήστη για ίδιο σχήμα → κανόνες → παρόμοια παραδείγματα μνήμης. */
export async function classifyWithMemory(input: ClassifyInput): Promise<RoleDecision> {
  const pattern = namePattern(input.fileName)
  const folder = folderPattern(input.relPath)
  const exact = await prisma.fileRoleExample.findMany({ where: { pattern }, orderBy: [{ source: 'desc' }, { hits: 'desc' }], take: 5 })
  // Ο χρήστης έχει ήδη αποφασίσει για ίδιο σχήμα ονόματος (ίδιος φάκελος ή όχι) → υπερισχύει.
  const userSame = exact.find(e => e.source === 'USER' && (e.folder === folder || !e.folder))
  if (userSame) return { role: userSame.role as ImplDocRole, source: 'user', confidence: 0.98 }

  const rule = classifyImplDoc(input)
  // «Αδύναμες» απαντήσεις κανόνων (γενική κατηγορία ή μόνο από κατάληξη) → η μνήμη μπορεί να τις εξειδικεύσει.
  const weak = rule === 'OTHER' || rule === 'PAYROLL_OTHER' || (rule === 'PHOTO' && !/φωτο|foto|photo|img|^sn|signal|picture/.test(foldText(`${input.relPath ?? ''} ${input.fileName}`)))
  if (!weak) return { role: rule, source: 'rules', confidence: 0.9 }

  // Πλησιέστερο παράδειγμα (σχήμα ονόματος + φάκελος).
  const exactHit = exact.find(e => e.folder === folder) ?? exact[0]
  if (exactHit) return { role: exactHit.role as ImplDocRole, source: 'memory', confidence: exactHit.source === 'USER' ? 0.95 : 0.85 }
  const w = words(`${pattern} ${folder}`)
  const pool = await prisma.fileRoleExample.findMany({ where: { OR: [{ folder }, { source: 'USER' }] }, orderBy: { hits: 'desc' }, take: 300 })
  let best: { role: string; s: number } | null = null
  for (const e of pool) {
    const s = jaccard(w, words(`${e.pattern} ${e.folder}`)) + (e.source === 'USER' ? 0.1 : 0)
    if (!best || s > best.s) best = { role: e.role, s }
  }
  if (best && best.s >= 0.55) return { role: best.role as ImplDocRole, source: 'memory', confidence: Math.min(0.9, best.s) }
  return rule === 'OTHER' ? { role: 'OTHER', source: 'none', confidence: 0 } : { role: rule, source: 'rules', confidence: 0.6 }
}

/** Καταγραφή παραδείγματος (AUTO από επιτυχή καταχώριση, USER από επιλογή/διόρθωση). Ποτέ δεν αποτυγχάνει. */
export async function learnFileRole(input: { fileName: string; relPath?: string | null; role: ImplDocRole; source: 'AUTO' | 'USER' }): Promise<void> {
  try {
    if (input.role === 'OTHER' || input.role === 'APPROVAL') return
    const pattern = namePattern(input.fileName)
    const folder = folderPattern(input.relPath)
    if (!pattern) return
    // Διόρθωση χρήστη: τα άλλα AUTO παραδείγματα του ίδιου σχήματος με άλλον ρόλο παύουν να μετρούν.
    if (input.source === 'USER') await prisma.fileRoleExample.deleteMany({ where: { pattern, folder, role: { not: input.role }, source: 'AUTO' } })
    await prisma.fileRoleExample.upsert({
      where: { pattern_folder_role: { pattern, folder, role: input.role } },
      create: { pattern, folder, role: input.role, source: input.source, sample: input.fileName.slice(0, 200) },
      update: { hits: { increment: 1 }, ...(input.source === 'USER' ? { source: 'USER' } : {}) },
    })
  } catch (err) { console.error('[file-role-memory] learn απέτυχε', err) }
}
