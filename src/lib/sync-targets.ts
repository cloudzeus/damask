export type SyncDirection = 'pull' | 'push' | 'bidirectional'
export type SyncMaster = 'softone' | 'local'
export type SyncFrequency = 'manual' | '15m' | '1h' | '6h' | 'daily'

export type ObjectSyncConfig = {
  syncEnabled: boolean
  direction: SyncDirection
  master: SyncMaster
  frequency: SyncFrequency
  lastRunAt?: string
}

export type SyncTarget = {
  key: string
  label: string
  s1Object?: string
  supportedDirections: SyncDirection[]
  hasEngine: boolean
}

/** Decoupled from the menu OBJECT_REGISTRY: reference/lookup tables are not menu objects. */
export const SYNC_TARGETS: SyncTarget[] = [
  { key: 's1-references', label: 'Βοηθητικοί πίνακες SoftOne', supportedDirections: ['pull'], hasEngine: true },
  { key: 'products', label: 'Προϊόντα', s1Object: 'MTRL', supportedDirections: ['pull', 'push', 'bidirectional'], hasEngine: false },
  { key: 'partners', label: 'Συναλλασσόμενοι', s1Object: 'TRDR', supportedDirections: ['pull', 'push', 'bidirectional'], hasEngine: false },
]

export const FREQUENCY_MINUTES: Record<SyncFrequency, number | null> = {
  manual: null, '15m': 15, '1h': 60, '6h': 360, daily: 1440,
}

export function defaultSyncConfig(): ObjectSyncConfig {
  return { syncEnabled: false, direction: 'pull', master: 'softone', frequency: 'manual' }
}

/** Pure: is this config due to run at nowMs? (enabled, non-manual, and interval elapsed since lastRunAt). */
export function isDue(config: ObjectSyncConfig, nowMs: number): boolean {
  if (!config.syncEnabled) return false
  const mins = FREQUENCY_MINUTES[config.frequency]
  if (mins === null) return false
  if (!config.lastRunAt) return true
  const last = Date.parse(config.lastRunAt)
  if (Number.isNaN(last)) return true
  return nowMs - last >= mins * 60_000
}

export function dueTargetKeys(configs: Record<string, ObjectSyncConfig>, nowMs: number): string[] {
  return Object.entries(configs).filter(([, c]) => isDue(c, nowMs)).map(([k]) => k)
}
