import { prisma } from '@/lib/prisma'
import { geminiGenerate, type GeminiPart } from '@/lib/gemini'
import { bunnyDownload } from '@/lib/bunny-storage'

/**
 * (Plain module.) Συμπληρωματικές πηγές προγράμματος (FAQ, τροποποιήσεις, διευκρινίσεις, σημειώσεις).
 *  • digestReference: διαβάζει την πηγή μία φορά (αρχείο/URL/σημείωση) → σύνοψη κανόνων (Gemini).
 *  • getProgramKnowledge: συμπυκνωμένο μπλοκ κειμένου για τα prompts κάθε λειτουργίας AI του προγράμματος.
 */

const INLINE_MAX = 18 * 1024 * 1024
const RAW_TEXT_MAX = 120_000

/** HTML → καθαρό κείμενο (χωρίς scripts/styles/nav). */
function htmlToText(html: string): string {
  return html
    .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim()
}

async function sourceParts(ref: { kind: string; url: string | null; storageKey: string | null; mimeType: string | null; fileName: string | null }): Promise<GeminiPart[]> {
  if (ref.kind === 'FILE' && ref.storageKey) {
    const buf = await bunnyDownload(ref.storageKey)
    const mt = (ref.mimeType ?? '').toLowerCase()
    const name = (ref.fileName ?? '').toLowerCase()
    if (mt.includes('pdf') || name.endsWith('.pdf') || mt.startsWith('image/')) {
      if (buf.length > INLINE_MAX) throw new Error('Το αρχείο είναι πολύ μεγάλο για ανάγνωση (όριο 18 MB).')
      return [{ inlineData: { data: buf.toString('base64'), mimeType: mt.startsWith('image/') ? mt : 'application/pdf' } }]
    }
    if (name.endsWith('.docx') || mt.includes('wordprocessing')) {
      const mammoth = await import('mammoth')
      const { value } = await mammoth.extractRawText({ buffer: buf })
      return [{ text: value.slice(0, RAW_TEXT_MAX) }]
    }
    return [{ text: buf.toString('utf8').slice(0, RAW_TEXT_MAX) }]
  }
  if (ref.kind === 'URL' && ref.url) {
    const res = await fetch(ref.url, { signal: AbortSignal.timeout(30_000), headers: { 'User-Agent': 'Mozilla/5.0 (WWA reference reader)' }, redirect: 'follow' })
    if (!res.ok) throw new Error(`Η σελίδα δεν άνοιξε (HTTP ${res.status}).`)
    const ct = res.headers.get('content-type') ?? ''
    const buf = Buffer.from(await res.arrayBuffer())
    if (ct.includes('pdf') || buf.subarray(0, 4).toString('latin1') === '%PDF') {
      if (buf.length > INLINE_MAX) throw new Error('Το PDF του συνδέσμου είναι πολύ μεγάλο (όριο 18 MB).')
      return [{ inlineData: { data: buf.toString('base64'), mimeType: 'application/pdf' } }]
    }
    const text = ct.includes('html') || /<html/i.test(buf.subarray(0, 2000).toString('utf8')) ? htmlToText(buf.toString('utf8')) : buf.toString('utf8')
    if (text.length < 40) throw new Error('Η σελίδα δεν έχει αναγνώσιμο κείμενο.')
    return [{ text: text.slice(0, RAW_TEXT_MAX) }]
  }
  return []
}

