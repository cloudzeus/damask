import { computeMonthlyCost, type ResolvedApiCostConfig } from '@/lib/api-costs'

/**
 * Καθαρές (χωρίς DB) functions πάνω στις γραμμές ApiUsage — ο server component
 * (page.tsx) κάνει το prisma.apiUsage.findMany (τρέχων ημερολογιακός μήνας,
 * ΑΝΕΞΑΡΤΗΤΑ από το επιλεγμένο εύρος `range` του AI tab — το free quota
 * μηδενίζεται μηνιαία, όχι ανά ημέρες/εβδομάδες) + loadAllApiCostConfigs, και
 * περνάει τα αποτελέσματα εδώ. Ξεχωριστό module ώστε το quota/markup/grouping
 * να είναι εύκολα unit-testable χωρίς DB (βλ. tests/api-costs-data.test.ts).
 */

export type ApiUsageRow = {
  id: string
  service: string
  operation: string | null
  units: number
  costEur: number | null
  userId: string | null
  refType: string | null
  refId: string | null
  createdAt: Date
}

export type ApiServiceSummary = {
  service: string
  displayName: string
  costModel: string
  unitLabel: string
  calls: number
  units: number
  freeQuota: number
  billableUnits: number
  /** Πραγματικό κόστος EUR (μηνιαίο άθροισμα, ΧΩΡΙΣ markup). */
  realCostEur: number
  markupPercent: number
  /** Τελικό χρεούμενο κόστος EUR (ΜΕ markup) — αυτό δείχνει το UI στον ADMIN. */
  billedCostEur: number
  /** 0..100+ — πόσο τοις εκατό του free quota καταναλώθηκε (100+ = ξεπεράστηκε). Undefined όταν freeQuota===0 (δεν έχει νόημα progress bar). */
  quotaPct: number | null
  documentationUrl?: string
}

/**
 * Ομαδοποίηση ανά service — αθροίζει units/calls, μετά εφαρμόζει το free
 * quota ΜΙΑ φορά στο μηνιαίο άθροισμα (computeMonthlyCost), όχι ανά γραμμή
 * (βλ. σχόλιο στο ApiUsage.costEur, prisma/schema.prisma). Περιλαμβάνει ΚΑΙ
 * services με μηδενική χρήση αυτόν τον μήνα (ώστε η κάρτα να δείχνει πάντα
 * όλες τις γνωστές υπηρεσίες, όχι μόνο αυτές με κίνηση) — ταξινομημένα
 * αλφαβητικά σε αυτή την περίπτωση.
 */
export function summarizeApiUsageByService(
  rows: ApiUsageRow[],
  configs: Record<string, ResolvedApiCostConfig>,
): ApiServiceSummary[] {
  const agg = new Map<string, { units: number; calls: number }>()
  for (const row of rows) {
    const cur = agg.get(row.service) ?? { units: 0, calls: 0 }
    cur.units += row.units
    cur.calls += 1
    agg.set(row.service, cur)
  }

  const services = new Set<string>([...Object.keys(configs), ...agg.keys()])
  const summaries: ApiServiceSummary[] = []
  for (const service of services) {
    const config = configs[service]
    if (!config) continue // ασυνήθιστο — γραμμή με service που δεν έχει καν generic-default config
    const usage = agg.get(service) ?? { units: 0, calls: 0 }
    const monthly = computeMonthlyCost(usage.units, config)
    summaries.push({
      service,
      displayName: config.displayName,
      costModel: config.costModel,
      unitLabel: config.unitLabel,
      calls: usage.calls,
      units: monthly.units,
      freeQuota: monthly.freeQuota,
      billableUnits: monthly.billableUnits,
      realCostEur: monthly.realCost,
      markupPercent: monthly.markupPercent,
      billedCostEur: monthly.billedCost,
      quotaPct: monthly.freeQuota > 0 ? (monthly.units / monthly.freeQuota) * 100 : null,
      documentationUrl: config.documentationUrl,
    })
  }

  return summaries.sort((a, b) => b.billedCostEur - a.billedCostEur || a.displayName.localeCompare(b.displayName))
}

export function totalApiCostEur(summaries: ApiServiceSummary[]): number {
  return summaries.reduce((sum, s) => sum + s.billedCostEur, 0)
}

/** Αρχή του τρέχοντος ημερολογιακού μήνα — quotaResetDay v1 είναι πάντα 1 (βλ. api-costs.ts). */
export function startOfCurrentMonth(now: Date = new Date()): Date {
  return new Date(now.getFullYear(), now.getMonth(), 1)
}
