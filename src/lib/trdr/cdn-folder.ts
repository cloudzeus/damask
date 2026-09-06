import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'

/**
 * Δομή φακέλων ανά συναλλασσόμενο στο Bunny (private storage). Το Bunny δεν έχει
 * mkdir — «δημιουργούμε» φάκελο ανεβάζοντας ένα κενό .keep.
 *
 *   partners/<type>/<ΑΦΜ>/                      ← ρίζα πελάτη (Trdr.cdnFolder)
 *   ├── documents/                             ← ΚΟΙΝΑ έγγραφα, reusable σε πολλά έργα
 *   │   ├── gemi/                              ← έγγραφα ΓΕΜΗ
 *   │   └── services/                          ← λοιπά έγγραφα από υπηρεσίες (ΑΑΔΕ κλπ)
 *   └── EuPrograms/                            ← ανά-πρόγραμμα υλικό
 *       └── <κωδικός προγράμματος>/            ← ένας φάκελος ανά πρόγραμμα του πελάτη
 *
 * type: customers=13 / suppliers=12 / other. Χωρίς ΑΦΜ → no-afm-<id>.
 * Τα κοινά έγγραφα μένουν στο documents/ επειδή χρησιμοποιούνται σε πολλά
 * έργα/προγράμματα/tasks· τα ανά-πρόγραμμα στο EuPrograms/<code>/.
 */

export const SUBFOLDER = {
  documents: 'documents',
  gemi: 'documents/gemi',
  services: 'documents/services',
  euPrograms: 'EuPrograms',
} as const

export function trdrTypeSegment(sodtype: number | null | undefined): 'customers' | 'suppliers' | 'other' {
  if (sodtype === 12) return 'suppliers'
  if (sodtype === 13) return 'customers'
  return 'other'
}

function safeAfm(afm: string | null | undefined): string | null {
  const digits = (afm ?? '').replace(/[^0-9]/g, '')
  return digits.length > 0 ? digits : null
}

/** Ρίζα φακέλου πελάτη (με trailing slash). */
export function buildTrdrFolderPath(input: { sodtype: number | null; afm: string | null; id: string }): string {
  const type = trdrTypeSegment(input.sodtype)
  const leaf = safeAfm(input.afm) ?? `no-afm-${input.id}`
  return `partners/${type}/${leaf}/`
}

/** Path-safe segment για τον κωδικό προγράμματος (referenceCode ή slug τίτλου + id). */
export function programFolderSegment(program: { referenceCode: string | null; title: string; id: string }): string {
  const raw = program.referenceCode?.trim()
  if (raw) return raw.replace(/[^A-Za-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '') || `prog-${program.id.slice(0, 8)}`
  const slug = program.title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40)
  return `${slug || 'prog'}-${program.id.slice(0, 8)}`
}

export const documentsFolderPath = (root: string) => `${root}${SUBFOLDER.documents}/`
export const gemiFolderPath = (root: string) => `${root}${SUBFOLDER.gemi}/`
export const servicesFolderPath = (root: string) => `${root}${SUBFOLDER.services}/`
export const euProgramsRootPath = (root: string) => `${root}${SUBFOLDER.euPrograms}/`
export const programFolderPath = (root: string, programSegment: string) => `${root}${SUBFOLDER.euPrograms}/${programSegment}/`

async function keep(path: string): Promise<void> {
  await bunnyUploadPrivate({ key: `${path}.keep`, body: Buffer.from(''), contentType: 'text/plain' })
}

/**
 * Εξασφαλίζει ρίζα + βασική δομή (documents/, EuPrograms/) για τον πελάτη και
 * συμπληρώνει το Trdr.cdnFolder. Idempotent + non-throwing.
 */
export async function ensureTrdrCdnFolder(trdrId: string): Promise<string | null> {
  try {
    const trdr = await prisma.trdr.findUnique({
      where: { id: trdrId },
      select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true },
    })
    if (!trdr) return null

    const root = trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
    // Ρίζα + βασική δομή (κοινά έγγραφα ξεχωριστά από τα ανά-πρόγραμμα).
    await keep(root)
    await keep(documentsFolderPath(root))
    await keep(euProgramsRootPath(root))
    if (!trdr.cdnFolder) await prisma.trdr.update({ where: { id: trdr.id }, data: { cdnFolder: root } })
    return root
  } catch (err) {
    console.error(`ensureTrdrCdnFolder(${trdrId}) απέτυχε:`, err instanceof Error ? err.message : err)
    return null
  }
}

/** Ρίζα πελάτη — από cdnFolder αν υπάρχει, αλλιώς υπολογισμένη. */
async function customerRoot(trdrId: string): Promise<string | null> {
  const trdr = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { id: true, SODTYPE: true, AFM: true, cdnFolder: true } })
  if (!trdr) return null
  return trdr.cdnFolder ?? buildTrdrFolderPath({ sodtype: trdr.SODTYPE, afm: trdr.AFM, id: trdr.id })
}

/** Ο κοινός φάκελος εγγράφων ΓΕΜΗ του πελάτη (για rerouting των GEMI docs). */
export async function trdrGemiFolder(trdrId: string): Promise<string | null> {
  const root = await customerRoot(trdrId)
  return root ? gemiFolderPath(root) : null
}

/** Ο κοινός φάκελος «λοιπών εγγράφων υπηρεσιών» του πελάτη. */
export async function trdrServicesFolder(trdrId: string): Promise<string | null> {
  const root = await customerRoot(trdrId)
  return root ? servicesFolderPath(root) : null
}

/**
 * Ο σωστός φάκελος για upload που σχετίζεται με πελάτη: αν δοθεί programId → ο
 * φάκελος του προγράμματος (EuPrograms/<code>/)· αλλιώς ο κοινός documents/services/.
 * Επιστρέφει path (με trailing slash) ή null.
 */
export async function trdrUploadFolder(trdrId: string, programId?: string | null): Promise<string | null> {
  const root = await customerRoot(trdrId)
  if (!root) return null
  if (programId) {
    const program = await prisma.program.findUnique({ where: { id: programId }, select: { id: true, title: true, referenceCode: true } })
    if (program) return programFolderPath(root, programFolderSegment(program))
  }
  return servicesFolderPath(root)
}

/**
 * Δημιουργεί (idempotent) τον φάκελο ενός προγράμματος μέσα στο EuPrograms/ του
 * πελάτη — καλείται κάθε φορά που συνδέεται πελάτης με πρόγραμμα (δυνητικό ή ενεργό).
 * Επιστρέφει το path ή null. Non-throwing.
 */
export async function ensureTrdrProgramFolder(trdrId: string, programId: string): Promise<string | null> {
  try {
    const [root, program] = await Promise.all([
      customerRoot(trdrId),
      prisma.program.findUnique({ where: { id: programId }, select: { id: true, title: true, referenceCode: true } }),
    ])
    if (!root || !program) return null
    const segment = programFolderSegment(program)
    const path = programFolderPath(root, segment)
    await keep(path)
    return path
  } catch (err) {
    console.error(`ensureTrdrProgramFolder(${trdrId}, ${programId}) απέτυχε:`, err instanceof Error ? err.message : err)
    return null
  }
}
