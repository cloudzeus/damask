import { renderEmailShell, escapeHtml } from '@/lib/mailer'

/** Λίστα ζητούμενων δικαιολογητικών ως HTML (για το email πρόσκλησης). */
function itemsHtml(items: { label: string; required: boolean }[]): string {
  if (items.length === 0) return ''
  return `<ul style="margin:12px 0 0;padding-left:18px;color:#3E5563;font-size:13.5px;">${items
    .map(i => `<li style="margin:0 0 5px;">${escapeHtml(i.label)}${i.required ? '' : ' <span style="color:#8098A5;">(προαιρετικό)</span>'}</li>`)
    .join('')}</ul>`
}

export function fileRequestInviteEmail(input: {
  customerName: string | null
  title: string
  message?: string | null
  items: { label: string; required: boolean }[]
  url: string
  expiresAt: Date
}): { subject: string; html: string } {
  const greeting = input.customerName?.trim() ? `Γεια σας ${escapeHtml(input.customerName.trim())},` : 'Γεια σας,'
  const expires = input.expiresAt.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })
  const html = renderEmailShell({
    preheader: input.title,
    heading: input.title,
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      ${input.message ? `<p style="margin:0 0 12px;">${escapeHtml(input.message)}</p>` : ''}
      <p style="margin:0;">Παρακαλούμε ανεβάστε τα παρακάτω δικαιολογητικά μέσω του ασφαλούς συνδέσμου:</p>
      ${itemsHtml(input.items)}
      <p style="margin:14px 0 0;font-size:12.5px;color:#8098A5;">Ο σύνδεσμος λήγει στις ${expires}.</p>
    `,
    ctaLabel: 'Μεταφόρτωση δικαιολογητικών',
    ctaUrl: input.url,
  })
  return { subject: input.title, html }
}

export function fileRequestCompletedCustomerEmail(input: {
  customerName: string | null
  title: string
}): { subject: string; html: string } {
  const greeting = input.customerName?.trim() ? `Γεια σας ${escapeHtml(input.customerName.trim())},` : 'Γεια σας,'
  const html = renderEmailShell({
    preheader: 'Λάβαμε τα δικαιολογητικά σας',
    heading: 'Λάβαμε τα δικαιολογητικά σας',
    bodyHtml: `
      <p style="margin:0 0 12px;">${greeting}</p>
      <p style="margin:0;">Λάβαμε όλα τα ζητούμενα δικαιολογητικά για «${escapeHtml(input.title)}». Η ομάδα μας θα τα ελέγξει και θα επικοινωνήσει μαζί σας για τα επόμενα βήματα. Σας ευχαριστούμε!</p>
    `,
  })
  return { subject: `Λάβαμε τα δικαιολογητικά — ${input.title}`, html }
}

/** Λίστα ανεβασμένων δικαιολογητικών (τι ζητήθηκε → ποιο αρχείο ανέβηκε). */
function uploadedItemsHtml(items: { label: string; fileName: string | null }[]): string {
  if (items.length === 0) return ''
  return `<ul style="margin:12px 0 0;padding-left:18px;color:#3E5563;font-size:13.5px;">${items
    .map(i => `<li style="margin:0 0 5px;"><b>${escapeHtml(i.label)}</b>${i.fileName ? ` — <span style="color:#001B72;">${escapeHtml(i.fileName)}</span>` : ''}</li>`)
    .join('')}</ul>`
}

export function fileRequestCompletedStaffEmail(input: {
  title: string
  customerName: string | null
  adminUrl: string
  itemCount: number
  items?: { label: string; fileName: string | null }[]
}): { subject: string; html: string } {
  const name = input.customerName?.trim() || 'Πελάτης'
  const items = input.items ?? []
  const html = renderEmailShell({
    preheader: `Ολοκληρώθηκε: ${input.title}`,
    heading: 'Ολοκληρώθηκε αίτημα δικαιολογητικών',
    bodyHtml: `
      <p style="margin:0 0 12px;">Ο πελάτης <b>${escapeHtml(name)}</b> ανέβασε όλα τα ζητούμενα δικαιολογητικά (${input.itemCount}) για «${escapeHtml(input.title)}».</p>
      ${items.length ? '<p style="margin:0 0 4px;font-weight:700;color:#001B72;">Δικαιολογητικά που ανέβηκαν</p>' : ''}
      ${uploadedItemsHtml(items)}
      <p style="margin:14px 0 0;">Μπορείτε να τα ελέγξετε στο διαχειριστικό.</p>
    `,
    ctaLabel: 'Άνοιγμα',
    ctaUrl: input.adminUrl,
  })
  return { subject: `Ολοκληρώθηκε αίτημα — ${input.title}`, html }
}
