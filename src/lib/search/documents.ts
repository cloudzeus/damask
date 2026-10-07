import crypto from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from '@/lib/prisma'
import { geminiEmbed } from '@/lib/gemini'
import { CATEGORY_LABELS } from '@/lib/nas/backup'

/**
 * Έξυπνη αναζήτηση εγγράφων. (Plain module.)
 *
 * Ευρετηρίαση: για ΚΑΘΕ αρχείο του FileIndexEntry φτιάχνεται κείμενο & ετικέτες από ό,τι
 * ξέρει η εφαρμογή (τύπος δικαιολογητικού, πελάτης/ΑΦΜ, πρόγραμμα, έτος, λήξη, θέμα/περίληψη
 * ΓΕΜΗ, προϊόντα/προμηθευτής προσφοράς, τιμές εντύπων…) + embedding (Gemini → pgvector).
 * Ξανα-embedding ΜΟΝΟ όταν αλλάξει το κείμενο (contentHash).
 *
 * Αναζήτηση (υβριδική): σημασιολογική ομοιότητα (cosine) + trigram + κάλυψη όρων (χωρίς
 * τόνους) + μπόνους ετικέτας — ώστε να βρίσκεται και το «βεβαίωση εφορίας» ως «Φορολογική
 * ενημερότητα» και το ακριβές «094183948».
 */

export function fold(s: string): string {
  return s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/\s+/g, ' ').trim()
}

const DATE = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
const d = (x: Date | null | undefined) => (x ? DATE.format(x) : null)
const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 2 })

/** Καθαρό όνομα αρχείου (χωρίς timestamp/uuid προθέματα). */
function prettyFileName(key: string): string {
  const base = key.split('/').pop() ?? key
  return base
    .replace(/^\d{10,}-[0-9a-f]{6,}-/i, '')
    .replace(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i, '')
    .replace(/\.[a-z0-9]{2,5}$/i, '')
    .replace(/[_-]+/g, ' ')
    .trim()
}

type Meta = { title?: string; tags: string[]; lines: string[]; trdrId?: string | null; docType?: string | null; programTitle?: string | null; year?: number | null }

