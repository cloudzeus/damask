import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { bunnyDownload } from '@/lib/bunny-storage'
import { classifyDocumentCore, type SmartClassifyResult } from '@/lib/documents/smart-classify-core'
import { isReadableText } from '@/lib/documents/text-quality'
import { AiQuotaError, isQuotaMessage } from '@/lib/ai/quota'
import { NOT_A_DOC, RETRY_DELAYS_MS, AUTO_SAVE_MIN_CONFIDENCE } from './rules'

/**
 * (Plain module — τρέχει στον worker, χωρίς session.) Αναγνώριση αρχείων μαζικής εισαγωγής στο παρασκήνιο:
 *  1. κείμενο: κρυφή μνήμη ανά hash → ψηφιακό κείμενο PDF (αν διαβάζεται) → OCR (Gemini) → Word/Excel·
 *  2. αναγνώριση (μνήμη/AI) με τη διαδρομή φακέλου ως ένδειξη·
 *  3. προορισμός + αυτόματη αποθήκευση των ΒΕΒΑΙΩΝ δικαιολογητικών (απόφαση χρήστη 14/10), αλλιώς «Για έλεγχο»·
 *  4. όριο AI / διακοπή → «σε αναμονή» με αυξανόμενη αναμονή — ποτέ σιωπηλά «αναγνώριστο».
 */

export const QUEUE_IMPORT_RECOGNIZE = 'import-recognize'

/** «Σκούντημα» του worker (π.χ. μόλις ανέβει αρχείο) — fire-and-forget. */
export function kickImportSweep(): void {
  import('@/lib/queue')
    .then(({ startBoss }) => startBoss())
    .then(boss => boss.send(QUEUE_IMPORT_RECOGNIZE, {}, { singletonKey: 'sweep', singletonSeconds: 5 }))
    .catch(err => console.error('[import] enqueue απέτυχε', err))
}

async function cachedText(hash: string | null): Promise<string | null> {
  if (!hash) return null
  const row = await prisma.documentTextCache.findUnique({ where: { hash }, select: { text: true } })
  return row?.text ?? null
}
async function cacheText(hash: string | null, text: string, source: 'pdf-text' | 'ocr' | 'office') {
  const t = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').slice(0, 120_000)
  if (!hash || !t.trim()) return
  await prisma.documentTextCache.upsert({ where: { hash }, create: { hash, source, text: t }, update: { source, text: t, usedAt: new Date() } }).catch(() => {})
}

async function pdfText(buf: Buffer, maxPages = 2): Promise<string> {
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true }).promise
  let text = ''
  for (let i = 1; i <= Math.min(doc.numPages, maxPages); i++) {
    const c = await (await doc.getPage(i)).getTextContent()
    text += c.items.map(x => ('str' in x ? x.str : '')).join(' ') + '\n'
  }
  return text
}

/** Κείμενο εγγράφου στον server. Σφάλμα ορίου AI → πετιέται (για επανάληψη). */
export async function extractTextServer(buf: Buffer, mime: string, name: string, hash: string | null, userId: string | null): Promise<string> {
  const hit = await cachedText(hash)
  if (hit) return hit
  const lower = name.toLowerCase()
  if (mime === 'application/pdf' || lower.endsWith('.pdf')) {
    const text = await pdfText(buf).catch(() => '')
    if (isReadableText(text)) { await cacheText(hash, text.slice(0, 60_000), 'pdf-text'); return text.slice(0, 60_000) }
    if (buf.length > 15 * 1024 * 1024) return text // πολύ μεγάλο για OCR — αναγνώριση από το όνομα
    const { extractDocument } = await import('@/lib/ocr/extract')
    // Το Gemini δέχεται και PDF ως inlineData (σαρωμένα έγγραφα).
    const r = await extractDocument({ images: [{ base64: buf.toString('base64'), mimeType: 'application/pdf' as 'image/png' }], docType: 'auto', userId: userId ?? undefined, refId: 'import' })
    const out = JSON.stringify(r.data).slice(0, 3000)
    await cacheText(hash, out, 'ocr')
    return out
  }
  if (/^image\//.test(mime)) {
    const { extractDocument } = await import('@/lib/ocr/extract')
    const r = await extractDocument({ images: [{ base64: buf.toString('base64'), mimeType: mime as 'image/png' }], docType: 'auto', userId: userId ?? undefined, refId: 'import' })
    const out = JSON.stringify(r.data).slice(0, 3000)
    await cacheText(hash, out, 'ocr')
    return out
  }
  if (lower.endsWith('.docx')) {
    const mammoth = (await import('mammoth')).default
    const out = String((await mammoth.extractRawText({ buffer: buf })).value ?? '').slice(0, 60_000)
    await cacheText(hash, out, 'office')
    return out
  }
  if (/\.(xlsx|xlsm|xls|csv|ods)$/.test(lower)) {
    const XLSX = await import('xlsx')
    const wb = XLSX.read(buf, { type: 'buffer' })
    const out = wb.SheetNames.map(n => `# ${n}\n${XLSX.utils.sheet_to_csv(wb.Sheets[n])}`).join('\n\n').slice(0, 60_000)
    await cacheText(hash, out, 'office')
    return out
  }
  if (/\.(txt|md|json|xml)$/.test(lower)) return buf.toString('utf8').slice(0, 60_000)
  return ''
}

