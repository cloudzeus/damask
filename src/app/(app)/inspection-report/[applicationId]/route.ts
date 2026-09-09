import { prisma } from '@/lib/prisma'
import { requirePermission } from '@/lib/rbac-server'
import { bunnyDownload } from '@/lib/bunny-storage'

export const runtime = 'nodejs'

const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function esc(s: string): string { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }

const IMAGE_MIME: Record<string, string> = { jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', webp: 'image/webp', gif: 'image/gif' }

/** Κατεβάζει ένα αρχείο Bunny και το επιστρέφει ως <img> data-URI αν είναι
 * εικόνα, αλλιώς ένα σημείωμα (PDF/άγνωστο δεν ενσωματώνεται σε Word ως εικόνα). */
async function embedImage(key: string | null | undefined, caption: string): Promise<string> {
  if (!key) return `<p class="miss"><i>${esc(caption)}: —</i></p>`
  const ext = (key.split('.').pop() || '').toLowerCase()
  const mime = IMAGE_MIME[ext]
  if (!mime) return `<p class="miss"><i>${esc(caption)}: αρχείο ${esc(ext.toUpperCase())} (δες ξεχωριστά, δεν ενσωματώνεται ως εικόνα)</i></p>`
  try {
    const bytes = await bunnyDownload(key)
    const b64 = Buffer.from(bytes).toString('base64')
    return `<div class="imgblock"><div class="cap">${esc(caption)}</div><img src="data:${mime};base64,${b64}" /></div>`
  } catch {
    return `<p class="miss"><i>${esc(caption)}: αποτυχία λήψης</i></p>`
  }
}

/** Επιτόπιος έλεγχος — Word (.doc) με όλα τα παραστατικά ανά δαπάνη ως εικόνες:
 * παραστατικό, extrait τράπεζας, φωτογραφία προϊόντος + θέση, βεβαίωση.
 * Gate: 'programs.manage'. */
export async function GET(_request: Request, { params }: { params: Promise<{ applicationId: string }> }) {
  try {
    await requirePermission('programs.manage')
  } catch {
    return new Response('Δεν έχεις δικαίωμα.', { status: 403 })
  }
  const { applicationId } = await params
  const app = await prisma.programApplication.findUnique({
    where: { id: applicationId },
    select: { trdr: { select: { NAME: true, AFM: true } }, program: { select: { title: true } } },
  })
  if (!app) return new Response('Δεν βρέθηκε το έργο.', { status: 404 })

  const expenses = await prisma.programExpense.findMany({
    where: { applicationId, status: 'ACTIVE' },
    orderBy: { createdAt: 'asc' },
    select: {
      description: true, amount: true,
      category: { select: { name: true } },
      supplier: { select: { NAME: true, AFM: true } }, vendor: true, vendorAfm: true,
      purchase: { select: { invoiceNumber: true, serial: true, invoiceKey: true, bankExtraitKey: true, supplierCertKey: true } },
      certification: { select: { photoKey: true, location: true, serialNumber: true, assetRegistryRef: true } },
    },
  })

  const blocks: string[] = []
  for (const [i, e] of expenses.entries()) {
    const p = e.purchase
    const cert = e.certification
    const supplier = e.supplier?.NAME ?? e.vendor ?? '—'
    const serial = p?.serial ?? cert?.serialNumber ?? '—'
    const imgs = [
      await embedImage(p?.invoiceKey, 'Παραστατικό'),
      await embedImage(p?.bankExtraitKey, 'Extrait τράπεζας'),
      await embedImage(cert?.photoKey, 'Φωτογραφία προϊόντος'),
      await embedImage(p?.supplierCertKey, 'Βεβαίωση προμηθευτή'),
    ].join('\n')
    blocks.push(`<div class="exp">
      <h2>${i + 1}. ${esc(e.description)}</h2>
      <table class="meta"><tr><td><b>Κατηγορία:</b> ${esc(e.category?.name ?? '—')}</td><td><b>Προμηθευτής:</b> ${esc(supplier)}</td></tr>
      <tr><td><b>Αρ. παραστατικού:</b> ${esc(p?.invoiceNumber ?? '—')}</td><td><b>Serial:</b> ${esc(serial)}</td></tr>
      <tr><td><b>Ποσό:</b> ${EUR.format(Number(e.amount))} €</td><td><b>Θέση προϊόντος:</b> ${esc(cert?.location ?? '—')}</td></tr>
      ${cert?.assetRegistryRef ? `<tr><td colspan="2"><b>Μητρώο παγίων:</b> ${esc(cert.assetRegistryRef)}</td></tr>` : ''}</table>
      ${imgs}
    </div>`)
  }

  const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head><meta charset="utf-8"><title>Φάκελος επιτόπιου ελέγχου</title>
<style>
  body{font-family:Calibri,Arial,sans-serif;font-size:11pt;color:#111}
  h1{font-size:18pt;color:#001B72;margin:0 0 4pt} .sub{color:#555;font-size:10pt;margin:0 0 16pt}
  .exp{margin:0 0 24pt;page-break-inside:avoid} h2{font-size:13pt;color:#001B72;border-bottom:1px solid #ccc;padding-bottom:3pt}
  table.meta{width:100%;border-collapse:collapse;margin:6pt 0} .meta td{padding:2pt 6pt;font-size:10.5pt;vertical-align:top}
  .imgblock{margin:8pt 0} .cap{font-size:10pt;font-weight:bold;color:#333;margin-bottom:3pt} .imgblock img{max-width:460px;border:1px solid #ccc}
  .miss{color:#999;font-size:10pt;margin:4pt 0}
</style></head>
<body>
  <h1>Φάκελος Επιτόπιου Ελέγχου</h1>
  <p class="sub">${esc(app.trdr.NAME)}${app.trdr.AFM ? ` · ΑΦΜ ${esc(app.trdr.AFM)}` : ''} · ${esc(app.program.title)} · ${new Date().toLocaleDateString('el-GR')}</p>
  ${blocks.join('\n') || '<p>Δεν υπάρχουν δαπάνες.</p>'}
</body></html>`

  const fname = `epitopios-elegxos-${(app.trdr.AFM ?? 'ergo')}.doc`
  return new Response(html, {
    status: 200,
    headers: {
      'Content-Type': 'application/msword; charset=utf-8',
      'Content-Disposition': `attachment; filename="${fname}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
