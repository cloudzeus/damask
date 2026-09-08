import type { PromoProgram } from '@/lib/referrals/actions'

/**
 * Client-side δόμηση εκτυπώσιμου promo (ένα ανά πρόγραμμα) που η εταιρία
 * παραπομπής στέλνει στους πελάτες της. Ανοίγει σε νέα καρτέλα ένα αυτόνομο,
 * Greek-safe HTML (WWA χρώματα, A4 print CSS) με κουμπί «Αποθήκευση PDF».
 * Δεν χρειάζεται PDF library — ο χρήστης σώζει ως PDF από τον browser
 * (τα standard PDF fonts δεν υποστηρίζουν ελληνικά· ο browser ναι).
 */

const EUR = new Intl.NumberFormat('el-GR', { maximumFractionDigits: 0 })
const DATE = new Intl.DateTimeFormat('el-GR', { day: 'numeric', month: 'long', year: 'numeric' })

function esc(s: string): string {
  return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}
function budgetShort(a: number): string {
  if (a >= 1_000_000_000) return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(a / 1_000_000_000)} δισ. €`
  if (a >= 1_000_000) return `${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(a / 1_000_000)} εκατ. €`
  return `${EUR.format(a)} €`
}

export function buildPromoHtml(p: PromoProgram): string {
  const stats: { label: string; value: string }[] = []
  if (p.fundingRate != null) stats.push({ label: 'Ποσοστό επιδότησης', value: `έως ${new Intl.NumberFormat('el-GR', { maximumFractionDigits: 1 }).format(p.fundingRate)}%` })
  if (p.totalBudget != null) stats.push({ label: 'Προϋπολογισμός', value: budgetShort(p.totalBudget) })
  if (p.durationMonths != null) stats.push({ label: 'Διάρκεια', value: `${p.durationMonths} μήνες` })
  if (p.submissionEnd) stats.push({ label: 'Προθεσμία υποβολής', value: DATE.format(new Date(p.submissionEnd)) })

  const statsHtml = stats.map(s => `
    <div class="stat">
      <div class="stat-v">${esc(s.value)}</div>
      <div class="stat-l">${esc(s.label)}</div>
    </div>`).join('')

  const cta = p.publicUrl
    ? `<a class="cta" href="${esc(p.publicUrl)}">Δείτε αν δικαιούστε — ${esc(p.publicUrl.replace(/^https?:\/\//, ''))}</a>`
    : ''

  return `<!doctype html><html lang="el"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Promo — ${esc(p.title)}</title>
<style>
  :root{--navy:#001B72;--navy950:#000022;--cyan:#34C8F6;--ink:#0B0F2A;--muted:#666C80;--canvas:#F6F7FA;--rule:#DFE2EA}
  *{box-sizing:border-box}
  body{margin:0;font:15px/1.6 Roboto,system-ui,Arial,sans-serif;color:var(--ink);background:var(--canvas)}
  .bar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid var(--rule)}
  .bar button{cursor:pointer;border:0;border-radius:999px;padding:10px 22px;font:700 14px Roboto,sans-serif;background:var(--navy);color:#fff}
  .bar .ghost{background:#fff;color:var(--navy);border:1px solid var(--navy)}
  .sheet{max-width:820px;margin:20px auto;background:#fff;box-shadow:0 4px 24px rgba(0,0,34,.1)}
  .hero{background:var(--navy950);color:#fff;padding:40px 44px;position:relative}
  .hero::before{content:"";position:absolute;left:0;right:0;top:0;height:4px;background:linear-gradient(90deg,var(--cyan),var(--navy) 60%,transparent)}
  .eyebrow{font:700 12px Roboto,sans-serif;letter-spacing:.12em;text-transform:uppercase;color:var(--cyan);margin-bottom:10px}
  h1{font-family:'Roboto Condensed',Roboto,sans-serif;font-weight:900;text-transform:uppercase;letter-spacing:.01em;font-size:30px;line-height:1.1;margin:0}
  .ref{margin-top:10px;font-size:12px;color:rgba(255,255,255,.6)}
  .stats{display:flex;flex-wrap:wrap;gap:14px;padding:26px 44px;background:#fff;border-bottom:1px solid var(--rule)}
  .stat{flex:1 1 140px;min-width:140px}
  .stat-v{font-family:'Roboto Condensed',Roboto,sans-serif;font-weight:700;font-size:26px;color:var(--navy)}
  .stat-l{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.04em}
  .body{padding:28px 44px}
  .body h2{font-family:'Roboto Condensed',Roboto,sans-serif;font-weight:900;text-transform:uppercase;font-size:18px;color:var(--ink);margin:0 0 10px}
  .summary{font-size:15px;color:#31374a;white-space:pre-wrap}
  ul.help{list-style:none;padding:0;margin:18px 0 0}
  ul.help li{position:relative;padding:6px 0 6px 26px;font-size:14px}
  ul.help li::before{content:"✓";position:absolute;left:0;color:var(--navy);font-weight:900}
  .cta{display:inline-block;margin-top:22px;background:var(--navy);color:#fff;text-decoration:none;border-radius:999px;padding:13px 26px;font-weight:700;font-size:14px}
  .foot{padding:22px 44px;background:var(--canvas);border-top:1px solid var(--rule);font-size:12px;color:var(--muted)}
  .foot b{color:var(--ink)}
  @media print{
    .bar{display:none}
    body{background:#fff}
    .sheet{box-shadow:none;margin:0;max-width:none}
    @page{margin:14mm}
  }
</style></head>
<body>
  <div class="bar">
    <button onclick="window.print()">Αποθήκευση ως PDF / Εκτύπωση</button>
    <button class="ghost" onclick="window.close()">Κλείσιμο</button>
  </div>
  <div class="sheet">
    <div class="hero">
      <div class="eyebrow">Πρόγραμμα ΕΣΠΑ · Ευκαιρία χρηματοδότησης</div>
      <h1>${esc(p.title)}</h1>
      ${p.referenceCode ? `<div class="ref">Κωδικός: ${esc(p.referenceCode)}</div>` : ''}
    </div>
    ${stats.length ? `<div class="stats">${statsHtml}</div>` : ''}
    <div class="body">
      ${p.summary ? `<h2>Σε λίγα λόγια</h2><div class="summary">${esc(p.summary)}</div>` : ''}
      <h2 style="margin-top:24px">Πώς μπορούμε να βοηθήσουμε</h2>
      <ul class="help">
        <li>Έλεγχος επιλεξιμότητας της επιχείρησής σας — δωρεάν και χωρίς δέσμευση.</li>
        <li>Σύνταξη &amp; υποβολή του φακέλου από έμπειρους συμβούλους.</li>
        <li>Παρακολούθηση της υλοποίησης έως την εκταμίευση της επιδότησης.</li>
      </ul>
      ${cta}
    </div>
    <div class="foot">
      <b>World Wide Associates</b> — Σύμβουλοι ΕΣΠΑ &amp; ευρωπαϊκών προγραμμάτων · 210 721 8758 · info@wwa-espa.com
    </div>
  </div>
</body></html>`
}

/** Ανοίγει το promo σε νέα καρτέλα. Επιστρέφει false αν το popup μπλοκαρίστηκε. */
export function openPromo(p: PromoProgram): boolean {
  const html = buildPromoHtml(p)
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open()
  w.document.write(html)
  w.document.close()
  return true
}
