'use server'

import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { bunnyUploadPrivate } from '@/lib/bunny-storage'
import { extractDocument } from '@/lib/ocr/extract'
import { classifyDocumentCore } from '@/lib/documents/smart-classify-core'
import { createNotification } from '@/lib/notifications/service'
import { grantContactPortalAccess } from '@/lib/portal/contact-access'
import { resolvePortalContact, portalApplicationsWhere } from '@/lib/pm/portal-session'
import { TEAM_ROLES } from '@/lib/pm/portal-roles'

/**
 * Portal πελάτη (συνδεδεμένη επαφή):
 *  • checkPortalDocument — η AI «διαβάζει» ό,τι ανεβάζει ο πελάτης και του λέει αν είναι το σωστό έγγραφο
 *    (τύπος, επιχείρηση/ΑΦΜ, λήξη) ΠΡΙΝ ανέβει.
 *  • Τα δικαιολογητικά μου — η αποθήκη δικαιολογητικών της επιχείρησης (λίστα, λήψη, νέο ανέβασμα).
 *  • Η ομάδα σας — λογιστής / υπεύθυνος έργου κ.λπ.: γίνονται επαφές του πελάτη (και στο admin) και
 *    συνδέονται με τα έργα ώστε να λαμβάνουν τις σχετικές ειδοποιήσεις.
 */

const MAX_BYTES = 8 * 1024 * 1024

// ── 1. Έλεγχος εγγράφου με AI ─────────────────────────────────────────────

const checkSchema = z.object({
  obligationId: z.string().optional(),
  documentTypeId: z.string().optional(),
  fileName: z.string().min(1).max(300),
  text: z.string().max(20_000).optional(),
  images: z.array(z.object({ base64: z.string().min(1).max(8_000_000), mimeType: z.enum(['image/jpeg', 'image/png', 'image/webp']) })).max(2).optional(),
})

export type PortalDocCheck = {
  verdict: 'match' | 'mismatch' | 'foreign' | 'expired' | 'unknown'
  message: string
  expectedName: string | null
  detectedTypeId: string | null
  detectedName: string | null
  expiresAt: string | null
  issuedAt: string | null
}

const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
const words = (s: string) => new Set(fold(s).split(/[^a-zα-ω0-9]+/i).filter(w => w.length >= 3))
function overlap(a: Set<string>, b: Set<string>) { if (!a.size || !b.size) return 0; let n = 0; for (const w of a) if (b.has(w)) n++; return n / Math.min(a.size, b.size) }
const dayEl = (iso: string) => new Date(iso).toLocaleDateString('el-GR')

