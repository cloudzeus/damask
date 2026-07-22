'use client'

import { useEffect, useState } from 'react'
import { LuLoaderCircle, LuTriangleAlert, LuCheck, LuDownload, LuSave } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { acquireFromApi, listApiPresets, saveApiPreset } from '@/lib/ingestion/actions'
import type { ApiPreset } from '@/lib/ingestion/api-preset'
import type { IngestionTarget } from '@/lib/ingestion/target'
import type { StepProps } from './types'

export function SourceApiPanel({ target, patch }: { target: IngestionTarget; patch: StepProps['patch'] }) {
  const [presets, setPresets] = useState<ApiPreset[]>([])
  const [presetsLoading, setPresetsLoading] = useState(true)
  const [url, setUrl] = useState('')
  const [headerName, setHeaderName] = useState('')
  const [token, setToken] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [recordCount, setRecordCount] = useState<number | null>(null)
  const [savingName, setSavingName] = useState<string | null>(null)
  const [saveBusy, setSaveBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    listApiPresets(target.key)
      .then(list => { if (!cancelled) setPresets(list) })
      .catch(() => { if (!cancelled) setPresets([]) })
      .finally(() => { if (!cancelled) setPresetsLoading(false) })
    return () => { cancelled = true }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [target.key])

  function applyPreset(name: string) {
    const preset = presets.find(p => p.name === name)
    if (!preset) return
    setUrl(preset.url)
    setHeaderName(preset.headerName ?? '')
    // Το token/header-value ΠΟΤΕ δεν αποθηκεύεται — παραμένει κενό, ο χρήστης το ξαναγράφει.
  }

  async function fetchData() {
    if (!url.trim() || busy) return
    setBusy(true)
    setError(null)
    try {
      const batch = await acquireFromApi(target.key, url.trim(), headerName.trim() || undefined, token.trim() || undefined)
      setRecordCount(batch.records.length)
      patch({ batch })
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Η ανάκτηση απέτυχε.')
    } finally {
      setBusy(false)
    }
  }

  async function confirmSavePreset() {
    const name = savingName?.trim()
    if (!name || saveBusy) return
    setSaveBusy(true)
    setError(null)
    try {
      const next = await saveApiPreset(target.key, { name, url: url.trim(), headerName: headerName.trim() || undefined })
      setPresets(next)
      setSavingName(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Η αποθήκευση του endpoint απέτυχε.')
    } finally {
      setSaveBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-4 py-2">
      {error && (
        <div className="notice" role="alert">
          <LuTriangleAlert className="size-4 shrink-0" style={{ color: 'var(--destructive)' }} aria-hidden />
          <span style={{ color: 'var(--destructive)' }}>{error}</span>
        </div>
      )}

      {!presetsLoading && presets.length > 0 && (
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="api-preset">Αποθηκευμένο endpoint</label>
          <Select onValueChange={(v: string | null) => { if (v) applyPreset(v) }}>
            <SelectTrigger id="api-preset" size="sm" className="w-full">
              <SelectValue placeholder="— επίλεξε —" />
            </SelectTrigger>
            <SelectContent>
              {presets.map(p => <SelectItem key={p.name} value={p.name}>{p.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      )}

      <div>
        <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="api-url">URL</label>
        <Input id="api-url" placeholder="https://…" value={url} onChange={e => setUrl(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="api-header-name">Όνομα header (προαιρετικό)</label>
          <Input id="api-header-name" placeholder="π.χ. Authorization" value={headerName} onChange={e => setHeaderName(e.target.value)} />
        </div>
        <div>
          <label className="mb-1.5 block text-[12px] font-semibold" htmlFor="api-token">Token (προαιρετικό)</label>
          <Input id="api-token" type="password" placeholder="Bearer …" value={token} onChange={e => setToken(e.target.value)} />
        </div>
      </div>
      <p className="-mt-2 text-[11px] text-muted-foreground">Το token δεν αποθηκεύεται ποτέ — μόνο το URL και το όνομα του header.</p>

      <div className="flex flex-wrap items-center gap-2.5">
        <Button type="button" className="btn-pill btn-navy" disabled={!url.trim() || busy} onClick={fetchData}>
          {busy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : <LuDownload className="size-3.5" aria-hidden />}
          {busy ? 'Ανάκτηση…' : 'Ανάκτηση'}
        </Button>

        {savingName === null ? (
          <Button type="button" variant="outline" disabled={!url.trim()} onClick={() => setSavingName('')}>
            <LuSave className="size-3.5" aria-hidden /> Αποθήκευση endpoint
          </Button>
        ) : (
          <div className="flex items-center gap-2">
            <Input
              autoFocus
              placeholder="Όνομα endpoint"
              value={savingName}
              onChange={e => setSavingName(e.target.value)}
              className="h-8 w-44"
            />
            <Button type="button" size="sm" disabled={!savingName.trim() || saveBusy} onClick={confirmSavePreset}>
              {saveBusy ? <LuLoaderCircle className="size-3.5 animate-spin" aria-hidden /> : 'Αποθήκευση'}
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setSavingName(null)}>Άκυρο</Button>
          </div>
        )}
      </div>

      {recordCount != null && (
        <p className="flex items-center gap-1.5 text-[12.5px] font-medium" style={{ color: 'var(--success)' }}>
          <LuCheck className="size-3.5" aria-hidden /> {recordCount} εγγραφές
        </p>
      )}
    </div>
  )
}
