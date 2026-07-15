import { getIntegration } from '@/lib/settings'

/**
 * Helpers πάνω στο ΥΠΑΡΧΟΝ BunnyCDN storage zone (integration.bunny — δες
 * src/app/(app)/settings/cards/bunny-card.tsx) για ΙΔΙΩΤΙΚΑ αντικείμενα (DB
 * backups) — ΟΧΙ το δημόσιο pull zone flow του /api/media/upload (εκείνο
 * χτίζει pullZoneUrl/… CDN URLs για δημόσια assets, αυτό εδώ ΔΕΝ επιστρέφει
 * ποτέ CDN URL, μόνο storage key).
 *
 * Bunny δεν έχει S3-compatible client εδώ (η ρίζα DAMASK δεν έχει
 * @aws-sdk/client-s3 dependency) — χρησιμοποιεί την RAW Storage HTTP API
 * (PUT/GET/DELETE με header AccessKey), ΙΔΙΟ idiom με το ήδη υπάρχον
 * /api/media/upload/route.ts και src/lib/connection-tests.ts#testBunny.
 *
 * ⚠️ ΙΔΙΩΤΙΚΟΤΗΤΑ: αυτό το module ΔΕΝ κάνει τα αντικείμενα δημόσια (καμία
 * ACL/Content-Disposition για public serving, κανένα pull-zone URL). ΑΛΛΑ αν
 * το Bunny Pull Zone (BUNNY_PULL_ZONE_URL) δείχνει σε ΟΛΗ τη storage zone
 * χωρίς Token Authentication ενεργοποιημένο στο Bunny dashboard, οποιοσδήποτε
 * ξέρει (ή μαντέψει) το πλήρες storageKey μπορεί ΑΚΟΜΑ να το κατεβάσει μέσω
 * του pull zone URL — αυτό ΔΕΝ ελέγχεται από τον κώδικα της εφαρμογής, μόνο
 * από ρυθμίσεις στο Bunny.net dashboard. Το src/lib/backup.ts μετριάζει με
 * απρόβλεπτο (randomBytes) suffix στο filename· βλ. concern στο report.
 */

type BunnyStorageConfig = {
  storageZone: string
  storagePassword: string
  storageApi: string
}

async function resolveConfig(): Promise<BunnyStorageConfig> {
  const bunny = await getIntegration<{ storageZone?: string; storagePassword?: string; storageApi?: string }>('bunny')
  const storageZone = bunny.storageZone?.trim()
  const storagePassword = bunny.storagePassword?.trim()
  const storageApi = (bunny.storageApi?.trim() || 'https://storage.bunnycdn.com').replace(/\/+$/, '')
  if (!storageZone || !storagePassword) {
    throw new Error('Λείπουν ρυθμίσεις BunnyCDN (storage zone / storage password). Συμπλήρωσέ τες στο Ρυθμίσεις → Διασυνδέσεις → BunnyCDN.')
  }
  return { storageZone, storagePassword, storageApi }
}

/** key: path ΜΕΣΑ στη storage zone, χωρίς αρχικό slash (π.χ. "backups/x.dump").
 * Διατηρεί ΤΥΧΟΝ trailing slash — η Bunny Storage API το χρειάζεται ρητά για
 * να ξεχωρίσει "list περιεχομένων φακέλου" (bunnyList) από αίτημα πάνω σε
 * ακριβές αντικείμενο· το filter(Boolean) καθαρίζει μόνο εσωτερικά διπλά "//". */
function objectUrl(cfg: BunnyStorageConfig, key: string): string {
  const hadTrailingSlash = key.endsWith('/')
  const safeKey = key
    .split('/')
    .filter(Boolean)
    .map(segment => encodeURIComponent(segment))
    .join('/')
  return `${cfg.storageApi}/${cfg.storageZone}/${safeKey}${hadTrailingSlash ? '/' : ''}`
}

async function errorDetail(res: Response): Promise<string> {
  const text = await res.text().catch(() => '')
  return text ? `: ${text.slice(0, 300)}` : ''
}

