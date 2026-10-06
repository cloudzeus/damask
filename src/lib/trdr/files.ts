'use server'

import { notFound } from 'next/navigation'
import { revalidatePath } from 'next/cache'
import { requirePermission } from '@/lib/rbac-server'
import { prisma } from '@/lib/prisma'
import { bunnyList, bunnyUploadPrivate, bunnyDeleteOne, bunnyDownload } from '@/lib/bunny-storage'
import { buildTrdrFolderPath, programFolderSegment, SUBFOLDER } from '@/lib/trdr/cdn-folder'

/**
 * Staff file browser για την καρτέλα πελάτη — περιηγείται στο πραγματικό δέντρο
 * φακέλων του πελάτη στο Bunny (private). ΟΛΕΣ οι διαδρομές περιορίζονται μέσα
 * στη ρίζα του πελάτη (partners/<type>/<ΑΦΜ>/) — καμία πρόσβαση εκτός.
 */

const SAFE_SEG = /^[A-Za-z0-9._-]+$/

/** Ρίζα πελάτη (με trailing slash). Πετάει notFound αν δεν υπάρχει ο πελάτης. */
async function rootFor(trdrId: string): Promise<string> {
  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
  if (!trdr) notFound()
  return trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
}

/** Καθαρίζει σχετικό subPath (χωρίς .. / leading-trailing slash)· επιστρέφει '' ή 'a/b/'. */
function safeSub(sub: string | undefined | null): string {
  const s = (sub ?? '').replace(/^\/+|\/+$/g, '')
  if (!s) return ''
  const parts = s.split('/')
  for (const p of parts) {
    if (p === '' || p === '.' || p === '..' || !SAFE_SEG.test(p)) throw new Error('Μη έγκυρη διαδρομή.')
  }
  return `${parts.join('/')}/`
}

export type BrowserFolder = { name: string; path: string; label?: string; hint?: string; virtual?: boolean }
export type BrowserFile = {
  name: string
  key: string
  size: number
  lastChanged: string
  downloadUrl: string
  /** 'raw' = αρχείο αποθήκης (μετονομασία/διαγραφή εδώ)· 'record' = εγγραφή DB
   * (δικαιολογητικό/ΓΕΜΗ/παραδοτέο) — μόνο προβολή/λήψη, διαχείριση στην οικεία καρτέλα. */
  kind?: 'raw' | 'record'
  meta?: string
  mimeType?: string | null
}
export type TrdrFilesListing = {
  subPath: string
  folders: BrowserFolder[]
  files: BrowserFile[]
}

export async function listTrdrFiles(trdrId: string, subPath = ''): Promise<TrdrFilesListing> {
  await requirePermission('customer.view')
  const root = await rootFor(trdrId)
  const rel = safeSub(subPath)
  const prefix = `${root}${rel}`
  const entries = await bunnyList(prefix)

  const folders: BrowserFolder[] = entries
    .filter(e => e.isDirectory)
    .map(e => ({ name: e.objectName, path: `${rel}${e.objectName}` }))
    .sort((a, b) => a.name.localeCompare(b.name, 'el'))

  const files: BrowserFile[] = entries
    .filter(e => !e.isDirectory && e.objectName !== '.keep')
    .map(e => {
      const key = `${prefix}${e.objectName}`
      return {
        name: e.objectName,
        key,
        size: e.length,
        lastChanged: e.lastChanged,
        downloadUrl: `/api/partners/${trdrId}/files/download?key=${encodeURIComponent(key)}`,
      }
    })
    .sort((a, b) => a.name.localeCompare(b.name, 'el'))

  return { subPath: rel, folders, files }
}

export async function deleteTrdrFile(trdrId: string, key: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('customer.edit')
  const root = await rootFor(trdrId)
  if (!key.startsWith(root) || key.includes('..')) return { ok: false, error: 'Μη έγκυρο αρχείο.' }
  await bunnyDeleteOne(key)
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true }
}

/** Μετονομασία αρχείου (Bunny: copy bytes σε νέο key + delete παλιό). Ίδιος φάκελος. */
export async function renameTrdrFile(trdrId: string, key: string, newName: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('customer.edit')
  const root = await rootFor(trdrId)
  if (!key.startsWith(root) || key.includes('..')) return { ok: false, error: 'Μη έγκυρο αρχείο.' }
  const safe = newName.trim().replace(/[/\\]/g, '').replace(/\.\.+/g, '.')
  if (!safe) return { ok: false, error: 'Μη έγκυρο όνομα.' }
  const dir = key.slice(0, key.lastIndexOf('/') + 1)
  const newKey = `${dir}${safe}`
  if (newKey === key) return { ok: true }
  try {
    const buf = await bunnyDownload(key)
    await bunnyUploadPrivate({ key: newKey, body: buf })
    await bunnyDeleteOne(key)
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : 'Η μετονομασία απέτυχε.' }
  }
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true }
}