async function collectMetadata(): Promise<Map<string, Meta>> {
  const m = new Map<string, Meta>()
  const add = (key: string | null | undefined, meta: Meta) => { if (key) m.set(key, meta) }
  const now = Date.now()
  const expiryTag = (exp: Date | null) => (exp ? (exp.getTime() < now ? `έληξε ${exp.getFullYear()}` : `σε ισχύ έως ${exp.getFullYear()}`) : null)

  const [dossier, gemi, appDocs, deliv, records, quotes, reqItems, dbb, media] = await Promise.all([
    prisma.trdrDossierDocument.findMany({ select: { storageKey: true, name: true, trdrId: true, issuedAt: true, expiresAt: true, reusable: true, documentType: { select: { name: true, notes: true } }, program: { select: { title: true } } } }),
    prisma.trdrDocument.findMany({ where: { storageKey: { not: null } }, select: { storageKey: true, trdrId: true, title: true, summary: true, decisionSubject: true, kak: true, assembly: true, docKind: true, dateAnnounced: true } }),
    prisma.applicationDocument.findMany({ select: { storageKey: true, name: true, expiresAt: true, documentType: { select: { name: true, notes: true } }, obligation: { select: { name: true } }, application: { select: { trdrId: true, program: { select: { title: true } } } } } }),
    prisma.deliverableFile.findMany({ select: { storageKey: true, name: true, task: { select: { name: true, deliverable: { select: { name: true, application: { select: { trdrId: true, program: { select: { title: true } } } } } } } } } }),
    prisma.trdrFormRecord.findMany({ select: { storageKey: true, name: true, trdrId: true, year: true, extractedData: true, template: { select: { name: true, description: true, fields: { select: { fieldKey: true, label: true } }, documentType: { select: { notes: true } } } } } }),
    prisma.programExpense.findMany({ where: { quoteStorageKey: { not: null } }, select: { quoteStorageKey: true, description: true, vendor: true, vendorAfm: true, supplier: { select: { NAME: true, AFM: true } }, category: { select: { name: true } }, lines: { select: { product: true, description: true } }, application: { select: { trdrId: true, program: { select: { title: true } } } } } }),
    prisma.fileRequestItem.findMany({ where: { fileKey: { not: null } }, select: { fileKey: true, label: true, fileName: true, fileRequest: { select: { title: true, trdrId: true } } } }),
    prisma.dbBackup.findMany({ select: { storageKey: true, createdAt: true } }),
    prisma.mediaAsset.findMany({ select: { cdnUrl: true, name: true, alt: true, folder: { select: { name: true } } } }),
  ])

  for (const x of dossier) add(x.storageKey, {
    title: x.documentType.name,
    docType: x.documentType.name,
    programTitle: x.program?.title ?? null,
    trdrId: x.trdrId,
    year: (x.issuedAt ?? x.expiresAt)?.getFullYear() ?? null,
    tags: [x.documentType.name, x.program?.title, expiryTag(x.expiresAt), x.reusable ? null : 'μόνο για ένα πρόγραμμα'].filter(Boolean) as string[],
    lines: [x.name, x.documentType.name, x.documentType.notes, x.program ? `Πρόγραμμα ${x.program.title}` : 'Εταιρικό δικαιολογητικό', x.issuedAt && `Έκδοση ${d(x.issuedAt)}`, x.expiresAt && `Λήξη ${d(x.expiresAt)}`].filter(Boolean) as string[],
  })
  for (const x of gemi) add(x.storageKey, {
    title: x.title,
    docType: 'Έγγραφο ΓΕΜΗ',
    trdrId: x.trdrId,
    year: x.dateAnnounced?.getFullYear() ?? null,
    tags: ['ΓΕΜΗ', x.assembly, x.kak ? `ΚΑΚ ${x.kak}` : null].filter(Boolean) as string[],
    lines: [x.title, x.decisionSubject, x.summary, x.assembly, x.kak && `ΚΑΚ ${x.kak}`, x.dateAnnounced && `Ανακοίνωση ${d(x.dateAnnounced)}`].filter(Boolean) as string[],
  })
  for (const x of appDocs) add(x.storageKey, {
    title: x.documentType?.name ?? x.obligation?.name ?? x.name,
    docType: x.documentType?.name ?? null,
    programTitle: x.application.program.title,
    trdrId: x.application.trdrId,
    year: x.expiresAt?.getFullYear() ?? null,
    tags: [x.documentType?.name, x.application.program.title, 'έγγραφο έργου', expiryTag(x.expiresAt)].filter(Boolean) as string[],
    lines: [x.name, x.documentType?.name, x.documentType?.notes, x.obligation?.name, `Πρόγραμμα ${x.application.program.title}`].filter(Boolean) as string[],
  })
  for (const x of deliv) add(x.storageKey, {
    title: `${x.task.deliverable.name} — ${x.task.name}`,
    docType: 'Παραδοτέο',
    programTitle: x.task.deliverable.application.program.title,
    trdrId: x.task.deliverable.application.trdrId,
    tags: ['παραδοτέο', x.task.deliverable.name, x.task.deliverable.application.program.title],
    lines: [x.name, x.task.deliverable.name, x.task.name, `Πρόγραμμα ${x.task.deliverable.application.program.title}`],
  })
  for (const x of records) {
    const data = (x.extractedData ?? {}) as Record<string, unknown>
    const labelOf = new Map(x.template.fields.map(f => [f.fieldKey, f.label]))
    const vals = Object.entries(data)
      .filter(([, v]) => typeof v === 'string' && v && /^-?\d+(\.\d+)?$/.test(v as string))
      .slice(0, 14)
      .map(([k, v]) => `${labelOf.get(k) ?? k.replace(/_/g, ' ')}: ${EUR.format(Number(v))}`)
    const tableLabels = Object.entries(data).filter(([, v]) => v && typeof v === 'object').map(([k]) => labelOf.get(k)).filter(Boolean) as string[]
    add(x.storageKey, {
      title: `${x.template.name} ${x.year}`,
      docType: x.template.name,
      trdrId: x.trdrId,
      year: x.year,
      tags: [x.template.name, String(x.year)],
      lines: [x.name, x.template.name, x.template.description, x.template.documentType?.notes, `Έτος ${x.year}`, ...vals, ...tableLabels.map(l => `Πίνακας: ${l}`)].filter(Boolean) as string[],
    })
  }
  for (const x of quotes) {
    const supplier = x.supplier?.NAME ?? x.vendor
    add(x.quoteStorageKey, {
      title: `Προσφορά — ${x.description}`,
      docType: 'Προσφορά',
      programTitle: x.application.program.title,
      trdrId: x.application.trdrId,
      tags: ['προσφορά', supplier, x.category?.name, x.application.program.title].filter(Boolean) as string[],
      lines: [x.description, supplier && `Προμηθευτής ${supplier}`, (x.supplier?.AFM ?? x.vendorAfm) && `ΑΦΜ προμηθευτή ${x.supplier?.AFM ?? x.vendorAfm}`, x.category?.name, ...x.lines.map(l => [l.product, l.description].filter(Boolean).join(' — '))].filter(Boolean) as string[],
    })
  }
  for (const x of reqItems) add(x.fileKey, {
    title: x.label,
    docType: x.label,
    trdrId: x.fileRequest.trdrId,
    tags: ['από πελάτη', x.label],
    lines: [x.label, x.fileName, `Αίτημα: ${x.fileRequest.title}`].filter(Boolean) as string[],
  })
  for (const x of dbb) add(x.storageKey, { title: `Backup βάσης ${d(x.createdAt)}`, tags: ['backup βάσης'], lines: [`Αντίγραφο ασφαλείας βάσης δεδομένων ${d(x.createdAt)}`], year: x.createdAt.getFullYear() })
  for (const x of media) {
    const key = decodeURIComponent(new URL(x.cdnUrl, 'https://x').pathname.replace(/^\/+/, ''))
    add(key, { title: x.name, tags: ['media', x.folder?.name].filter(Boolean) as string[], lines: [x.name, x.alt, x.folder?.name].filter(Boolean) as string[] })
  }
  return m
}