export async function checkPortalDocument(raw: z.input<typeof checkSchema>): Promise<{ ok: true; check: PortalDocCheck } | { ok: false; message: string }> {
  const contact = await resolvePortalContact()
  if (!contact) return { ok: false, message: 'Δεν έχετε πρόσβαση.' }
  const parsed = checkSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'Μη έγκυρο αρχείο.' }
  const input = parsed.data

  // Τι περιμένουμε: τύπος του ζητούμενου εντύπου (μέσω ProgramRequiredForm) ή ό,τι διάλεξε ο πελάτης.
  let expectedTypeId = input.documentTypeId ?? null
  let expectedName: string | null = null
  if (input.obligationId) {
    const o = await prisma.applicationObligation.findUnique({ where: { id: input.obligationId }, select: { name: true, sourceId: true, application: { select: { trdrId: true } } } })
    if (!o || o.application.trdrId !== contact.trdrId) return { ok: false, message: 'Το έντυπο δεν βρέθηκε.' }
    expectedName = o.name
    if (o.sourceId) expectedTypeId = (await prisma.programRequiredForm.findUnique({ where: { id: o.sourceId }, select: { documentTypeId: true } }))?.documentTypeId ?? expectedTypeId
  }
  if (expectedTypeId && !expectedName) expectedName = (await prisma.documentType.findUnique({ where: { id: expectedTypeId }, select: { name: true } }))?.name ?? null

  try {
    let text = input.text ?? ''
    if (text.trim().length < 80 && input.images?.length) {
      const ocr = await extractDocument({ images: input.images, text: text || undefined, docType: 'auto' }).catch(() => null)
      if (ocr) text = JSON.stringify(ocr.data).slice(0, 3000)
    }
    const cls = await classifyDocumentCore({ trdrId: contact.trdrId, fileName: input.fileName, text })
    const r = cls.ok ? cls.result : null
    const detectedName = r?.typeId ? (await prisma.documentType.findUnique({ where: { id: r.typeId }, select: { name: true } }))?.name ?? null : null
    const base = { expectedName, detectedTypeId: r?.typeId ?? null, detectedName, expiresAt: r?.expiresAt ?? null, issuedAt: r?.issuedAt ?? null }

    if (r?.company.status === 'MISMATCH') {
      return { ok: true, check: { ...base, verdict: 'foreign', message: 'Το έγγραφο φαίνεται να αφορά άλλη επιχείρηση (διαφορετικό ΑΦΜ ή επωνυμία). Ελέγξτε ότι επιλέξατε το σωστό αρχείο.' } }
    }
    if (r?.expiresAt && new Date(r.expiresAt).getTime() < Date.now()) {
      return { ok: true, check: { ...base, verdict: 'expired', message: `Το έγγραφο έχει λήξει (${dayEl(r.expiresAt)}). Χρειαζόμαστε ένα σε ισχύ — εκδώστε νέο και ανεβάστε το.` } }
    }
    const sameType = expectedTypeId && r?.typeId ? expectedTypeId === r.typeId : null
    const nameMatch = expectedName && detectedName ? overlap(words(expectedName), words(detectedName)) >= 0.5 || fold(expectedName).includes(fold(detectedName)) : null
    const match = sameType ?? nameMatch
    const validTxt = r?.expiresAt ? ` Ισχύει έως ${dayEl(r.expiresAt)}.` : ''
    if (match === true || (!expectedName && detectedName)) {
      return { ok: true, check: { ...base, verdict: 'match', message: `Είναι το σωστό έγγραφο${detectedName ? `: «${detectedName}»` : ''}.${validTxt}` } }
    }
    if (match === false && detectedName && (r?.confidence ?? 0) >= 0.55) {
      return { ok: true, check: { ...base, verdict: 'mismatch', message: `Αυτό μοιάζει με «${detectedName}», ενώ εδώ ζητάμε «${expectedName}». Βεβαιωθείτε ότι ανεβάζετε το σωστό αρχείο.` } }
    }
    return { ok: true, check: { ...base, verdict: 'unknown', message: 'Δεν μπορέσαμε να αναγνωρίσουμε με σιγουριά το έγγραφο. Μπορείτε να το ανεβάσετε — θα το ελέγξει ο σύμβουλός σας.' } }
  } catch {
    return { ok: true, check: { verdict: 'unknown', message: 'Ο αυτόματος έλεγχος δεν ήταν διαθέσιμος. Μπορείτε να το ανεβάσετε — θα το ελέγξει ο σύμβουλός σας.', expectedName, detectedTypeId: null, detectedName: null, expiresAt: null, issuedAt: null } }
  }
}

// ── 2. Τα δικαιολογητικά μου (αποθήκη πελάτη) ─────────────────────────────

export type MyDocument = { id: string; name: string; typeName: string; issuedAt: string | null; expiresAt: string | null; status: 'valid' | 'expiring' | 'expired'; program: string | null; createdAt: string }
export type MyDocumentsView = { ok: true; documents: MyDocument[]; types: { id: string; name: string }[]; preview: boolean } | { ok: false }

