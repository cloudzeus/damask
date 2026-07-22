import { getSetting, setSetting, getIntegration, isIntegrationConfigured } from '@/lib/settings'
import { SYNC_TARGETS, defaultSyncConfig, type ObjectSyncConfig } from '@/lib/sync-targets'

const KEY = 'objects.sync'

type Stored = Record<string, Partial<ObjectSyncConfig>>

/** All targets, defaults merged under any stored overrides. */
export async function getSyncConfigs(): Promise<Record<string, ObjectSyncConfig>> {
  const stored = (await getSetting<Stored>(KEY)) ?? {}
  const out: Record<string, ObjectSyncConfig> = {}
  for (const t of SYNC_TARGETS) out[t.key] = { ...defaultSyncConfig(), ...stored[t.key] }
  return out
}

function assertKnown(key: string): void {
  if (!SYNC_TARGETS.some(t => t.key === key)) throw new Error(`Άγνωστος sync target: ${key}`)
}

/** Merge a partial patch into one target's config (read-before-write, other targets untouched). */
export async function setSyncConfig(key: string, patch: Partial<ObjectSyncConfig>): Promise<void> {
  assertKnown(key)
  const stored = (await getSetting<Stored>(KEY)) ?? {}
  const next: Stored = { ...stored, [key]: { ...defaultSyncConfig(), ...stored[key], ...patch } }
  await setSetting(KEY, next)
}

export async function updateLastRun(key: string, iso: string): Promise<void> {
  await setSyncConfig(key, { lastRunAt: iso })
}

/** Active connection = SoftOne credentials present AND last «Δοκιμή σύνδεσης» ok. */
export async function isSoftOneConnected(): Promise<boolean> {
  const s = await getIntegration<Record<string, unknown>>('softone')
  if (!isIntegrationConfigured('softone', s)) return false
  const check = s._lastCheck as { ok?: boolean } | undefined
  return check?.ok === true
}