type Doc = { key: string; title: string; tags: string[]; content: string; searchText: string; category: string; trdrId: string | null; trdrName: string | null; docType: string | null; programTitle: string | null; year: number | null; contentHash: string }

async function buildDocs(): Promise<Doc[]> {
  const [files, meta] = await Promise.all([
    prisma.fileIndexEntry.findMany({ where: { missingAt: null }, select: { key: true, category: true, trdrId: true, lastChanged: true } }),
    collectMetadata(),
  ])
  const trdrIds = new Set<string>()
  for (const f of files) if (f.trdrId) trdrIds.add(f.trdrId)
  for (const v of meta.values()) if (v.trdrId) trdrIds.add(v.trdrId)
  const trdrs = await prisma.trdr.findMany({ where: { id: { in: [...trdrIds] } }, select: { id: true, NAME: true, AFM: true, CITY: true } })
  const tById = new Map(trdrs.map(t => [t.id, t]))

  return files.map(f => {
    const mt = meta.get(f.key)
    const trdrId = mt?.trdrId ?? f.trdrId
    const t = trdrId ? tById.get(trdrId) : undefined
    const catLabel = CATEGORY_LABELS[f.category] ?? f.category
    const fileName = prettyFileName(f.key)
    const year = mt?.year ?? null
    const title = mt?.title || fileName || f.key
    const shortName = t?.NAME.split(/\s+/).slice(0, 3).join(' ')
    const tags = [...new Set([catLabel, ...(mt?.tags ?? []), shortName, t?.AFM ? `ΑΦΜ ${t.AFM}` : null, year ? String(year) : null].filter((x): x is string => !!x && x.length <= 80))]
    const content = [
      title,
      ...(mt?.lines ?? []),
      t && `Πελάτης: ${t.NAME}${t.AFM ? ` (ΑΦΜ ${t.AFM})` : ''}${t.CITY ? `, ${t.CITY}` : ''}`,
      `Κατηγορία: ${catLabel}`,
      `Αρχείο: ${fileName}`,
      `Ημερομηνία: ${d(f.lastChanged)}`,
    ].filter(Boolean).join('\n')
    return {
      key: f.key, title, tags, content, searchText: fold(`${content}\n${tags.join(' ')}`),
      category: f.category, trdrId: trdrId ?? null, trdrName: t?.NAME ?? null,
      docType: mt?.docType ?? null, programTitle: mt?.programTitle ?? null, year,
      contentHash: crypto.createHash('sha1').update(content).digest('hex'),
    }
  })
}