export async function listMyDocuments(previewContactId?: string): Promise<MyDocumentsView> {
  const contact = await resolvePortalContact(previewContactId)
  if (!contact) return { ok: false }
  const [docs, types] = await Promise.all([
    prisma.trdrDossierDocument.findMany({
      where: { trdrId: contact.trdrId }, orderBy: [{ createdAt: 'desc' }],
      select: { id: true, name: true, issuedAt: true, expiresAt: true, createdAt: true, documentType: { select: { name: true } }, program: { select: { title: true } } },
    }),
    prisma.documentType.findMany({ where: { active: true }, orderBy: { name: 'asc' }, select: { id: true, name: true } }),
  ])
  const now = Date.now(), soon = now + 30 * 86_400_000
  return {
    ok: true, preview: contact.preview, types,
    documents: docs.map(d => ({
      id: d.id, name: d.name, typeName: d.documentType.name, program: d.program?.title ?? null,
      issuedAt: d.issuedAt?.toISOString() ?? null, expiresAt: d.expiresAt?.toISOString() ?? null, createdAt: d.createdAt.toISOString(),
      status: d.expiresAt && d.expiresAt.getTime() < now ? 'expired' : d.expiresAt && d.expiresAt.getTime() < soon ? 'expiring' : 'valid',
    })),
  }
}

const uploadSchema = z.object({
  documentTypeId: z.string().min(1),
  filename: z.string().min(1).max(200),
  base64: z.string().min(1),
  mimeType: z.string().max(120),
  issuedAt: z.string().nullable().optional(),
  expiresAt: z.string().nullable().optional(),
})

/** Νέο δικαιολογητικό στην αποθήκη της επιχείρησης (από το portal). */
export async function uploadMyDocument(raw: z.input<typeof uploadSchema>): Promise<{ ok: boolean; message: string }> {
  const contact = await resolvePortalContact()
  if (!contact || contact.preview) return { ok: false, message: 'Δεν έχετε πρόσβαση.' }
  const parsed = uploadSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'Μη έγκυρα στοιχεία.' }
  const f = parsed.data
  const type = await prisma.documentType.findUnique({ where: { id: f.documentTypeId }, select: { id: true, name: true } })
  if (!type) return { ok: false, message: 'Διαλέξτε τύπο εγγράφου.' }
  const body = Buffer.from(f.base64, 'base64')
  if (!body.length) return { ok: false, message: 'Το αρχείο είναι κενό.' }
  if (body.length > MAX_BYTES) return { ok: false, message: 'Το αρχείο ξεπερνά τα 8MB.' }
  const ext = (f.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '').slice(0, 8) || 'bin'
  const key = `dossier/${contact.trdrId}/portal-${Date.now()}.${ext}`
  await bunnyUploadPrivate({ key, body, contentType: f.mimeType || 'application/octet-stream' })
  const toDate = (s?: string | null) => (s && !Number.isNaN(Date.parse(s)) ? new Date(s) : null)
  await prisma.trdrDossierDocument.create({
    data: { trdrId: contact.trdrId, documentTypeId: type.id, name: f.filename, storageKey: key, mimeType: f.mimeType, sizeBytes: body.length, issuedAt: toDate(f.issuedAt), expiresAt: toDate(f.expiresAt) },
  })
  await createNotification({ title: `Νέο δικαιολογητικό από πελάτη: ${contact.trdr?.NAME ?? ''}`, body: `${contact.name} ανέβασε «${type.name}» στο portal.`, entityType: 'Trdr', entityId: contact.trdrId, meta: { kind: 'portal-dossier-upload' } })
  return { ok: true, message: `Το «${type.name}» αποθηκεύτηκε στα δικαιολογητικά σας.` }
}

// ── 3. Η ομάδα σας (λογιστής / υπεύθυνος έργου) ───────────────────────────

export type TeamMember = { id: string; name: string; role: string | null; email: string | null; phone: string | null; isMe: boolean; hasPortal: boolean; programs: { applicationId: string; title: string }[] }
export type TeamView = { ok: true; members: TeamMember[]; applications: { applicationId: string; title: string }[]; preview: boolean } | { ok: false }

