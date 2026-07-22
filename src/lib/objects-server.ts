import { notFound } from 'next/navigation'
import { getSetting, setSetting } from '@/lib/settings'
import { allItems, coreItemKeys, effectiveEnabledKeys } from '@/lib/objects'

const SETTING_KEY = 'objects.enabled'

/** Effective enabled item keys (stored ∪ core), read from the Setting store. */
export async function getEnabledObjectKeys(): Promise<Set<string>> {
  const stored = (await getSetting<string[]>(SETTING_KEY)) ?? []
  return effectiveEnabledKeys(stored)
}

export async function isObjectEnabled(key: string): Promise<boolean> {
  return (await getEnabledObjectKeys()).has(key)
}

/** Page guard — 404 when the object is not in the effective enabled set. */
export async function assertObjectEnabled(key: string): Promise<void> {
  if (!(await isObjectEnabled(key))) notFound()
}

/** Persist the SUPER_ADMIN choice: keep only known, non-core keys (core is implicit). */
export async function setEnabledObjectKeys(keys: string[]): Promise<void> {
  const known = new Set(allItems().map(i => i.key))
  const core = new Set(coreItemKeys())
  const toStore = [...new Set(keys)].filter(k => known.has(k) && !core.has(k))
  await setSetting(SETTING_KEY, toStore)
}