function retryKind(msg: string): 'minute' | 'day' | 'network' | null {
  const q = isQuotaMessage(msg)
  if (q) return q
  return /failed to fetch|network|fetch failed|ECONNRESET|ETIMEDOUT|timeout|socket|HTTP 5\d\d|UNAVAILABLE|high demand/i.test(msg) ? 'network' : null
}

type ItemRow = NonNullable<Awaited<ReturnType<typeof loadItem>>>
async function loadItem(id: string) {
  return prisma.importItem.findUnique({ where: { id }, include: { batch: { select: { createdById: true } } } })
}

/**
 * «Δεν αναγνωρίστηκε ως κάτι συγκεκριμένο»: στη μαζική εισαγωγή → «για έλεγχο» (στα αρχεία πελάτη)· για ΕΙΣΕΡΧΟΜΕΝΑ από
 * αρχεία πελάτη/email/portal το πρωτότυπο είναι ήδη αρχειοθετημένο → ήσυχη παράλειψη (κανένας θόρυβος στον χρήστη).
 */
function notRecognized(item: { source: string }): Prisma.ImportItemUpdateInput {
  if (item.source === 'UPLOAD') return { phase: 'REVIEW', dest: 'files' }
  const where = item.source === 'EMAIL' ? 'στα αρχεία πελάτη (από email)' : item.source === 'PORTAL' ? 'εκεί που το ανέβασε ο πελάτης' : 'στα αρχεία πελάτη'
  return { phase: 'SKIPPED', dest: 'files', resultNote: `Δεν είναι δικαιολογητικό ή έγγραφο έργου — παραμένει ${where}.` }
}

/** Αναγνώριση ενός αρχείου + αυτόματη αποθήκευση αν είναι βέβαιο. */
export async function recognizeItem(id: string): Promise<void> {
  // Η έκδοση καταλόγου με την οποία αναγνωρίζεται (αλλαγή τύπων/Οδηγών ⇒ ξαναεξέταση — βλ. catalog.ts).
  const { catalogVersion } = await import('./catalog')
  const claimed = await prisma.importItem.updateMany({ where: { id, phase: { in: ['QUEUED', 'WAITING'] } }, data: { phase: 'RECOGNIZING', catalogVersion: await catalogVersion() } })
  if (!claimed.count) return
  const item = (await loadItem(id))!
  try {
    if (NOT_A_DOC.test(item.fileName)) {
      await prisma.importItem.update({ where: { id }, data: notRecognized(item) })
      return
    }
    // Ίδιο αρχείο ήδη σε δικαιολογητικά/αρχεία/έργα του πελάτη (π.χ. αποθηκεύτηκε στο μεταξύ) → δεν χρειάζεται τίποτα.
    const { findExisting } = await import('./existing')
    const existing = await findExisting(item.trdrId, item.hash, { ignoreKey: item.sourceKey })
    if (existing) {
      await prisma.importItem.update({ where: { id }, data: { phase: 'SKIPPED', dest: existing.where === 'dossier' ? 'dossier' : 'files', resultNote: existing.note } })
      return
    }
    if (!item.storageKey) throw new Error('Το αρχείο δεν έχει ανέβει.')
    const buf = await bunnyDownload(item.storageKey)
    // Γνώση γραφείου (χωρίς AI): έγγραφα ΥΛΟΠΟΙΗΣΗΣ (πληρωμή/εξτρέ, βεβαίωση, λογιστικά, φωτογραφίες, μισθοδοσία…) →
    // κατευθείαν στο εγκεκριμένο έργο του πελάτη + αυτόματη καταχώριση.
    if (await routeImplementation(item, buf)) return
    const text = await extractTextServer(buf, item.mimeType, item.fileName, item.hash, item.batch.createdById)
    const res = await classifyDocumentCore({ trdrId: item.trdrId, fileName: item.relPath || item.fileName, text })
    if (!res.ok) throw new Error(res.message)
    await decide(item, res.result, text, buf)
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    // Κλειδί/λογαριασμός AI μπλοκαρισμένος (403) — δεν περνά με αναμονή· «Ξανά» αφού διορθωθεί.
    if (/HTTP 40[13]|PERMISSION_DENIED|API key not valid|denied access/i.test(msg)) {
      await prisma.importItem.update({ where: { id }, data: { phase: 'FAILED', waitReason: null, nextAttemptAt: null, error: 'Η υπηρεσία AI (OpenRouter) αρνείται την πρόσβαση — ελέγξτε το κλειδί/λογαριασμό στις Ρυθμίσεις › Διασυνδέσεις και πατήστε «Ξανά».' } })
      return
    }
    const kind = err instanceof AiQuotaError ? err.kind === 'day' ? 'day' : 'minute' : retryKind(msg)
    if (!kind) {
      await prisma.importItem.update({ where: { id }, data: { ...notRecognized(item), error: item.source === 'UPLOAD' ? msg.slice(0, 300) : null } })
      return
    }
    const n = item.attempts
    if (n >= RETRY_DELAYS_MS.length) {
      await prisma.importItem.update({ where: { id }, data: { phase: 'FAILED', attempts: n + 1, waitReason: null, nextAttemptAt: null, error: 'Η αναγνώριση δεν ολοκληρώθηκε (όριο AI/σύνδεση) — πατήστε «Ξανά».' } })
      return
    }
    const until = err instanceof AiQuotaError && err.retryAt ? err.retryAt : new Date(Date.now() + (kind === 'day' ? 30 * 60_000 : RETRY_DELAYS_MS[n]))
    await prisma.importItem.update({
      where: { id },
      data: { phase: 'WAITING', attempts: n + 1, nextAttemptAt: until, error: null, waitReason: kind === 'day' ? 'εξαντλήθηκε το ημερήσιο όριο του AI' : kind === 'minute' ? 'όριο AI ανά λεπτό' : 'διακοπή σύνδεσης' },
    })
  }
}