export async function listMyTeam(previewContactId?: string): Promise<TeamView> {
  const contact = await resolvePortalContact(previewContactId)
  if (!contact) return { ok: false }
  const [contacts, apps] = await Promise.all([
    prisma.contact.findMany({
      where: { trdrId: contact.trdrId }, orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }],
      select: { id: true, name: true, position: true, email: true, phone: true, mobile: true, userId: true, applicationLinks: { select: { applicationId: true, role: true, application: { select: { program: { select: { title: true } } } } } } },
    }),
    prisma.programApplication.findMany({ where: portalApplicationsWhere(contact), select: { id: true, program: { select: { title: true } } } }),
  ])
  const visible = new Set(apps.map(a => a.id))
  return {
    ok: true, preview: contact.preview,
    applications: apps.map(a => ({ applicationId: a.id, title: a.program?.title ?? '—' })),
    members: contacts.map(c => ({
      id: c.id, name: c.name, email: c.email, phone: c.mobile || c.phone, isMe: c.id === contact.id, hasPortal: !!c.userId,
      role: c.applicationLinks.find(l => l.role)?.role ?? c.position,
      programs: c.applicationLinks.filter(l => visible.has(l.applicationId)).map(l => ({ applicationId: l.applicationId, title: l.application.program?.title ?? '—' })),
    })),
  }
}

const memberSchema = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().trim().email().max(160),
  phone: z.string().trim().max(40).optional(),
  role: z.enum(TEAM_ROLES),
  applicationIds: z.array(z.string()).max(50),
  portalAccess: z.boolean(),
})

/**
 * Προσθήκη ατόμου της επιχείρησης (π.χ. λογιστή): Contact του πελάτη (φαίνεται και στο admin) +
 * σύνδεση με τα επιλεγμένα έργα (ρόλος) ώστε να λαμβάνει τις ειδοποιήσεις τους + προαιρετικά πρόσβαση portal.
 */
export async function addTeamMember(raw: z.input<typeof memberSchema>): Promise<{ ok: boolean; message: string }> {
  const contact = await resolvePortalContact()
  if (!contact || contact.preview) return { ok: false, message: 'Δεν έχετε πρόσβαση.' }
  const parsed = memberSchema.safeParse(raw)
  if (!parsed.success) return { ok: false, message: 'Συμπληρώστε όνομα, σωστό email και ρόλο.' }
  const m = parsed.data
  const allowed = new Set((await prisma.programApplication.findMany({ where: portalApplicationsWhere(contact), select: { id: true } })).map(a => a.id))
  const appIds = m.applicationIds.filter(id => allowed.has(id))
  const email = m.email.toLowerCase()

  // Ίδιο email στην ίδια επιχείρηση → ενημέρωση της υπάρχουσας επαφής (όχι διπλή).
  const existing = await prisma.contact.findFirst({ where: { trdrId: contact.trdrId, email: { equals: email, mode: 'insensitive' } }, select: { id: true } })
  const member = existing
    ? await prisma.contact.update({ where: { id: existing.id }, data: { name: m.name, position: m.role, ...(m.phone ? { mobile: m.phone } : {}) }, select: { id: true } })
    : await prisma.contact.create({ data: { trdrId: contact.trdrId, name: m.name, email, mobile: m.phone || null, position: m.role, COMMENTS: `Προστέθηκε από το portal (${contact.name})` }, select: { id: true } })
  for (const applicationId of appIds) {
    await prisma.applicationContact.upsert({
      where: { applicationId_contactId: { applicationId, contactId: member.id } },
      update: { role: m.role }, create: { applicationId, contactId: member.id, role: m.role },
    })
  }
  let portalNote = ''
  if (m.portalAccess) {
    const g = await grantContactPortalAccess(member.id)
    portalNote = g.ok ? ' Του στείλαμε email για να ορίσει κωδικό στο portal.' : ''
  }
  await createNotification({
    title: `${contact.trdr?.NAME ?? 'Πελάτης'}: νέα επαφή (${m.role})`,
    body: `${contact.name} πρόσθεσε τον/την ${m.name} (${email}) ως «${m.role}» σε ${appIds.length} έργο/α μέσω του portal.`,
    entityType: 'Trdr', entityId: contact.trdrId, meta: { kind: 'portal-team-add', contactId: member.id },
  })
  return { ok: true, message: `Ο/Η ${m.name} προστέθηκε ως «${m.role}» και θα λαμβάνει τις ειδοποιήσεις των έργων που επιλέξατε.${portalNote}` }
}

