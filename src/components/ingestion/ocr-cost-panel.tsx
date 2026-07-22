'use client'

import type { OcrCostView } from '@/lib/ingestion/ocr-cost'

/** Steel & Frost badge/chip: πάντα δείχνει το model· ποσά μόνο όταν το view το επιτρέπει (role-gated από τον server). */
export function OcrCostPanel({ cost }: { cost: OcrCostView | null }) {
  if (!cost) return null

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1.5">
      <span className="badge-pill info">{cost.model}</span>
      {cost.showAmount && cost.finalEur != null && (
        <span className="badge-pill ok">
          Κόστος: {cost.finalEur.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} €
        </span>
      )}
      {cost.showBreakdown && cost.baseUsd != null && (
        <span className="badge-pill muted">
          Βάση: {cost.baseUsd.toLocaleString('el-GR', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} $
        </span>
      )}
      {cost.showBreakdown && cost.markupPct != null && (
        <span className="badge-pill muted">Markup: {cost.markupPct}%</span>
      )}
    </div>
  )
}