export async function bunnyUploadPrivate({
  key, body, contentType = 'application/octet-stream',
}: {
  key: string
  body: Buffer
  contentType?: string
}): Promise<{ key: string }> {
  const cfg = await resolveConfig()
  const res = await fetch(objectUrl(cfg, key), {
    method: 'PUT',
    headers: { AccessKey: cfg.storagePassword, 'Content-Type': contentType },
    body: new Uint8Array(body),
  })
  if (res.status !== 201) {
    throw new Error(`Το BunnyCDN απέρριψε το upload (HTTP ${res.status})${await errorDetail(res)}`)
  }
  return { key }
}

/** Ακατέργαστο fetch Response πάνω στο αντικείμενο — για TRUE streaming (π.χ. download route),
 * χωρίς να μπει ολόκληρο το αρχείο στη μνήμη Node. Χρησιμοποίησε bunnyDownload() αν χρειάζεσαι
 * Buffer (π.χ. restoreBackup, που έτσι κι αλλιώς πρέπει να γράψει σε tmp file για pg_restore). */
export async function bunnyGetObjectResponse(key: string): Promise<Response> {
  const cfg = await resolveConfig()
  return fetch(objectUrl(cfg, key), { headers: { AccessKey: cfg.storagePassword } })
}

export async function bunnyDownload(key: string): Promise<Buffer> {
  const res = await bunnyGetObjectResponse(key)
  if (res.status === 404) throw new Error(`Το αρχείο δεν βρέθηκε στο BunnyCDN: ${key}`)
  if (!res.ok) throw new Error(`Αποτυχία λήψης από το BunnyCDN (HTTP ${res.status})${await errorDetail(res)}`)
  return Buffer.from(await res.arrayBuffer())
}

export async function bunnyDeleteOne(key: string): Promise<void> {
  const cfg = await resolveConfig()
  const res = await fetch(objectUrl(cfg, key), { method: 'DELETE', headers: { AccessKey: cfg.storagePassword } })
  // 404 = ήδη διαγραμμένο (ή ποτέ δεν ανέβηκε) — αποδεκτό ως no-op, ΟΧΙ σφάλμα.
  if (!res.ok && res.status !== 404) {
    throw new Error(`Αποτυχία διαγραφής από το BunnyCDN (HTTP ${res.status}) για ${key}${await errorDetail(res)}`)
  }
}

/** Η raw Storage API του Bunny δεν έχει batch-delete endpoint — sequential loop
 * (αποδεκτό, το retention prune διαγράφει λίγα αντικείμενα τη φορά). Ένα
 * αποτυχημένο key ΔΕΝ σταματάει τα υπόλοιπα — καταγράφεται και συνεχίζει. */
export async function bunnyDeleteMany(keys: string[]): Promise<void> {
  for (const key of keys) {
    try {
      await bunnyDeleteOne(key)
    } catch (err) {
      console.error('[bunny-storage] delete απέτυχε για', key, err)
    }
  }
}

export type BunnyListEntry = {
  objectName: string
  path: string
  length: number
  isDirectory: boolean
  lastChanged: string
}

/** Λίστα αντικειμένων μέσα σε ένα "φάκελο" (prefix) της storage zone. */
export async function bunnyList(prefix: string): Promise<BunnyListEntry[]> {
  const cfg = await resolveConfig()
  const dirKey = prefix.endsWith('/') ? prefix : `${prefix}/`
  const res = await fetch(objectUrl(cfg, dirKey), { headers: { AccessKey: cfg.storagePassword, Accept: 'application/json' } })
  if (res.status === 404) return []
  if (!res.ok) throw new Error(`Αποτυχία λίστας BunnyCDN (HTTP ${res.status})${await errorDetail(res)}`)
  const data = (await res.json()) as Array<Record<string, unknown>>
  return data.map(item => ({
    objectName: String(item.ObjectName ?? ''),
    path: String(item.Path ?? ''),
    length: Number(item.Length ?? 0),
    isDirectory: Boolean(item.IsDirectory),
    lastChanged: String(item.LastChanged ?? ''),
  }))
}
