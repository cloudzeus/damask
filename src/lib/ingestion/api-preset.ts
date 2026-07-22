export type ApiPreset = { name: string; url: string; headerName?: string }

/** Whitelist the ONLY fields we ever persist for a saved endpoint — guarantees a caller
 *  can never smuggle a token/header value into stored settings. */
export function presetToPersist(preset: ApiPreset): ApiPreset {
  return { name: preset.name, url: preset.url, headerName: preset.headerName }
}