export async function createTrdrSubfolder(trdrId: string, subPath: string, name: string): Promise<{ ok: boolean; error?: string }> {
  await requirePermission('customer.edit')
  const clean = name.trim()
  if (!SAFE_SEG.test(clean)) return { ok: false, error: 'Το όνομα φακέλου επιτρέπει μόνο γράμματα/αριθμούς/._-' }
  const root = await rootFor(trdrId)
  const rel = safeSub(subPath)
  await bunnyUploadPrivate({ key: `${root}${rel}${clean}/.keep`, body: Buffer.from(''), contentType: 'text/plain' })
  revalidatePath(`/partners/${trdrId}`)
  return { ok: true }
}

// ── Εικονικό δέντρο «Αρχεία» ─────────────────────────────────────────────────
// Ενοποιεί σε έναν browser τα αρχεία που ζουν σε διαφορετικά σημεία:
//   Αρχεία
//   ├─ Δικαιολογητικά            (@dossier)
//   │   ├─ Εταιρικά              (@dossier/general → TrdrDossierDocument)
//   │   └─ <Πρόγραμμα>           (@dossier/app/<appId> → ApplicationDocument
//   │       │                      + αρχεία αποθήκης EuPrograms/<κωδικός>/)
//   │       └─ Παραδοτέα         (@dossier/app/<appId>/deliverables → DeliverableFile)
//   ├─ ΓΕΜΗ                      (@gemi → TrdrDocument με αποθηκευμένο αρχείο)
//   └─ …λοιποί φάκελοι αποθήκης (πραγματικά paths του Bunny)
// Τα εικονικά paths ξεκινούν με «@» (δεν περνούν ποτέ το SAFE_SEG ⇒ δεν μπλέκονται
// με πραγματικά). Οι εγγραφές DB κατεβαίνουν από τα δικά τους gated routes.

export type TrdrTreeListing = {
  path: string
  crumbs: { label: string; path: string }[]
  folders: BrowserFolder[]
  files: BrowserFile[]
  /** Πραγματικός φάκελος αποθήκης όπου πάνε τα uploads· null = όχι upload εδώ. */
  uploadSubPath: string | null
  /** Μήνυμα όταν δεν επιτρέπεται upload (πού γίνεται η διαχείριση). */
  uploadHint?: string
  canCreateFolder: boolean
}

const DOSSIER_LABEL = 'Δικαιολογητικά'
const RAW_LABELS: Record<string, string> = {
  documents: 'Έγγραφα', services: 'Υπηρεσίες', gemi: 'ΓΕΜΗ (αποθήκη)', EuPrograms: 'Ευρωπαϊκά Προγράμματα',
}

function iso(d: Date | null | undefined): string {
  return (d ?? new Date(0)).toISOString()
}

function fmtDate(d: Date | null | undefined): string | null {
  return d ? d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' }) : null
}

function rawToBrowser(listing: TrdrFilesListing, hideFolders: string[] = []): { folders: BrowserFolder[]; files: BrowserFile[] } {
  return {
    folders: listing.folders
      .filter(f => !hideFolders.includes(f.name))
      .map(f => ({ ...f, label: RAW_LABELS[f.name] ?? f.name })),
    files: listing.files.map(f => ({ ...f, kind: 'raw' as const })),
  }
}

async function safeRaw(trdrId: string, sub: string): Promise<TrdrFilesListing> {
  try {
    return await listTrdrFiles(trdrId, sub)
  } catch {
    return { subPath: sub, folders: [], files: [] }
  }
}