const IMPL_DIRECT = new Set(['PAYMENT', 'SUPPLIER_CERT', 'ACCOUNTING', 'PHOTO', 'PAYSLIPS', 'HIRING', 'PAYROLL_PAYMENT', 'INVOICE'])

/** Έγγραφο υλοποίησης για πελάτη με ΕΝΑ έργο σε υλοποίηση → «Προς καταχώριση» του έργου (SAVED) + αυτόματη καταχώριση. */
async function routeImplementation(item: ItemRow, buf: Buffer): Promise<boolean> {
  const { ROLE_LABEL } = await import('@/lib/pm/impl-doc-classify')
  const { classifyWithMemory } = await import('@/lib/pm/file-role-memory')
  const { role, source } = await classifyWithMemory({ fileName: item.fileName, relPath: item.relPath, mimeType: item.mimeType })
  if (!IMPL_DIRECT.has(role)) return false
  // Φωτογραφία μόνο με ρητή ένδειξη εξοπλισμού (όχι κάθε εικόνα — π.χ. ταυτότητα/βεβαίωση σε jpg είναι δικαιολογητικό).
  if (role === 'PHOTO' && !/φωτο|φώτο|foto|photo|img|^sn|signal|picture/i.test(`${item.relPath ?? ''}/${item.fileName}`)) return false
  const { implementationApps, stageImplDoc, scheduleImplAutofile } = await import('@/lib/pm/impl-inbox-core')
  const apps = await implementationApps(item.trdrId)
  if (apps.length !== 1) return false // κανένα ή πολλά έργα σε υλοποίηση → κανονική αναγνώριση/επιλογή από τον χρήστη
  const app = apps[0]
  const inboxId = await stageImplDoc({ applicationId: app.id, trdrId: item.trdrId, name: item.fileName, body: buf, mime: item.mimeType, relPath: item.relPath, userId: item.batch.createdById })
  await prisma.importItem.update({
    where: { id: item.id },
    data: {
      phase: 'SAVED', dest: 'impl', appId: app.id, autoSaved: true, resultRef: inboxId, error: null, waitReason: null, nextAttemptAt: null,
      suggestion: { role, roleSource: source } as Prisma.InputJsonValue,
      resultNote: `Υλοποίηση «${app.title}»: ${ROLE_LABEL[role as keyof typeof ROLE_LABEL]} — καταχωρίζεται αυτόματα στη θέση του.`,
    },
  })
  await scheduleImplAutofile(app.id, item.batch.createdById)
  return true
}

