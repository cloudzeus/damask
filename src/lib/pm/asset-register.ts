'use server'

import crypto from 'node:crypto'
import type { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { parseJsonLoose } from '@/lib/ocr/extract'
import { matchAll, type AssetItem, type AssetMatch } from './asset-match'

/**
 * Μητρώο παγίων ↔ δαπάνες έργου: ανάγνωση μητρώου (PDF/εικόνα με AI, ή Excel ως κείμενο) και αναφορά διασταύρωσης
 * κάθε δαπάνης (παραστατικό/ημερομηνία/ποσό/S/N) με τα πάγια — τι βρέθηκε, τι διαφέρει, τι λείπει.
 */

const num = (v: unknown): number | null => {
  if (typeof v === 'number') return Number.isFinite(v) ? v : null
  if (typeof v !== 'string') return null
  let s = v.trim().replace(/[€\s]/g, '')
  if (!s) return null
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.')
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}
const str = (v: unknown) => (typeof v === 'string' && v.trim() && v.trim() !== 'null' ? v.trim() : null)
const isoDate = (v: unknown): string | null => {
  const s = str(v)
  if (!s) return null
  let m = /^(\d{4})-(\d{2})-(\d{2})/.exec(s)
  if (m) return `${m[1]}-${m[2]}-${m[3]}`
  m = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/.exec(s)
  if (!m) return null
  const y = m[3].length === 2 ? `20${m[3]}` : m[3]
  return `${y}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`
}

/** Ανέβασμα + ανάγνωση μητρώου παγίων του πελάτη του έργου. Excel έρχεται ως κείμενο (CSV) από τον browser. */
export async function uploadAssetRegister(applicationId: string, file: { name: string; base64?: string | null; mimeType: string; text?: string | null }): Promise<{ ok: true; items: number; year: number | null } | { ok: false; message: string }> {
  const session = await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUnique({ where: { id: applicationId }, select: { trdrId: true } })
  if (!app) return { ok: false, message: 'Το έργο δεν βρέθηκε.' }
  try {
    let docKey: string | null = null
    if (file.base64) {
      docKey = `asset-registers/${app.trdrId}/${crypto.randomUUID()}.${file.mimeType === 'application/pdf' ? 'pdf' : 'bin'}`
      await bunnyUploadPrivate({ key: docKey, body: Buffer.from(file.base64, 'base64'), contentType: file.mimeType })
    }
    const { geminiGenerate } = await import('@/lib/gemini')
    const res = await geminiGenerate({
      parts: [
        ...(file.base64 ? [{ inlineData: { data: file.base64, mimeType: file.mimeType } }] : []),
        { text: file.text ? `Μητρώο παγίων (από Excel):\n${file.text.slice(0, 180_000)}` : 'Διάβασε το μητρώο παγίων.' },
      ],
      systemInstruction: [
        'Διαβάζεις ελληνικό ΜΗΤΡΩΟ ΠΑΓΙΩΝ (λογιστικό). Εξήγαγε ΚΑΘΕ πάγιο (όλες τις σελίδες):',
        'code = κωδικός παγίου, description = περιγραφή (ολόκληρη, και τυχόν S/N), date = ημ. κτήσης YYYY-MM-DD, qty = ποσότητα, value = αξία κτήσης (αριθμός),',
        'docNo = αριθμός παραστατικού/τιμολογίου ΑΝ υπάρχει στήλη, serial = σειριακός (S/N) αν αναγράφεται.',
        'Αγνόησε γραμμές συνόλων. year = η χρήση του μητρώου. ΑΥΣΤΗΡΑ JSON: {"year":n,"items":[{"code":"...","description":"...","date":"...","qty":n,"value":n,"docNo":null,"serial":null}]}',
      ].join(' '),
      json: true, scope: 'OCR_VISION', refType: 'asset-register', refId: applicationId, userId: session.user.id,
    })
    const p = (parseJsonLoose(res.text) ?? {}) as Record<string, unknown>
    const items: AssetItem[] = (Array.isArray(p.items) ? (p.items as Record<string, unknown>[]) : []).map(i => ({
      code: str(i.code), description: str(i.description) ?? '', date: isoDate(i.date), qty: num(i.qty), value: num(i.value), docNo: str(i.docNo), serial: str(i.serial),
    })).filter(i => i.description || i.code)
    if (!items.length) return { ok: false, message: 'Δεν βρέθηκαν πάγια στο αρχείο — είναι μητρώο παγίων;' }
    const year = num(p.year) != null ? Math.round(num(p.year)!) : null
    await prisma.fixedAssetRegister.create({ data: { trdrId: app.trdrId, year, items: items as unknown as Prisma.InputJsonValue, docKey, docName: file.name.slice(0, 250), createdById: session.user.id } })
    return { ok: true, items: items.length, year }
  } catch (err) {
    return { ok: false, message: err instanceof Error ? err.message : 'Η ανάγνωση απέτυχε.' }
  }
}

export type AssetReportRow = AssetMatch & { description: string; categoryName: string | null; net: number; invoiceNumber: string | null; invoiceDate: string | null }
export type AssetReport = {
  registers: { id: string; year: number | null; docName: string | null; items: number; createdAt: string }[]
  rows: AssetReportRow[]
  /** Πάγια της περιόδου του έργου που δεν αντιστοιχούν σε δαπάνη (πληροφοριακά). */
  unmatchedItems: AssetItem[]
  summary: Record<AssetMatch['status'], number>
}

export async function getAssetReport(applicationId: string): Promise<AssetReport> {
  await requirePermission('programs.manage')
  const app = await prisma.programApplication.findUniqueOrThrow({ where: { id: applicationId }, select: { trdrId: true, approval: { select: { submittedAt: true } } } })
  const [registers, expenses] = await Promise.all([
    prisma.fixedAssetRegister.findMany({ where: { trdrId: app.trdrId }, orderBy: [{ year: 'desc' }, { createdAt: 'desc' }] }),
    prisma.programExpense.findMany({
      where: { applicationId, status: 'ACTIVE' },
      orderBy: { createdAt: 'asc' },
      select: {
        id: true, description: true, amount: true, docNumber: true, date: true, category: { select: { name: true } },
        lines: { select: { product: true, description: true } },
        purchase: { select: { invoiceNumber: true, invoiceDate: true, ocrNumber: true, ocrDate: true, serial: true, invoiceLines: true } },
      },
    }),
  ])
  // Ένα μητρώο ανά χρήση (το πιο πρόσφατο ανέβασμα)· τα πάγια όλων των χρήσεων μαζί, χωρίς διπλά (ίδιος κωδικός).
  const perYear = new Map<string, (typeof registers)[number]>()
  for (const r of registers) if (!perYear.has(String(r.year))) perYear.set(String(r.year), r)
  const seen = new Set<string>()
  const items: AssetItem[] = []
  for (const r of perYear.values()) {
    for (const i of r.items as unknown as AssetItem[]) {
      const k = `${i.code ?? ''}|${i.description}|${i.date ?? ''}`
      if (seen.has(k)) continue
      seen.add(k)
      items.push(i)
    }
  }
  const forMatch = expenses.map(e => {
    const inv = Array.isArray(e.purchase?.invoiceLines) ? (e.purchase!.invoiceLines as { description?: string; code?: string | null; serial?: string | null }[]) : []
    return {
      id: e.id, description: e.description, categoryName: e.category?.name ?? null, net: Number(e.amount),
      invoiceNumber: e.purchase?.invoiceNumber ?? e.purchase?.ocrNumber ?? null,
      invoiceDate: (e.purchase?.invoiceDate ?? e.purchase?.ocrDate)?.toISOString() ?? null,
      lineTexts: [...inv.map(l => [l.code, l.description].filter(Boolean).join(' ')), ...e.lines.map(l => [l.product, l.description].filter(Boolean).join(' '))],
      serials: [e.purchase?.serial, ...inv.map(l => l.serial)].flatMap(s => (s ?? '').split(/[,;\s]+/)).filter(s => s.length >= 5),
    }
  })
  const matches = registers.length ? matchAll(forMatch, items) : forMatch.map(e => ({ expenseId: e.id, status: 'NOT_FOUND' as const, items: [], reasons: ['Δεν έχει ανέβει μητρώο παγίων.'], registered: null }))
  const used = new Set(matches.flatMap(m => m.items))
  const from = app.approval?.submittedAt?.toISOString().slice(0, 10) ?? null
  const rows = matches.map((m, i) => ({ ...m, description: forMatch[i].description, categoryName: forMatch[i].categoryName, net: forMatch[i].net, invoiceNumber: forMatch[i].invoiceNumber, invoiceDate: forMatch[i].invoiceDate }))
  const summary = { OK: 0, AMOUNT_DIFF: 0, DATE_DIFF: 0, NOT_FOUND: 0, NO_INVOICE: 0, NOT_REQUIRED: 0 } as AssetReport['summary']
  for (const r of rows) summary[r.status]++
  return {
    registers: registers.map(r => ({ id: r.id, year: r.year, docName: r.docName, items: Array.isArray(r.items) ? r.items.length : 0, createdAt: r.createdAt.toISOString() })),
    rows,
    unmatchedItems: items.filter(i => !used.has(i) && (!from || (i.date ?? '') >= from)),
    summary,
  }
}