/** Διαβάζει την πηγή και αποθηκεύει σύνοψη κανόνων (status READY/ERROR). */
export async function digestReference(referenceId: string): Promise<void> {
  const ref = await prisma.programReference.findUniqueOrThrow({
    where: { id: referenceId },
    select: { id: true, kind: true, title: true, url: true, storageKey: true, mimeType: true, fileName: true, note: true, createdById: true, program: { select: { title: true } } },
  })
  try {
    if (ref.kind === 'NOTE') {
      await prisma.programReference.update({ where: { id: ref.id }, data: { status: 'READY', digest: null, error: null } })
      return
    }
    const parts = await sourceParts(ref)
    const res = await geminiGenerate({
      parts: [
        ...parts,
        { text: `Πρόγραμμα: ${ref.program.title}\nΠηγή: ${ref.title}${ref.url ? ` (${ref.url})` : ''}${ref.note ? `\nΤι ζητά να προσέξουμε ο χρήστης: ${ref.note}` : ''}` },
      ],
      systemInstruction: [
        'Είσαι σύμβουλος ΕΣΠΑ. Διαβάζεις ΣΥΜΠΛΗΡΩΜΑΤΙΚΗ πηγή ενός προγράμματος (FAQ, τροποποίηση, ΚΥΑ, διευκρίνιση, οδηγό υποβολής κ.λπ.).',
        'Γράψε συμπυκνωμένη ΣΥΝΟΨΗ ΚΑΝΟΝΩΝ στα ελληνικά, σε κουκκίδες, ΜΟΝΟ με ό,τι επηρεάζει: επιλεξιμότητα επιχειρήσεων, επιλέξιμες/μη επιλέξιμες δαπάνες και όρια, δικαιολογητικά, προθεσμίες/ημερομηνίες, βαθμολόγηση, αλλαγές σε σχέση με την αρχική πρόσκληση.',
        'Κράτα ακριβείς αριθμούς, ποσοστά, ημερομηνίες, κωδικούς ΚΑΔ και παραπομπές (ενότητα/σελίδα/ερώτηση). Αν η πηγή τροποποιεί κάτι, γράψε ρητά «ΤΡΟΠΟΠΟΙΕΙΤΑΙ: …».',
        'Δώσε έμφαση σε ό,τι ζητά ο χρήστης να προσέξουμε. Χωρίς εισαγωγές/σχόλια — έως ~900 λέξεις.',
      ].join('\n'),
      temperature: 0.1,
      maxOutputTokens: 12000,
      scope: 'OTHER',
      refType: 'program-reference',
      refId: ref.id,
      userId: ref.createdById,
    })
    const digest = res.text.trim()
    if (!digest) throw new Error('Η AI δεν επέστρεψε σύνοψη.')
    await prisma.programReference.update({ where: { id: ref.id }, data: { status: 'READY', digest: digest.slice(0, 20_000), error: null } })
  } catch (err) {
    await prisma.programReference.update({
      where: { id: ref.id },
      data: { status: 'ERROR', error: (err instanceof Error ? err.message : String(err)).slice(0, 400) },
    })
  }
}

/**
 * Γνώση προγράμματος για τα prompts: ενεργές πηγές (σημείωση χρήστη + σύνοψη), νεότερες πρώτα.
 * Κενό string όταν δεν υπάρχουν — οι καλούντες απλώς το παραλείπουν.
 */
export async function getProgramKnowledge(programId: string, maxChars = 16_000): Promise<string> {
  const refs = await prisma.programReference.findMany({
    where: { programId, active: true, OR: [{ status: 'READY' }, { kind: 'NOTE' }] },
    orderBy: { createdAt: 'desc' },
    select: { kind: true, title: true, url: true, note: true, digest: true, createdAt: true },
  })
  if (!refs.length) return ''
  const blocks: string[] = []
  let used = 0
  refs.forEach((r, i) => {
    const head = `[${i + 1}] ${r.title}${r.url ? ` — ${r.url}` : ''} (${r.createdAt.toISOString().slice(0, 10)})`
    const body = [r.note ? `Οδηγία χρήστη: ${r.note}` : null, r.digest ? `Σύνοψη: ${r.digest}` : null].filter(Boolean).join('\n')
    const block = `${head}\n${body}`
    if (used + block.length > maxChars) return
    blocks.push(block)
    used += block.length
  })
  return [
    'ΣΥΜΠΛΗΡΩΜΑΤΙΚΕΣ ΠΗΓΕΣ & ΔΙΕΥΚΡΙΝΙΣΕΙΣ ΤΟΥ ΠΡΟΓΡΑΜΜΑΤΟΣ (προστέθηκαν από την ομάδα — όπου διαφωνούν με τον αρχικό οδηγό, ΥΠΕΡΙΣΧΥΟΥΝ· οι οδηγίες χρήστη δείχνουν τι να προσέξεις):',
    ...blocks,
  ].join('\n\n')
}