const toVector = (v: number[]) => `[${v.map(x => (Number.isFinite(x) ? x.toFixed(6) : '0')).join(',')}]`

/** Ενημερώνει το ευρετήριο αναζήτησης· embeddings μόνο για νέα/αλλαγμένα. */
export async function reindexDocuments(opts: { embed?: boolean } = {}): Promise<{ docs: number; embedded: number; removed: number }> {
  const docs = await buildDocs()
  for (let i = 0; i < docs.length; i += 200) {
    const chunk = docs.slice(i, i + 200)
    const values = chunk.map(x => Prisma.sql`(${`ds_${crypto.randomUUID().replace(/-/g, '')}`}, ${x.key}, ${x.title}, ${x.tags}, ${x.content}, ${x.searchText}, ${x.category}, ${x.trdrId}, ${x.trdrName}, ${x.docType}, ${x.programTitle}, ${x.year}, ${x.contentHash}, NOW())`)
    await prisma.$executeRaw`
      INSERT INTO "DocumentSearch" ("id","key","title","tags","content","searchText","category","trdrId","trdrName","docType","programTitle","year","contentHash","updatedAt")
      VALUES ${Prisma.join(values)}
      ON CONFLICT ("key") DO UPDATE SET "title"=EXCLUDED."title","tags"=EXCLUDED."tags","content"=EXCLUDED."content","searchText"=EXCLUDED."searchText",
        "category"=EXCLUDED."category","trdrId"=EXCLUDED."trdrId","trdrName"=EXCLUDED."trdrName","docType"=EXCLUDED."docType",
        "programTitle"=EXCLUDED."programTitle","year"=EXCLUDED."year","contentHash"=EXCLUDED."contentHash","updatedAt"=NOW()`
  }
  const keys = docs.map(x => x.key)
  const removed = await prisma.documentSearch.deleteMany({ where: { key: { notIn: keys } } })

  let embedded = 0
  if (opts.embed !== false) {
    const stale = await prisma.$queryRaw<{ key: string; content: string; contentHash: string }[]>`
      SELECT "key", "content", "contentHash" FROM "DocumentSearch" WHERE "embedding" IS NULL OR "embeddedHash" IS DISTINCT FROM "contentHash"`
    for (let i = 0; i < stale.length; i += 100) {
      const chunk = stale.slice(i, i + 100)
      const vecs = await geminiEmbed(chunk.map(c => c.content), { task: 'RETRIEVAL_DOCUMENT', refType: 'search-index' })
      for (let j = 0; j < chunk.length; j++) {
        await prisma.$executeRaw`UPDATE "DocumentSearch" SET "embedding" = ${toVector(vecs[j])}::vector, "embeddedHash" = ${chunk[j].contentHash} WHERE "key" = ${chunk[j].key}`
      }
      embedded += chunk.length
    }
  }
  return { docs: docs.length, embedded, removed: removed.count }
}

export type DocumentHit = {
  key: string
  title: string
  tags: string[]
  category: string
  trdrId: string | null
  trdrName: string | null
  docType: string | null
  programTitle: string | null
  year: number | null
  snippet: string
  score: number
}

