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
  // Μαθαίνουμε την ονομασία της ΔΟΥ (για εμφάνιση όταν ο S1 mirror δεν την έχει).
  if (doyCode && doyDescr) {
    await prisma.doyRegistry.upsert({ where: { code: doyCode }, create: { code: doyCode, name: doyDescr }, update: { name: doyDescr } }).catch(() => {})
  }
  const matched =
    (doyCode ? await prisma.irsdata.findFirst({ where: { CODE: doyCode } }) : null) ??
    (doyDescr ? await prisma.irsdata.findFirst({ where: { NAME: { contains: doyDescr, mode: 'insensitive' } } }) : null)
  return matched?.CODE ?? doyCode
}

/** Ονομασία ΔΟΥ για εμφάνιση: S1 mirror (Irsdata) → μητρώο ΑΑΔΕ (DoyRegistry) → null. */
export async function doyDisplayName(code: string | null | undefined): Promise<string | null> {
  if (!code) return null
  const s1 = await prisma.irsdata.findFirst({ where: { CODE: code }, select: { NAME: true } })
  if (s1) return s1.NAME
  const reg = await prisma.doyRegistry.findUnique({ where: { code }, select: { name: true } })
  return reg?.name ?? null
}
