import { getSetting } from '@/lib/settings'

/**
 * Μετρημένο κόστος API υπηρεσιών (ΟΧΙ AI — βλ. src/lib/ai/pricing.ts για
 * DeepSeek/Gemini/Claude). Ίδιο idiom με το AI pricing table: ένα ενσωματωμένο
 * DEFAULT_API_COSTS + ένα setting ("api.costConfig") που ο SUPER_ADMIN
 * επεξεργάζεται από το /costs («Ρυθμίσεις API κόστους» — δες
 * api-cost-config-card.tsx) χωρίς deploy.
 *
 * costModel περιγράφει ΤΙ μετράει το `units` πεδίο του ApiUsage:
 *  - per_email:        1 email = 1 μονάδα
 *  - per_gb:            bytes/1e9 (δεκαδικός)
 *  - per_transaction:   1 συναλλαγή = 1 μονάδα
 *  - per_lookup:        1 αναζήτηση = 1 μονάδα
 *  - per_request:       1 κλήση = 1 μονάδα (γενικό fallback, π.χ. geocoding)
 */
export type ApiCostModel = 'per_email' | 'per_gb' | 'per_transaction' | 'per_lookup' | 'per_request'

export type ApiCostDefault = {
  displayName: string
  costModel: ApiCostModel
  /** Ετικέτα μονάδας για εμφάνιση στο UI (π.χ. "emails", "GB", "συναλλαγές"). */
  unitLabel: string
  /** EUR ανά μονάδα. */
  basePrice: number
  /** Δωρεάν μονάδες ανά ημερολογιακό μήνα, πριν αρχίσει η χρέωση. */
  freeQuota: number
  /** Ημέρα του μήνα που μηδενίζεται το free quota (v1: πάντα 1 — ημερολογιακός μήνας). */
  quotaResetDay: number
  markupPercent: number
  documentationUrl?: string
}

/**
 * Οι γνωστές API υπηρεσίες v1. Τα AI providers (deepseek/gemini/claude) ΔΕΝ
 * ζουν εδώ — παραμένουν στο src/lib/ai/pricing.ts (DEFAULT_AI_MARKUP κ.λπ.).
 * viva/aade/geocoding έχουν basePrice 0 προεπιλογή — καταγράφονται
 * ενημερωτικά (units) μέχρι να οριστεί πραγματική τιμολόγηση από τον
 * SUPER_ADMIN (override) ή να αλλάξει ο default εδώ.
 */
export const DEFAULT_API_COSTS: Record<string, ApiCostDefault> = {
  mailgun: {
    displayName: 'Mailgun',
    costModel: 'per_email',
    unitLabel: 'emails',
    basePrice: 0.0005, // €0.0005/email — free tier 5000/μήνα
    freeQuota: 5000,
    quotaResetDay: 1,
    markupPercent: 0,
    documentationUrl: 'https://www.mailgun.com/pricing/',
  },
  bunnycdn: {
    displayName: 'BunnyCDN',
    costModel: 'per_gb',
    unitLabel: 'GB',
    basePrice: 0.01, // €0.01/GB — πρώτα 10GB δωρεάν (v1: μόνο GB uploaded μέσω δικών μας routes)
    freeQuota: 10,
    quotaResetDay: 1,
    markupPercent: 0,
    documentationUrl: 'https://bunny.net/pricing/',
  },
  viva: {
    displayName: 'Viva Payments',
    costModel: 'per_transaction',
    unitLabel: 'συναλλαγές',
    basePrice: 0, // v1: μόνο μέτρηση πλήθους — ενημερωτικό, χωρίς έξοδο προμήθειας
    freeQuota: 0,
    quotaResetDay: 1,
    markupPercent: 0,
    documentationUrl: 'https://www.viva.com/en/support/pricing',
  },
  aade: {
    displayName: 'ΑΑΔΕ (vat.wwa.gr)',
    costModel: 'per_lookup',
    unitLabel: 'αναζητήσεις',
    basePrice: 0, // v1: δωρεάν υπηρεσία (χωρίς credentials/χρέωση)
    freeQuota: 0,
    quotaResetDay: 1,
    markupPercent: 0,
    documentationUrl: 'https://vat.wwa.gr',
  },
  geocoding: {
    displayName: 'Geocoding',
    costModel: 'per_request',
    unitLabel: 'κλήσεις',
    basePrice: 0, // v1: πάροχος δεν έχει επιλεγεί ακόμα (θα οριστικοποιηθεί με το traders task)
    freeQuota: 0,
    quotaResetDay: 1,
    markupPercent: 0,
    documentationUrl: 'https://developers.google.com/maps/documentation/geocoding/usage-and-billing',
  },
}

/**
 * Εφαρμόζει markup % πάνω σε ένα πραγματικό (real) κόστος. Ίδια συνάρτηση με
 * applyMarkup (src/lib/ai/markup.ts) — ξεχωριστό όνομα εδώ ώστε να ταιριάζει
 * με το proven reference (lib/api-costs.ts#getBilledCost) που ακολουθεί αυτό
 * το module.
 */
export function getBilledCost(realCost: number, markupPercent: number): number {
  const pct = Number.isFinite(markupPercent) ? markupPercent : 0
  return realCost * (1 + pct / 100)
}

