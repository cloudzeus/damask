import { prisma } from '@/lib/prisma'
import type { GemiCompanyRaw } from '@/lib/trdr/gemi-map'

/**
 * (Plain module — workers/hooks.) Παράγωγα στοιχεία πελάτη μετά από ΚΑΘΕ αλλαγή (νέος από ΑΦΜ, ΑΑΔΕ, ΓΕΜΗ, διεύθυνση):
 *  1. Περιφέρεια (regionCode) όταν λείπει — ΓΕΜΗ Δήμος/Νομός → όνομα πόλης → γεωκωδικοποίηση (matchRegion).
 *  2. Δυνητικά προγράμματα (TrdrProgramMatch) — ώστε η καρτέλα να δείχνει αμέσως σε ποια προγράμματα ταιριάζει.
 * Χωρίς περιφέρεια ένας πελάτης «κόβεται» σε κάθε περιφερειακό πρόγραμμα· γι' αυτό τρέχει πάντα πριν την αντιστοίχιση.
 */

/** Συντεταγμένες (χάρτης) από τη διεύθυνση όταν λείπουν — μόνο αν έχει ρυθμιστεί το κλειδί γεωκωδικοποίησης. */
export async function ensureTrdrGeocode(trdrId: string): Promise<{ lat: number; lng: number } | null> {
  const t = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { appLat: true, appLng: true, ADDRESS: true, CITY: true, ZIP: true } })
  if (!t) return null
  if (t.appLat != null && t.appLng != null) return { lat: t.appLat, lng: t.appLng }
  if (!t.ADDRESS && !t.CITY && !t.ZIP) return null
  try {
    const { getIntegration } = await import('@/lib/settings')
    const maps = await getIntegration<{ geocodeApiKey?: string }>('maps')
    if (!maps.geocodeApiKey) return null
    const { geocodeSearchParts } = await import('@/lib/geocode')
    const hit = await geocodeSearchParts({ address: t.ADDRESS, city: t.CITY, zip: t.ZIP }, maps.geocodeApiKey)
    if (!hit) return null
    await prisma.trdr.update({ where: { id: trdrId }, data: { appLat: hit.lat, appLng: hit.lng, geocodedAt: new Date() } })
    return { lat: hit.lat, lng: hit.lng }
  } catch (err) { console.error('[trdr-derive] γεωκωδικοποίηση απέτυχε', trdrId, err); return null }
}

export async function ensureTrdrRegion(trdrId: string): Promise<string | null> {
  const t = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { regionCode: true, ADDRESS: true, CITY: true, DISTRICT: true, ZIP: true, appLat: true, appLng: true, gemiData: true } })
  if (!t) return null
  if (t.regionCode) return t.regionCode
  const g = t.gemiData as GemiCompanyRaw | null
  const { matchRegion } = await import('@/lib/registries/regions')
  const m = await matchRegion({
    address: t.ADDRESS, city: t.CITY, district: t.DISTRICT, zip: t.ZIP,
    municipalityDescr: g?.municipality?.descr ?? null, prefectureDescr: g?.prefecture?.descr ?? null,
    latitude: t.appLat, longitude: t.appLng,
  }).catch(() => null)
  if (!m) return null
  await prisma.trdr.update({ where: { id: trdrId }, data: { regionCode: m.regionCode } })
  return m.regionCode
}

/**
 * ΑΑΔΕ (επωνυμία, διεύθυνση, ΔΟΥ, ΚΑΔ, νομική μορφή) και ΓΕΜΗ (στοιχεία, Δήμος/Νομός, ΚΑΔ) μία φορά — όταν δεν έχουν
 * γίνει ποτέ και υπάρχει ΑΦΜ. Αποτυχίες (π.χ. ΑΦΜ χωρίς ΓΕΜΗ, όριο κλήσεων) δεν σταματούν τα υπόλοιπα βήματα.
 */
export async function ensureTrdrRegistries(trdrId: string): Promise<{ aade: boolean; gemi: boolean }> {
  const out = { aade: false, gemi: false }
  const t = await prisma.trdr.findUnique({ where: { id: trdrId }, select: { AFM: true, aadeSyncedAt: true, gemiSyncedAt: true } })
  if (!t?.AFM || !/^\d{9}$/.test(t.AFM.replace(/\D/g, ''))) return out
  const { applyAadeCore, gemiSyncCore } = await import('@/lib/trdr/enrich-core')
  if (!t.aadeSyncedAt) {
    try { await applyAadeCore(trdrId, null); out.aade = true } catch (err) { console.warn('[trdr-derive] ΑΑΔΕ:', trdrId, err instanceof Error ? err.message : err) }
  }
  if (!t.gemiSyncedAt) {
    try { await gemiSyncCore(trdrId, { syncDocuments: false, userId: null }); out.gemi = true } catch (err) { console.warn('[trdr-derive] ΓΕΜΗ:', trdrId, err instanceof Error ? err.message : err) }
  }
  return out
}

export async function deriveTrdr(trdrId: string): Promise<void> {
  try {
    await ensureTrdrRegistries(trdrId)
    await ensureTrdrGeocode(trdrId)
    await ensureTrdrRegion(trdrId)
    const { runPotentialMatching } = await import('@/lib/pm/potential-matching')
    await runPotentialMatching({ trdrIds: [trdrId] })
  } catch (err) { console.error('[trdr-derive] απέτυχε', trdrId, err) }
}

export const QUEUE_TRDR_DERIVE = 'trdr-derive'

/** Στο παρασκήνιο, λίγα δευτερόλεπτα μετά την αλλαγή (μία φορά ανά πελάτη ανά «φουρνιά» αλλαγών). Ποτέ δεν ρίχνει. */
export async function enqueueTrdrDerive(trdrId: string | null | undefined): Promise<void> {
  if (!trdrId) return
  try {
    const { startBoss } = await import('@/lib/queue')
    const boss = await startBoss()
    await boss.send(QUEUE_TRDR_DERIVE, { trdrId }, { singletonKey: trdrId, singletonSeconds: 20, startAfter: 5, retryLimit: 1 })
  } catch (err) { console.error('[trdr-derive] προγραμματισμός απέτυχε', err) }
}
