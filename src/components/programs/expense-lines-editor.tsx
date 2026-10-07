'use client'

import * as React from 'react'
import { LuPlus, LuX } from 'react-icons/lu'
import type { ExpenseLineInput } from '@/lib/programs/actions'

/**
 * Γραμμές δαπάνης όπως στην προσφορά: Προϊόν | Περιγραφή | Ποσότητα | Τιμή μονάδας | Μερικό σύνολο.
 * Το μερικό σύνολο υπολογίζεται αυτόματα (ποσότητα × τιμή) — ή γράφεται χειροκίνητα όταν
 * λείπουν ποσότητα/τιμή. Το σύνολο της δαπάνης = άθροισμα μερικών συνόλων (χωρίς ΦΠΑ).
 */

export type EditorLine = { key: string; product: string; description: string; quantity: string; unitPrice: string; lineTotal: string }

const EUR = new Intl.NumberFormat('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function parseNum(v: string): number | null {
  const s = v.trim().replace(/\s/g, '')
  if (!s) return null
  const norm = s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s
  const n = Number(norm)
  return Number.isFinite(n) ? n : null
}
const fmt = (n: number | null | undefined) => (n == null ? '' : String(n).replace('.', ','))

export function newLine(p: Partial<EditorLine> = {}): EditorLine {
  return { key: Math.random().toString(36).slice(2), product: '', description: '', quantity: '', unitPrice: '', lineTotal: '', ...p }
}

export function linesFromInputs(lines: { product: string; description?: string | null; quantity?: number | null; unitPrice?: number | null; lineTotal: number }[]): EditorLine[] {
  return lines.map(l => newLine({ product: l.product, description: l.description ?? '', quantity: fmt(l.quantity), unitPrice: fmt(l.unitPrice), lineTotal: fmt(l.lineTotal) }))
}

/** Μερικό σύνολο: ποσότητα × τιμή αν υπάρχουν και τα δύο, αλλιώς ό,τι γράφτηκε. */
export function lineTotalOf(l: EditorLine): number {
  const q = parseNum(l.quantity)
  const p = parseNum(l.unitPrice)
  if (q != null && p != null) return Math.round(q * p * 100) / 100
  return parseNum(l.lineTotal) ?? 0
}

export function toLineInputs(lines: EditorLine[]): ExpenseLineInput[] {
  return lines
    .filter(l => l.product.trim() && lineTotalOf(l) > 0)
    .map(l => ({ product: l.product.trim(), description: l.description.trim() || null, quantity: parseNum(l.quantity), unitPrice: parseNum(l.unitPrice), lineTotal: lineTotalOf(l) }))
}

export function ExpenseLinesEditor({ lines, onChange, disabled }: { lines: EditorLine[]; onChange: (l: EditorLine[]) => void; disabled?: boolean }) {
  const patch = (key: string, p: Partial<EditorLine>) => onChange(lines.map(l => (l.key === key ? { ...l, ...p } : l)))
  const total = lines.reduce((a, l) => a + lineTotalOf(l), 0)
  const cell = 'w-full rounded-md border border-border bg-card px-2 py-1 outline-none focus:border-ring'
  return (
    <div className="flex flex-col gap-1.5">
      <div className="overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-[length:var(--fs-12)]">
          <thead className="bg-muted/50 text-left text-[length:var(--fs-10-5)] font-bold tracking-wide text-muted-foreground uppercase">
            <tr>
              <th className="px-2 py-1.5">Προϊόν</th>
              <th className="px-2 py-1.5">Περιγραφή</th>
              <th className="w-20 px-2 py-1.5 text-right">Ποσότητα</th>
              <th className="w-28 px-2 py-1.5 text-right">Τιμή μον.</th>
              <th className="w-28 px-2 py-1.5 text-right">Μερικό σύνολο</th>
              <th className="w-8" />
            </tr>
          </thead>
          <tbody>
            {lines.map(l => {
              const auto = parseNum(l.quantity) != null && parseNum(l.unitPrice) != null
              return (
                <tr key={l.key} className="border-t border-border align-middle">
                  <td className="px-1.5 py-1"><input className={`${cell} min-w-[9rem] font-semibold`} value={l.product} onChange={e => patch(l.key, { product: e.target.value })} placeholder="π.χ. Laptop Dell 15″" disabled={disabled} aria-label="Προϊόν" /></td>
                  <td className="px-1.5 py-1"><input className={`${cell} min-w-[9rem]`} value={l.description} onChange={e => patch(l.key, { description: e.target.value })} placeholder="προαιρετικά" disabled={disabled} aria-label="Περιγραφή" /></td>
                  <td className="px-1.5 py-1"><input className={`${cell} text-right tabular-nums`} inputMode="decimal" value={l.quantity} onChange={e => patch(l.key, { quantity: e.target.value })} placeholder="1" disabled={disabled} aria-label="Ποσότητα" /></td>
                  <td className="px-1.5 py-1"><input className={`${cell} text-right tabular-nums`} inputMode="decimal" value={l.unitPrice} onChange={e => patch(l.key, { unitPrice: e.target.value })} placeholder="0,00" disabled={disabled} aria-label="Τιμή μονάδας" /></td>
                  <td className="px-1.5 py-1">
                    {auto
                      ? <div className="px-2 py-1 text-right font-bold tabular-nums">{EUR.format(lineTotalOf(l))}</div>
                      : <input className={`${cell} text-right font-bold tabular-nums`} inputMode="decimal" value={l.lineTotal} onChange={e => patch(l.key, { lineTotal: e.target.value })} placeholder="0,00" disabled={disabled} aria-label="Μερικό σύνολο" />}
                  </td>
                  <td className="px-1 py-1 text-center">
                    <button type="button" onClick={() => onChange(lines.filter(x => x.key !== l.key))} disabled={disabled || lines.length === 1} className="inline-flex size-7 items-center justify-center rounded-full text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30" aria-label="Αφαίρεση γραμμής">
                      <LuX className="size-3.5" />
                    </button>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <div className="flex items-center justify-between gap-2">
        <button type="button" onClick={() => onChange([...lines, newLine()])} disabled={disabled} className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[length:var(--fs-11-5)] font-semibold hover:bg-muted">
          <LuPlus className="size-3.5" /> Γραμμή
        </button>
        <span className="text-[length:var(--fs-12)]">Σύνολο δαπάνης: <b className="tabular-nums">{EUR.format(total)} €</b> <span className="text-muted-foreground">(χωρίς ΦΠΑ)</span></span>
      </div>
    </div>
  )
}