/** Πεδία που μπορεί να αλλάξει ο SUPER_ADMIN ανά υπηρεσία (setting "api.costConfig"). */
export type ApiCostOverride = Partial<Pick<ApiCostDefault, 'basePrice' | 'freeQuota' | 'markupPercent'>>

/** Shape του setting "api.costConfig" — { [service]: ApiCostOverride }. */
export type ApiCostConfigSettings = Record<string, ApiCostOverride>

export interface ResolvedApiCostConfig {
  service: string
  displayName: string
  costModel: ApiCostModel
  unitLabel: string
  basePrice: number
  freeQuota: number
  quotaResetDay: number
  markupPercent: number
  documentationUrl?: string
}

/**
 * Καθαρή (χωρίς DB) συνάρτηση merge — override πάνω στα defaults. displayName/
 * costModel/unitLabel/quotaResetDay/documentationUrl έρχονται ΠΑΝΤΑ από τα
 * defaults (immutable identity, ίδιο idiom με mergeConfig στο reference)· μόνο
 * basePrice/freeQuota/markupPercent προτιμούν το override όταν υπάρχει. Ένα
 * ΑΓΝΩΣΤΟ service (όχι στο DEFAULT_API_COSTS) πέφτει σε ασφαλή γενικά
 * defaults (per_request, 0 κόστος) αντί να επιστρέψει null — έτσι το logging/
 * η σελίδα δεν σπάνε ποτέ σε ένα νέο/άγνωστο service string.
 */
export function mergeApiCostConfig(service: string, override: ApiCostOverride | null | undefined): ResolvedApiCostConfig {
  const base = DEFAULT_API_COSTS[service]
  return {
    service,
    displayName: base?.displayName ?? service,
    costModel: base?.costModel ?? 'per_request',
    unitLabel: base?.unitLabel ?? 'μονάδες',
    basePrice: override?.basePrice ?? base?.basePrice ?? 0,
    freeQuota: override?.freeQuota ?? base?.freeQuota ?? 0,
    quotaResetDay: base?.quotaResetDay ?? 1,
    markupPercent: override?.markupPercent ?? base?.markupPercent ?? 0,
    documentationUrl: base?.documentationUrl,
  }
}

/** Resolve του live cost config για ΜΙΑ υπηρεσία: DB override merged πάνω στα defaults. */
export async function loadApiCostConfig(service: string): Promise<ResolvedApiCostConfig> {
  const overrides = (await getSetting<ApiCostConfigSettings>('api.costConfig')) ?? {}
  return mergeApiCostConfig(service, overrides[service])
}

/**
 * Resolve όλων των γνωστών υπηρεσιών (defaults + οποιοδήποτε extra service
 * έχει override στη DB, π.χ. ένα μελλοντικό service που δεν είναι ακόμα στο
 * DEFAULT_API_COSTS) — χρησιμοποιείται από τη σελίδα /costs (aggregate ανά
 * μήνα) και από την κάρτα ρυθμίσεων SUPER_ADMIN.
 */
export async function loadAllApiCostConfigs(): Promise<Record<string, ResolvedApiCostConfig>> {
  const overrides = (await getSetting<ApiCostConfigSettings>('api.costConfig')) ?? {}
  const services = new Set([...Object.keys(DEFAULT_API_COSTS), ...Object.keys(overrides)])
  const out: Record<string, ResolvedApiCostConfig> = {}
  for (const service of services) out[service] = mergeApiCostConfig(service, overrides[service])
  return out
}

export type MonthlyCostResult = {
  /** Σύνολο μονάδων χρήσης τον μήνα (ό,τι δόθηκε στην είσοδο, καθαρισμένο). */
  units: number
  freeQuota: number
  /** Μονάδες πέραν του free quota — αυτές χρεώνονται. */
  billableUnits: number
  /** Πραγματικό κόστος σε EUR (billableUnits × basePrice), ΧΩΡΙΣ markup. */
  realCost: number
  markupPercent: number
  /** Τελικό χρεούμενο κόστος σε EUR, ΜΕ markup. */
  billedCost: number
}

/**
 * Υπολογίζει το μηνιαίο κόστος μιας υπηρεσίας: αφαιρεί το free quota ΜΙΑ
 * φορά από το ΣΥΝΟΛΟ των μονάδων του μήνα (όχι ανά γραμμή χρήσης — βλ. σχόλιο
 * στο ApiUsage.costEur, prisma/schema.prisma) και μετά εφαρμόζει markup.
 * `units` αναμένεται να είναι ήδη το άθροισμα όλων των ApiUsage γραμμών της
 * υπηρεσίας για τον τρέχοντα ημερολογιακό μήνα.
 */
export function computeMonthlyCost(
  units: number,
  config: Pick<ResolvedApiCostConfig, 'basePrice' | 'freeQuota' | 'markupPercent'>,
): MonthlyCostResult {
  const safeUnits = Number.isFinite(units) && units > 0 ? units : 0
  const freeQuota = Number.isFinite(config.freeQuota) && config.freeQuota > 0 ? config.freeQuota : 0
  const billableUnits = Math.max(0, safeUnits - freeQuota)
  const basePrice = Number.isFinite(config.basePrice) ? config.basePrice : 0
  const realCost = billableUnits * basePrice
  const markupPercent = Number.isFinite(config.markupPercent) ? config.markupPercent : 0
  const billedCost = getBilledCost(realCost, markupPercent)
  return { units: safeUnits, freeQuota, billableUnits, realCost, markupPercent, billedCost }
}