export async function listTrdrTree(trdrId: string, path = ''): Promise<TrdrTreeListing> {
  await requirePermission('customer.view')
  const p = path.replace(/^\/+|\/+$/g, '')
  const rootCrumb = { label: 'Αρχεία', path: '' }

  // ── Ρίζα ────────────────────────────────────────────────────────────────
  if (p === '') {
    const [raw, dossierCount, appCount, gemiCount] = await Promise.all([
      safeRaw(trdrId, ''),
      prisma.trdrDossierDocument.count({ where: { trdrId } }),
      prisma.programApplication.count({ where: { trdrId } }),
      prisma.trdrDocument.count({ where: { trdrId, storageKey: { not: null } } }),
    ])
    const r = rawToBrowser(raw, ['EuPrograms'])
    return {
      path: '',
      crumbs: [rootCrumb],
      folders: [
        { name: 'dossier', path: '@dossier', label: DOSSIER_LABEL, virtual: true, hint: `${dossierCount} εταιρικά · ${appCount} προγράμματα` },
        { name: 'gemi', path: '@gemi', label: 'ΓΕΜΗ', virtual: true, hint: `${gemiCount} έγγραφα` },
        ...r.folders,
      ],
      files: r.files,
      uploadSubPath: '',
      canCreateFolder: true,
    }
  }

  // ── ΓΕΜΗ ────────────────────────────────────────────────────────────────
  if (p === '@gemi') {
    const docs = await prisma.trdrDocument.findMany({
      where: { trdrId, storageKey: { not: null } },
      orderBy: [{ dateAnnounced: { sort: 'desc', nulls: 'last' } }, { createdAt: 'desc' }],
      select: { id: true, title: true, kak: true, dateAnnounced: true, createdAt: true, sizeBytes: true, mimeType: true },
    })
    return {
      path: p,
      crumbs: [rootCrumb, { label: 'ΓΕΜΗ', path: p }],
      folders: [],
      files: docs.map(d => ({
        name: d.title,
        key: `gemi:${d.id}`,
        size: d.sizeBytes ?? 0,
        lastChanged: iso(d.dateAnnounced ?? d.createdAt),
        downloadUrl: `/partners/${trdrId}/documents/${d.id}`,
        kind: 'record' as const,
        mimeType: d.mimeType,
        meta: [d.kak && `ΚΑΚ ${d.kak}`, fmtDate(d.dateAnnounced) && `Ανακοίνωση ${fmtDate(d.dateAnnounced)}`].filter(Boolean).join(' · '),
      })),
      uploadSubPath: null,
      uploadHint: 'Τα έγγραφα ΓΕΜΗ εισάγονται από την καρτέλα «Έγγραφα ΓΕΜΗ» (συγχρονισμός).',
      canCreateFolder: false,
    }
  }

  const dossierCrumb = { label: DOSSIER_LABEL, path: '@dossier' }

  // ── Δικαιολογητικά: φάκελοι ─────────────────────────────────────────────
  if (p === '@dossier') {
    const [generalCount, apps] = await Promise.all([
      prisma.trdrDossierDocument.count({ where: { trdrId } }),
      prisma.programApplication.findMany({
        where: { trdrId },
        orderBy: { createdAt: 'desc' },
        select: { id: true, program: { select: { title: true, referenceCode: true } }, _count: { select: { documents: true } } },
      }),
    ])
    return {
      path: p,
      crumbs: [rootCrumb, dossierCrumb],
      folders: [
        { name: 'general', path: '@dossier/general', label: 'Εταιρικά δικαιολογητικά', virtual: true, hint: `${generalCount} έγγραφα` },
        ...apps.map(a => ({
          name: a.id,
          path: `@dossier/app/${a.id}`,
          label: a.program.title,
          virtual: true,
          hint: [a.program.referenceCode, `${a._count.documents} δικαιολογητικά`].filter(Boolean).join(' · '),
        })),
      ],
      files: [],
      uploadSubPath: null,
      uploadHint: 'Άνοιξε έναν φάκελο προγράμματος για μεταφόρτωση.',
      canCreateFolder: false,
    }
  }

  if (p === '@dossier/general') {
    const docs = await prisma.trdrDossierDocument.findMany({
      where: { trdrId },
      orderBy: { createdAt: 'desc' },
      select: { id: true, name: true, sizeBytes: true, mimeType: true, createdAt: true, expiresAt: true, documentType: { select: { name: true } } },
    })
    return {
      path: p,
      crumbs: [rootCrumb, dossierCrumb, { label: 'Εταιρικά δικαιολογητικά', path: p }],
      folders: [],
      files: docs.map(d => ({
        name: d.name,
        key: `dossier:${d.id}`,
        size: d.sizeBytes ?? 0,
        lastChanged: iso(d.createdAt),
        downloadUrl: `/partners/${trdrId}/dossier/${d.id}`,
        kind: 'record' as const,
        mimeType: d.mimeType,
        meta: [d.documentType.name, d.expiresAt && `λήγει ${fmtDate(d.expiresAt)}`].filter(Boolean).join(' · '),
      })),
      uploadSubPath: null,
      uploadHint: 'Τα εταιρικά δικαιολογητικά μεταφορτώνονται από την καρτέλα «Δικαιολογητικά» (με τύπο & λήξη).',
      canCreateFolder: false,
    }
  }

  const appMatch = /^@dossier\/app\/([^/]+)(\/deliverables)?$/.exec(p)
  if (appMatch) {
    const appId = appMatch[1]
    const app = await prisma.programApplication.findUnique({
      where: { id: appId },
      select: { id: true, trdrId: true, programId: true, program: { select: { id: true, title: true, referenceCode: true } } },
    })
    if (!app || app.trdrId !== trdrId) notFound()
    const appPath = `@dossier/app/${appId}`
    const appCrumb = { label: app.program.title, path: appPath }

    if (appMatch[2]) {
      const files = await prisma.deliverableFile.findMany({
        where: { task: { deliverable: { applicationId: appId } } },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, name: true, size: true, mimeType: true, uploadedAt: true, task: { select: { name: true, deliverable: { select: { name: true } } } } },
      })
      return {
        path: p,
        crumbs: [rootCrumb, dossierCrumb, appCrumb, { label: 'Παραδοτέα', path: p }],
        folders: [],
        files: files.map(f => ({
          name: f.name,
          key: `deliv:${f.id}`,
          size: f.size ?? 0,
          lastChanged: iso(f.uploadedAt),
          downloadUrl: `/programs/${app.programId}/applications/${appId}/deliverables/${f.id}`,
          kind: 'record' as const,
          mimeType: f.mimeType,
          meta: `${f.task.deliverable.name} › ${f.task.name}`,
        })),
        uploadSubPath: null,
        uploadHint: 'Τα παραδοτέα μεταφορτώνονται από το έργο («Φάκελος & Πιστοποίηση»).',
        canCreateFolder: false,
      }
    }

    const seg = programFolderSegment(app.program)
    const rawSub = `${SUBFOLDER.euPrograms}/${seg}`
    const [docs, delivCount, raw] = await Promise.all([
      prisma.applicationDocument.findMany({
        where: { applicationId: appId },
        orderBy: { uploadedAt: 'desc' },
        select: { id: true, name: true, size: true, mimeType: true, uploadedAt: true, expiresAt: true, documentType: { select: { name: true } } },
      }),
      prisma.deliverableFile.count({ where: { task: { deliverable: { applicationId: appId } } } }),
      safeRaw(trdrId, rawSub),
    ])
    const r = rawToBrowser(raw)
    return {
      path: p,
      crumbs: [rootCrumb, dossierCrumb, appCrumb],
      folders: [
        ...(delivCount > 0 ? [{ name: 'deliverables', path: `${appPath}/deliverables`, label: 'Παραδοτέα', virtual: true, hint: `${delivCount} αρχεία` }] : []),
        ...r.folders,
      ],
      files: [
        ...docs.map(d => ({
          name: d.name,
          key: `appdoc:${d.id}`,
          size: d.size ?? 0,
          lastChanged: iso(d.uploadedAt),
          downloadUrl: `/programs/${app.programId}/applications/${appId}/documents/${d.id}`,
          kind: 'record' as const,
          mimeType: d.mimeType,
          meta: [d.documentType?.name ?? 'Δικαιολογητικό έργου', d.expiresAt && `λήγει ${fmtDate(d.expiresAt)}`].filter(Boolean).join(' · '),
        })),
        ...r.files.map(f => ({ ...f, meta: 'Αρχείο φακέλου προγράμματος' })),
      ],
      uploadSubPath: rawSub,
      canCreateFolder: true,
    }
  }

  if (p.startsWith('@')) notFound()

  // ── Πραγματικός φάκελος αποθήκης ────────────────────────────────────────
  const raw = await listTrdrFiles(trdrId, p)
  const segs = raw.subPath.split('/').filter(Boolean)
  const r = rawToBrowser(raw, segs.length === 1 && segs[0] === 'documents' ? ['gemi'] : [])
  return {
    path: raw.subPath.replace(/\/$/, ''),
    crumbs: [rootCrumb, ...segs.map((s, i) => ({ label: RAW_LABELS[s] ?? s, path: segs.slice(0, i + 1).join('/') }))],
    folders: r.folders,
    files: r.files,
    uploadSubPath: raw.subPath.replace(/\/$/, ''),
    canCreateFolder: true,
  }
}
