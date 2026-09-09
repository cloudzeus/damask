import type { BudgetProposal, ProposalCategory, ProposalExpense } from '@/lib/programs/expense-proposal'

/**
 * Εκτυπώσιμη «Πρόταση Υποβολής Προϋπολογισμού» (client) — αυτόνομο Greek-safe HTML
 * με A4 print CSS + κουμπί «Αποθήκευση ως PDF». Ίδιο pattern με promo-html.ts
 * (print-to-PDF από browser, χωρίς PDF library).
 */

const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
function esc(s: string): string { return s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!)) }
const STATUS_LABEL: Record<string, string> = { OK: 'Εντός ορίων', OVER: 'ΥΠΕΡΒΑΣΗ', UNDER: 'Κάτω ελαχίστου' }

export function buildProposalHtml(p: BudgetProposal): string {
  const byCat = new Map<string | null, ProposalExpense[]>()
  for (const e of p.expenses) { const a = byCat.get(e.categoryId) ?? []; a.push(e); byCat.set(e.categoryId, a) }

  const catBlock = (c: ProposalCategory) => {
    const items = byCat.get(c.id) ?? []
    const rows = items.map(e => `<tr>
      <td>${esc(e.description)}</td>
      <td>${esc(e.supplierName ?? '—')}${e.supplierAfm ? ` <span class="afm">(${esc(e.supplierAfm)})</span>` : ''}</td>
      <td class="q">${e.hasQuote ? '✓ προσφορά' : '<span class="miss">λείπει</span>'}</td>
      <td class="num">${EUR.format(e.amount)} €</td>
    </tr>`).join('')
    return `<div class="cat">
      <div class="cat-h">
        <span class="cat-n">${esc(c.name)}${c.mandatory ? ' <span class="req">υποχρεωτική</span>' : ''}</span>
        <span class="cat-l">όριο: ${esc(c.limitLabel)}</span>
        <span class="cat-s ${c.status.toLowerCase()}">${STATUS_LABEL[c.status]}</span>
        <span class="cat-sum">${EUR.format(c.spent)} €</span>
      </div>
      ${items.length ? `<table class="items"><thead><tr><th>Περιγραφή</th><th>Προμηθευτής</th><th>Προσφορά</th><th class="num">Ποσό</th></tr></thead><tbody>${rows}</tbody></table>` : '<div class="empty">— καμία δαπάνη —</div>'}
    </div>`
  }

  const uncategorized = byCat.get(null) ?? []
  const uncatBlock = uncategorized.length ? `<div class="cat"><div class="cat-h"><span class="cat-n">Χωρίς κατηγορία</span><span class="cat-sum">${EUR.format(uncategorized.reduce((s, e) => s + e.amount, 0))} €</span></div>
    <table class="items"><tbody>${uncategorized.map(e => `<tr><td>${esc(e.description)}</td><td>${esc(e.supplierName ?? '—')}</td><td class="q">${e.hasQuote ? '✓' : '<span class="miss">λείπει</span>'}</td><td class="num">${EUR.format(e.amount)} €</td></tr>`).join('')}</tbody></table></div>` : ''

  return `<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Πρόταση υποβολής — ${esc(p.trdrName)}</title>
<style>
  :root{--navy:#001B72;--ink:#0b1220;--muted:#64748b;--rule:#e2e8f0;--over:#b3261e;--ok:#117235}
  *{box-sizing:border-box} body{margin:0;font:13px/1.5 Roboto,system-ui,Arial,sans-serif;color:var(--ink);background:#f6f7fa}
  .bar{position:sticky;top:0;display:flex;gap:10px;justify-content:center;padding:12px;background:#fff;border-bottom:1px solid var(--rule)}
  .bar button{cursor:pointer;border:0;border-radius:999px;padding:10px 22px;font:700 14px Roboto,sans-serif;background:var(--navy);color:#fff}
  .bar .ghost{background:#fff;color:var(--navy);border:1px solid var(--navy)}
  .sheet{max-width:820px;margin:18px auto;background:#fff;padding:32px 36px;box-shadow:0 4px 24px rgba(0,0,34,.1)}
  h1{font-size:20px;margin:0 0 4px;color:var(--navy)} .sub{color:var(--muted);font-size:12px;margin:0 0 18px}
  .totals{display:flex;gap:18px;flex-wrap:wrap;margin:0 0 18px;padding:12px 14px;background:#f1f5f9;border-radius:10px}
  .totals b{font-size:16px;color:var(--navy)} .totals span{font-size:11px;color:var(--muted);text-transform:uppercase;display:block}
  .warn{color:var(--over);font-weight:700}
  .cat{border:1px solid var(--rule);border-radius:10px;margin:0 0 12px;overflow:hidden}
  .cat-h{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:9px 12px;background:#f8fafc;border-bottom:1px solid var(--rule)}
  .cat-n{font-weight:700} .req{font-size:10px;color:var(--over)} .cat-l{font-size:11px;color:var(--muted)}
  .cat-s{font-size:10px;font-weight:700;padding:2px 8px;border-radius:999px;margin-left:auto} .cat-s.ok{color:var(--ok);background:#e1f3e7} .cat-s.over{color:#fff;background:var(--over)} .cat-s.under{color:#8f4b00;background:#fbeedc}
  .cat-sum{font-weight:700;font-variant-numeric:tabular-nums;min-width:90px;text-align:right}
  table.items{width:100%;border-collapse:collapse} .items th,.items td{padding:6px 12px;text-align:left;border-top:1px solid var(--rule);font-size:12px} .items th{font-size:10px;text-transform:uppercase;color:var(--muted)}
  .num{text-align:right;font-variant-numeric:tabular-nums} .afm{color:var(--muted);font-size:11px} .q .miss{color:var(--over);font-weight:700} .empty{padding:8px 12px;color:var(--muted);font-size:12px}
  .grand{display:flex;justify-content:space-between;margin-top:16px;padding-top:12px;border-top:2px solid var(--navy);font-size:16px;font-weight:700}
  .foot{margin-top:20px;font-size:11px;color:var(--muted)}
  @media print{.bar{display:none} body{background:#fff} .sheet{box-shadow:none;margin:0;max-width:none} @page{margin:12mm}}
</style></head>
<body>
  <div class="bar"><button onclick="window.print()">Αποθήκευση ως PDF / Εκτύπωση</button><button class="ghost" onclick="window.close()">Κλείσιμο</button></div>
  <div class="sheet">
    <h1>Πρόταση Υποβολής — Προϋπολογισμός</h1>
    <p class="sub">${esc(p.trdrName)} · ${esc(p.programTitle)} · ${new Date().toLocaleDateString('el-GR')}</p>
    <div class="totals">
      <div><span>Προϋπολογισμός προγράμματος</span><b>${p.totalBudget != null ? EUR.format(p.totalBudget) + ' €' : '—'}</b></div>
      <div><span>Σύνολο πρότασης</span><b>${EUR.format(p.totalSpent)} €</b></div>
      ${p.missingQuotes > 0 ? `<div><span>Εκκρεμότητες</span><b class="warn">${p.missingQuotes} δαπάνες χωρίς προσφορά</b></div>` : ''}
    </div>
    ${p.categories.map(catBlock).join('')}
    ${uncatBlock}
    <div class="grand"><span>ΣΥΝΟΛΟ</span><span>${EUR.format(p.totalSpent)} €</span></div>
    <div class="foot">World Wide Associates — Πρόταση προς έλεγχο από τον πελάτη. Οι δαπάνες χωρίς ενυπόγραφη προσφορά παραμένουν σε εκκρεμότητα.</div>
  </div>
</body></html>`
}

export function openProposal(p: BudgetProposal): boolean {
  const w = window.open('', '_blank')
  if (!w) return false
  w.document.open(); w.document.write(buildProposalHtml(p)); w.document.close()
  return true
}