/** Αφαίρεση ατόμου από τα έργα (η επαφή μένει στο ιστορικό της επιχείρησης). */
export async function removeTeamMember(contactId: string): Promise<{ ok: boolean; message: string }> {
  const contact = await resolvePortalContact()
  if (!contact || contact.preview) return { ok: false, message: 'Δεν έχετε πρόσβαση.' }
  if (contactId === contact.id) return { ok: false, message: 'Δεν μπορείτε να αφαιρέσετε τον εαυτό σας.' }
  const target = await prisma.contact.findUnique({ where: { id: contactId }, select: { trdrId: true, name: true } })
  if (!target || target.trdrId !== contact.trdrId) return { ok: false, message: 'Η επαφή δεν βρέθηκε.' }
  const allowed = (await prisma.programApplication.findMany({ where: portalApplicationsWhere(contact), select: { id: true } })).map(a => a.id)
  await prisma.applicationContact.deleteMany({ where: { contactId, applicationId: { in: allowed } } })
  await createNotification({ title: `${contact.trdr?.NAME ?? 'Πελάτης'}: αφαίρεση επαφής από έργα`, body: `${contact.name} αφαίρεσε τον/την ${target.name} από τα έργα μέσω του portal.`, entityType: 'Trdr', entityId: contact.trdrId, meta: { kind: 'portal-team-remove', contactId } })
  return { ok: true, message: `Ο/Η ${target.name} δεν θα λαμβάνει πλέον ειδοποιήσεις για τα έργα σας.` }
}

// ── 4. Ευκαιρίες ένταξης ───────────────────────────────────────────────────

export type Opportunity = { programId: string; title: string; summary: string | null; rate: string | null; deadline: string | null; slug: string | null; fit: 'eligible' | 'check' | 'no'; reasons: string[] }

const CRITERION_LABEL: Record<string, string> = { kad: 'ΚΑΔ', region: 'περιοχή', legalForm: 'νομική μορφή', size: 'μέγεθος (ΕΜΕ)', age: 'έτη λειτουργίας' }
export type OpportunitiesView = { ok: true; items: Opportunity[]; preview: boolean } | { ok: false }

/** Ενεργά προγράμματα που ταιριάζουν στην επιχείρηση (ΚΑΔ/περιφέρεια/μορφή/ΕΜΕ/έτη) και δεν τα έχει ήδη. */
export async function listOpportunities(previewContactId?: string, opts: { includeNonMatching?: boolean } = {}): Promise<OpportunitiesView> {
  const contact = await resolvePortalContact(previewContactId)
  if (!contact) return { ok: false }
  const { computeSinglePair } = await import('@/lib/prospects/evaluate-pair')
  const today = new Date(new Date().toISOString().slice(0, 10))
  const [programs, mine] = await Promise.all([
    prisma.program.findMany({
      where: { status: 'ACTIVE', OR: [{ submissionEnd: null }, { submissionEnd: { gte: today } }] },
      orderBy: { submissionEnd: 'asc' }, take: 30,
      select: { id: true, title: true, summary: true, fundingRate: true, submissionEnd: true, publicSlug: true },
    }),
    prisma.programApplication.findMany({ where: { trdrId: contact.trdrId }, select: { programId: true } }),
  ])
  const have = new Set(mine.map(m => m.programId))
  const items: Opportunity[] = []
  for (const p of programs.filter(p => !have.has(p.id))) {
    const fit = await computeSinglePair(contact.trdrId, p.id).catch(() => null)
    const failed = fit?.failed ?? []
    // Στην επισκόπηση μόνο όσα ταιριάζουν· στη σελίδα «Ευκαιρίες» όλα, με εξήγηση.
    if (failed.length && !opts.includeNonMatching) continue
    items.push({
      reasons: failed.length ? failed.map(k => CRITERION_LABEL[k] ?? k) : (fit?.unknown ?? []).map(k => CRITERION_LABEL[k] ?? k),
      programId: p.id, title: p.title, summary: p.summary?.slice(0, 220) ?? null, slug: p.publicSlug,
      rate: p.fundingRate != null ? `έως ${Number(p.fundingRate)}%` : null, deadline: p.submissionEnd?.toISOString() ?? null,
      fit: failed.length ? 'no' : fit?.eligible && !fit.unknown.length ? 'eligible' : 'check',
    })
  }
  const rank = { eligible: 0, check: 1, no: 2 } as const
  items.sort((a, b) => rank[a.fit] - rank[b.fit])
  return { ok: true, items, preview: contact.preview }
}