/** Προορισμός + αυτόματη αποθήκευση των βέβαιων δικαιολογητικών. */
async function decide(item: ItemRow, s: SmartClassifyResult, text: string, buf: Buffer) {
  const base = { suggestion: s as unknown as Prisma.InputJsonValue, error: null, waitReason: null, nextAttemptAt: null }
  if (s.commercial) {
    const apps = await prisma.programApplication.findMany({ where: { trdrId: item.trdrId }, select: { id: true, programId: true } })
    const app = apps.find(a => a.programId === s.programId) ?? (apps.length === 1 ? apps[0] : null)
    await prisma.importItem.update({
      where: { id: item.id },
      data: { ...base, phase: 'REVIEW', dest: apps.length ? (s.commercial === 'QUOTE' ? 'quote' : s.commercial === 'APPROVAL' ? 'approval' : 'invoice') : 'files', appId: app?.id ?? null },
    })
    return
  }
  if (!s.typeId) {
    await prisma.importItem.update({ where: { id: item.id }, data: { ...base, ...notRecognized(item) } })
    return
  }
  const type = await prisma.documentType.findUnique({ where: { id: s.typeId }, select: { name: true, expires: true, seriesKind: true } })
  const series = !!type?.seriesKind && type.seriesKind !== 'LIST'
  // Αυτόματη αποθήκευση ΜΟΝΟ όταν όλα είναι ξεκάθαρα (αλλιώς «Για έλεγχο»).
  const confident = s.source === 'memory' || s.confidence >= AUTO_SAVE_MIN_CONFIDENCE
  const sameCompany = s.company?.status !== 'MISMATCH'
  const conflict = series
    ? !s.period || !!(await prisma.trdrDossierDocument.findFirst({ where: { trdrId: item.trdrId, documentTypeId: s.typeId, period: s.period }, select: { id: true } }))
    : !!(await prisma.trdrDossierDocument.findFirst({ where: { trdrId: item.trdrId, documentTypeId: s.typeId, OR: [{ expiresAt: null }, { expiresAt: { gt: new Date() } }] }, select: { id: true } }))
  if (!(confident && sameCompany && !conflict && type)) {
    await prisma.importItem.update({ where: { id: item.id }, data: { ...base, phase: 'REVIEW', dest: 'dossier' } })
    return
  }
  const { createDossierDocCore } = await import('@/lib/documents/dossier-core')
  const ext = /\.([a-z0-9]{1,10})$/i.exec(item.fileName)?.[1]?.toLowerCase() ?? 'bin'
  const r = await createDossierDocCore(item.trdrId, item.batch.createdById, {
    documentTypeId: s.typeId, name: item.fileName.replace(/\.[^.]+$/, ''), base64: buf.toString('base64'), body: buf, mimeType: item.mimeType, ext,
    issuedAt: s.issuedAt, expiresAt: type.expires || s.expiresAt ? s.expiresAt : null,
    programId: s.programId, reusable: s.programId ? s.reusable : true,
    learn: { predictedTypeId: s.typeId, snippet: text, fileName: item.fileName }, fullText: text || null, period: s.period,
  })
  await prisma.importItem.update({
    where: { id: item.id },
    data: { ...base, phase: 'SAVED', dest: 'dossier', autoSaved: true, resultRef: r.id, resultNote: `Αυτόματα στα δικαιολογητικά ως ${type.name}${s.period ? ` ${s.period}` : ''}${r.covered ? ` · κάλυψε ${r.covered} εκκρεμότητες` : ''}` },
  })
}

/** Ένας «γύρος»: επεξεργάζεται όσα αρχεία είναι έτοιμα (σειριακά, μέσα σε χρονικό όριο). true = έμειναν κι άλλα. */
export async function runImportSweep(budgetMs = 50_000): Promise<boolean> {
  const started = Date.now()
  // Αρχεία «κολλημένα» σε ΑΝΑΓΝΩΡΙΖΕΤΑΙ (π.χ. επανεκκίνηση server) → ξανά στην ουρά.
  await prisma.importItem.updateMany({ where: { phase: 'RECOGNIZING', updatedAt: { lt: new Date(Date.now() - 10 * 60_000) } }, data: { phase: 'QUEUED' } })
  for (;;) {
    if (Date.now() - started > budgetMs) return true
    const next = await prisma.importItem.findFirst({
      where: { OR: [{ phase: 'QUEUED' }, { phase: 'WAITING', nextAttemptAt: { lte: new Date() } }] },
      orderBy: [{ updatedAt: 'asc' }],
      select: { id: true },
    })
    if (!next) return false
    await recognizeItem(next.id)
  }
}