/** Υβριδική αναζήτηση: σημασιολογική + κειμένου (χωρίς τόνους) + ετικέτες, με φίλτρα. */
export async function searchDocuments(query: string, filters: { trdrId?: string | null; category?: string | null; tag?: string | null; limit?: number } = {}): Promise<DocumentHit[]> {
  const q = query.trim()
  const fq = fold(q)
  const terms = fq.split(' ').filter(t => t.length >= 2).slice(0, 8)
  const limit = Math.min(filters.limit ?? 40, 100)
  const where: Prisma.Sql[] = [Prisma.sql`TRUE`]
  if (filters.trdrId) where.push(Prisma.sql`"trdrId" = ${filters.trdrId}`)
  if (filters.category) where.push(Prisma.sql`"category" = ${filters.category}`)
  if (filters.tag) where.push(Prisma.sql`${filters.tag} = ANY("tags")`)
  const whereSql = Prisma.join(where, ' AND ')

  if (!q) {
    const rows = await prisma.$queryRaw<(Omit<DocumentHit, 'snippet' | 'score'> & { content: string })[]>`
      SELECT "key","title","tags","category","trdrId","trdrName","docType","programTitle","year","content" FROM "DocumentSearch"
      WHERE ${whereSql} ORDER BY "updatedAt" DESC LIMIT ${limit}`
    return rows.map(r => ({ ...r, snippet: r.content.split('\n').slice(1, 3).join(' · '), score: 0 }))
  }

  const [qv] = await geminiEmbed([q], { task: 'RETRIEVAL_QUERY', refType: 'search-query' }).catch(() => [null as unknown as number[]])
  const termSql = terms.length
    ? Prisma.join(terms.map(t => Prisma.sql`(CASE WHEN "searchText" LIKE ${`%${t}%`} THEN 1 ELSE 0 END)`), ' + ')
    : Prisma.sql`0`
  const semSql = qv ? Prisma.sql`COALESCE(1 - ("embedding" <=> ${toVector(qv)}::vector), 0)` : Prisma.sql`0`
  const termCount = Math.max(terms.length, 1)
  const rows = await prisma.$queryRaw<(Omit<DocumentHit, 'snippet' | 'score'> & { content: string; sem: number; trg: number; cov: number; tagHit: boolean })[]>`
    SELECT "key","title","tags","category","trdrId","trdrName","docType","programTitle","year","content",
      ${semSql} AS sem,
      word_similarity(${fq}, "searchText") AS trg,
      (${termSql})::float / ${termCount} AS cov,
      EXISTS (SELECT 1 FROM unnest("tags") t WHERE lower(t) = ${q.toLowerCase()}) AS "tagHit"
    FROM "DocumentSearch"
    WHERE ${whereSql}
    ORDER BY (${semSql}) * 0.55 + word_similarity(${fq}, "searchText") * 0.2 + ((${termSql})::float / ${termCount}) * 0.35 DESC
    LIMIT ${limit * 2}`

  return rows
    .map(r => {
      const score = r.sem * 0.55 + r.trg * 0.2 + r.cov * 0.35 + (r.tagHit ? 0.15 : 0)
      const lines = r.content.split('\n')
      const hitLine = lines.find(l => terms.some(t => fold(l).includes(t))) ?? lines[1] ?? ''
      return { key: r.key, title: r.title, tags: r.tags, category: r.category, trdrId: r.trdrId, trdrName: r.trdrName, docType: r.docType, programTitle: r.programTitle, year: r.year, snippet: hitLine, score, cov: r.cov, sem: r.sem }
    })
    // κόβουμε τα άσχετα: ούτε σημασιολογικά κοντά ούτε όρος στο κείμενο
    .filter(r => r.score >= 0.42 || (r.cov >= 0.5 && r.sem >= 0.45))
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map(h => ({ key: h.key, title: h.title, tags: h.tags, category: h.category, trdrId: h.trdrId, trdrName: h.trdrName, docType: h.docType, programTitle: h.programTitle, year: h.year, snippet: h.snippet, score: h.score }))
}

/** Οι πιο συχνές ετικέτες (για chips φίλτρων). */
export async function topTags(limit = 30): Promise<{ tag: string; n: number }[]> {
  const rows = await prisma.$queryRaw<{ tag: string; n: bigint }[]>`
    SELECT t AS tag, COUNT(*) AS n FROM "DocumentSearch", unnest("tags") t GROUP BY t ORDER BY n DESC LIMIT ${limit}`
  return rows.map(r => ({ tag: r.tag, n: Number(r.n) }))
}
