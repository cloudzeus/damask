import { prisma } from '@/lib/prisma'

/**
 * ΔΟΥ (ΑΑΔΕ b.doy / b.doy_descr) → Trdr.IRSDATA (soft ref στο Irsdata.CODE).
 * Match πρώτα κατά CODE με τον κωδικό ΑΑΔΕ, αλλιώς κατά NAME (case-insensitive
 * substring — ίδιο idiom με createCustomerFromOcr). Χωρίς match στο mirror
 * επιστρέφεται ο raw κωδικός (η καρτέλα τον εμφανίζει as-is)· `null` όταν η
 * ΑΑΔΕ δεν έδωσε ΔΟΥ. Κοινό μεταξύ applyAadeToTrdr και lookupPartnerAfm.
 */
export async function resolveIrsdataCode(doyCode: string | null, doyDescr: string | null): Promise<string | null> {
  if (!doyCode && !doyDescr) return null
  const matched =
    (doyCode ? await prisma.irsdata.findFirst({ where: { CODE: doyCode } }) : null) ??
    (doyDescr ? await prisma.irsdata.findFirst({ where: { NAME: { contains: doyDescr, mode: 'insensitive' } } }) : null)
  return matched?.CODE ?? doyCode
}
