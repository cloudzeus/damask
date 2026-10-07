import { prisma } from '@/lib/prisma'

/**
 * Χώρα συναλλασσόμενου από τη γεωκωδικοποίηση: αν οι συντεταγμένες πέφτουν μέσα
 * στην Ελλάδα (bounding box ηπειρωτικής + νησιών) → Country με SHORTCUT 'GR'.
 */
const GR_BOX = { minLat: 34.7, maxLat: 41.8, minLng: 19.3, maxLng: 29.7 }

export function isInGreece(lat: number | null | undefined, lng: number | null | undefined): boolean {
  if (lat == null || lng == null) return false
  return lat >= GR_BOX.minLat && lat <= GR_BOX.maxLat && lng >= GR_BOX.minLng && lng <= GR_BOX.maxLng
}

let greeceId: number | null | undefined
export async function greeceCountryId(): Promise<number | null> {
  if (greeceId !== undefined) return greeceId
  const row = await prisma.country.findFirst({ where: { SHORTCUT: 'GR' }, select: { COUNTRY: true } })
  greeceId = row?.COUNTRY ?? null
  return greeceId
}

/** Patch για prisma.trdr.update: βάζει Ελλάδα ΜΟΝΟ αν δεν έχει ήδη χώρα. */
export async function countryPatchFromCoords(
  current: number | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): Promise<{ COUNTRY?: number }> {
  if (current != null || !isInGreece(lat, lng)) return {}
  const id = await greeceCountryId()
  return id != null ? { COUNTRY: id } : {}
}