/** «Ενδιαφέρομαι»: το πρόγραμμα γίνεται δυνητικό έργο του πελάτη (φαίνεται στο admin) + ειδοποίηση στο γραφείο. */
export async function expressInterest(programId: string): Promise<{ ok: boolean; message: string }> {
  const contact = await resolvePortalContact()
  if (!contact || contact.preview) return { ok: false, message: 'Δεν έχετε πρόσβαση.' }
  const program = await prisma.program.findFirst({ where: { id: programId, status: 'ACTIVE' }, select: { id: true, title: true } })
  if (!program) return { ok: false, message: 'Το πρόγραμμα δεν είναι πλέον ενεργό.' }
  const app = await prisma.programApplication.upsert({
    where: { trdrId_programId: { trdrId: contact.trdrId, programId } },
    create: { trdrId: contact.trdrId, programId, lifecycle: 'POTENTIAL', notes: `Εκδήλωση ενδιαφέροντος από το portal — ${contact.name} (${new Date().toLocaleDateString('el-GR')})` },
    update: {},
    select: { id: true },
  })
  await prisma.applicationContact.upsert({
    where: { applicationId_contactId: { applicationId: app.id, contactId: contact.id } },
    update: {}, create: { applicationId: app.id, contactId: contact.id, role: 'Εκδήλωση ενδιαφέροντος' },
  })
  await createNotification({
    title: `Ενδιαφέρον για πρόγραμμα: ${contact.trdr?.NAME ?? 'πελάτης'}`,
    body: `${contact.name} δήλωσε ενδιαφέρον για «${program.title}» μέσω του portal. Το έργο προστέθηκε ως δυνητικό — επικοινωνήστε για αξιολόγηση.`,
    entityType: 'Trdr', entityId: contact.trdrId, meta: { kind: 'portal-interest', applicationId: app.id, programId },
  })
  return { ok: true, message: `Ευχαριστούμε! Καταγράψαμε το ενδιαφέρον σας για «${program.title}» — ο σύμβουλός σας θα επικοινωνήσει μαζί σας για την αξιολόγηση.` }
}

// ── 5. Επιλογή επιχείρησης & προεπισκόπηση προσωπικού ─────────────────────

