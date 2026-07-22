'use client'

import { useState, useTransition } from 'react'
import { toast } from 'sonner'
import { SYNC_TARGETS, type ObjectSyncConfig, type SyncDirection, type SyncFrequency } from '@/lib/sync-targets'
import { saveSyncConfig, runSyncNow } from './sync-actions'
import { Button } from '@/components/ui/button'

const FREQ_LABELS: Record<SyncFrequency, string> = {
  manual: 'Χειροκίνητα', '15m': 'Κάθε 15′', '1h': 'Κάθε ώρα', '6h': 'Κάθε 6 ώρες', daily: 'Ημερήσια',
}
const DIR_LABELS: Record<SyncDirection, string> = { pull: 'SoftOne → Τοπικά', push: 'Τοπικά → SoftOne', bidirectional: 'Αμφίδρομο' }

export function SyncTab({ configs }: { configs: Record<string, ObjectSyncConfig> }) {
  const [pending, start] = useTransition()

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] text-muted-foreground">
        Ανά αντικείμενο SoftOne: κατεύθυνση, πλευρά-πηγή (για αμφίδρομο) και συχνότητα. Τρέχει
        αυτόματα κάθε 5′ όσα είναι due. Αντικείμενα χωρίς μηχανισμό εμφανίζονται ως «σε εκκρεμότητα».
      </p>
      {SYNC_TARGETS.map(target => (
        <TargetRow key={target.key} target={target} cfg={configs[target.key]} pending={pending} start={start} />
      ))}
    </div>
  )
}

function TargetRow({
  target, cfg, pending, start,
}: {
  target: (typeof SYNC_TARGETS)[number]
  cfg: ObjectSyncConfig
  pending: boolean
  start: (cb: () => void) => void
}) {
  const [local, setLocal] = useState(cfg)
  const [prevCfg, setPrevCfg] = useState(cfg)
  if (cfg !== prevCfg) {
    setPrevCfg(cfg)
    setLocal(cfg)
  }
  const patch = (p: Partial<ObjectSyncConfig>) => setLocal(prev => ({ ...prev, ...p }))

  function save() {
    start(async () => {
      const res = await saveSyncConfig(target.key, local)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }
  function syncNow() {
    start(async () => {
      const res = await runSyncNow(target.key)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <div className="rounded-2xl border border-[var(--glass-border)] p-3">
      <div className="mb-2 flex items-center gap-2">
        <b className="text-[13px]">{target.label}</b>
        {target.s1Object && <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] text-muted-foreground">SoftOne {target.s1Object}</span>}
        {!target.hasEngine && <span className="rounded-full bg-[var(--glass-strong)] px-2 py-0.5 text-[10px] text-muted-foreground">σε εκκρεμότητα</span>}
        {local.lastRunAt && <span className="ml-auto text-[10.5px] text-muted-foreground">Τελευταίο: {new Date(local.lastRunAt).toLocaleString('el-GR')}</span>}
      </div>
      <div className="flex flex-wrap items-center gap-3 text-[12.5px]">
        <label className="flex items-center gap-1.5">
          <input type="checkbox" checked={local.syncEnabled} disabled={pending} onChange={e => patch({ syncEnabled: e.target.checked })} />
          Ενεργό
        </label>
        <select aria-label="Κατεύθυνση" className="rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1" value={local.direction} disabled={pending} onChange={e => patch({ direction: e.target.value as SyncDirection })}>
          {target.supportedDirections.map(d => <option key={d} value={d}>{DIR_LABELS[d]}</option>)}
        </select>
        {local.direction === 'bidirectional' && (
          <select aria-label="Master" className="rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1" value={local.master} disabled={pending} onChange={e => patch({ master: e.target.value as ObjectSyncConfig['master'] })}>
            <option value="softone">Master: SoftOne</option>
            <option value="local">Master: Τοπικά</option>
          </select>
        )}
        <select aria-label="Συχνότητα" className="rounded-lg border border-[var(--glass-border)] bg-transparent px-2 py-1" value={local.frequency} disabled={pending} onChange={e => patch({ frequency: e.target.value as SyncFrequency })}>
          {(Object.keys(FREQ_LABELS) as SyncFrequency[]).map(f => <option key={f} value={f}>{FREQ_LABELS[f]}</option>)}
        </select>
        <Button onClick={save} disabled={pending}>Αποθήκευση</Button>
        <Button variant="outline" onClick={syncNow} disabled={pending}>Sync τώρα</Button>
      </div>
    </div>
  )
}
