import { prisma } from '@/lib/prisma'
import { loadApiCostConfig } from '@/lib/api-costs'

/**
 * Καταγεγραμμένες υπηρεσίες v1 — βλ. DEFAULT_API_COSTS (src/lib/api-costs.ts).
 * Οποιοδήποτε άλλο string γίνεται επίσης δεκτό (mergeApiCostConfig πέφτει σε
 * ασφαλή γενικά defaults) ώστε ένα μελλοντικό service (π.χ. νέο geocoding
 * provider) να μην απαιτεί αλλαγή εδώ — το type είναι μόνο τεκμηρίωση/DX.
 */
export type ApiService = 'mailgun' | 'bunnycdn' | 'viva' | 'aade' | 'geocoding' | (string & {})

interface LogApiUsageInput {
  service: ApiService
  operation?: string | null
  /** emails=1, GB=δεκαδικός (bytes/1e9), lookups/συναλλαγές/κλήσεις=1. */
  units: number
  userId?: string | null
  refType?: string | null
  refId?: string | null
}

/**
 * Fire-and-forget logger για χρήση API υπηρεσιών (Mailgun/BunnyCDN/Viva/ΑΑΔΕ/
 * geocoding — ΟΧΙ AI, βλ. src/lib/ai/usage.ts#logAiUsage για εκείνο). ΠΟΤΕ δεν
 * πετάει — τα σφάλματα (π.χ. DB μη διαθέσιμη) καταπίνονται με console.error,
 * ώστε το logging να μην μπορεί ποτέ να σπάσει το user-facing αίτημα
 * (αποστολή email, upload, δημιουργία πληρωμής, αναζήτηση ΑΦΜ). Οι callers
 * (mailer.ts, api/media/upload/route.ts, backup.ts, viva.ts, aade.ts) καλούν
 * αυτή τη function με `void logApiUsage(...)`, ίδιο idiom με το logAiUsage.
 */
export async function logApiUsage(input: LogApiUsageInput): Promise<void> {
  try {
    const config = await loadApiCostConfig(input.service)
    const units = Number.isFinite(input.units) ? input.units : 0
    // Ακατέργαστο κόστος ΤΗΣ ΓΡΑΜΜΗΣ — ΧΩΡΙΣ markup, ΧΩΡΙΣ free quota (βλ.
    // σχόλιο στο prisma model). Το free quota + markup εφαρμόζονται ΜΙΑ φορά
    // στο μηνιαίο άθροισμα (computeMonthlyCost), όχι εδώ.
    const costEur = units * config.basePrice

    await prisma.apiUsage.create({
      data: {
        service: input.service,
        operation: input.operation ?? null,
        units,
        costEur: Number.isFinite(costEur) ? costEur : null,
        userId: input.userId ?? null,
        refType: input.refType ?? null,
        refId: input.refId ?? null,
      },
    })
  } catch (err) {
    console.error('logApiUsage failed', err)
  }
}