/** Ο χρήστης είναι επαφή σε πολλές επιχειρήσεις → διαλέγει ποια βλέπει (cookie). */
export async function selectPortalCompany(contactId: string): Promise<{ ok: boolean }> {
  const { portalCompanies, PORTAL_COMPANY_COOKIE } = await import('@/lib/pm/portal-session')
  const mine = await portalCompanies()
  if (!mine.some(c => c.contactId === contactId)) return { ok: false }
  const { cookies } = await import('next/headers')
  ;(await cookies()).set(PORTAL_COMPANY_COOKIE, contactId, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', path: '/portal', maxAge: 60 * 60 * 24 * 365 })
  return { ok: true }
}

export type PreviewableContact = { contactId: string; name: string; company: string; apps: number; hasPortal: boolean }

/** Για χρήστες του γραφείου που ανοίγουν το /portal: επαφές πελατών με έργα, για «προβολή ως επαφή». */
export async function listPreviewableContacts(query?: string): Promise<PreviewableContact[] | null> {
  const { auth } = await import('@/auth')
  const { can } = await import('@/lib/rbac')
  const session = await auth()
  if (!session?.user || session.user.portalHome || !can(session, 'customer.view')) return null
  const q = query?.trim()
  const rows = await prisma.contact.findMany({
    where: {
      trdr: { programApplications: { some: {} } },
      ...(q ? { OR: [{ name: { contains: q, mode: 'insensitive' } }, { email: { contains: q, mode: 'insensitive' } }, { trdr: { NAME: { contains: q, mode: 'insensitive' } } }] } : {}),
    },
    orderBy: [{ isPrimary: 'desc' }, { name: 'asc' }], take: 40,
    select: { id: true, name: true, userId: true, trdr: { select: { NAME: true, _count: { select: { programApplications: true } } } } },
  })
  return rows.map(r => ({ contactId: r.id, name: r.name, company: r.trdr.NAME, apps: r.trdr._count.programApplications, hasPortal: !!r.userId }))
}

// ── 6. Η επιχείρηση ───────────────────────────────────────────────────────

export type MyCompany = {
  name: string; afm: string | null; doy: string | null; address: string | null; legalForm: string | null; gemi: string | null
  founded: string | null; employees: number | null; eme: number | null; email: string | null; phone: string | null
  mainKad: { code: string; description: string } | null; otherKads: number; contactRole: string | null
}

/** Τα στοιχεία της επιχείρησης όπως τα έχουμε (για έλεγχο από τον πελάτη — αλλαγές μέσω του συμβούλου). */
export async function getMyCompany(previewContactId?: string): Promise<MyCompany | null> {
  const contact = await resolvePortalContact(previewContactId)
  if (!contact) return null
  const [t, me] = await Promise.all([
    prisma.trdr.findUnique({
      where: { id: contact.trdrId },
      select: { NAME: true, AFM: true, IRSDATA: true, ADDRESS: true, ZIP: true, CITY: true, appLegalForm: true, aadeFirmKind: true, arGemi: true, foundingDate: true, appEmployees: true, appEme: true, EMAIL: true, PHONE01: true, kads: { orderBy: [{ kind: 'asc' }, { order: 'asc' }], select: { code: true, description: true, kind: true } } },
    }),
    prisma.contact.findUnique({ where: { id: contact.id }, select: { position: true } }),
  ])
  if (!t) return null
  const doy = t.IRSDATA ? (await prisma.irsdata.findFirst({ where: { CODE: t.IRSDATA }, select: { NAME: true } }).catch(() => null))?.NAME ?? t.IRSDATA : null
  const main = t.kads.find(k => k.kind === 'PRIMARY') ?? t.kads[0] ?? null
  return {
    name: t.NAME, afm: t.AFM, doy, address: [t.ADDRESS, t.ZIP, t.CITY].filter(Boolean).join(', ') || null,
    legalForm: t.appLegalForm || t.aadeFirmKind, gemi: t.arGemi, founded: t.foundingDate?.toISOString() ?? null,
    employees: t.appEmployees, eme: t.appEme != null ? Number(t.appEme) : null, email: t.EMAIL, phone: t.PHONE01,
    mainKad: main ? { code: main.code, description: main.description } : null, otherKads: Math.max(0, t.kads.length - (main ? 1 : 0)),
    contactRole: me?.position ?? null,
  }
}

// ── 7. Κριτική Google ─────────────────────────────────────────────────────

/** Σύνδεσμος κριτικής Google για την κάρτα του portal (όταν ο πελάτης έχει εγκεκριμένο έργο). */
export async function portalReviewUrl(): Promise<string> {
  const { googleReviewUrl } = await import('@/lib/reviews/review-requests')
  return googleReviewUrl()
}
