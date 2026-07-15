'use client'

import { useState } from 'react'
import { Star, Plus, X } from 'lucide-react'
import { MediaPicker } from '@/components/media/media-picker'
import type { PickedAsset } from '@/components/media/media-types'
import type { LogoEntry } from './actions'

/**
 * value.logos = [{assetId,url,label}] — «απλό μοντέλο» όπως ζητήθηκε, χωρίς
 * επιπλέον keys. Το «κύριο» λογότυπο είναι πάντα το logos[0] (σύμβαση) — το
 * κουμπί «Ορισμός ως κύριο» απλώς μετακινεί το chip στην αρχή του πίνακα.
 */
export function LogosField({ value, onChange }: { value: LogoEntry[]; onChange: (next: LogoEntry[]) => void }) {
  const [pickerOpen, setPickerOpen] = useState(false)

  function handlePicked(assets: PickedAsset[]) {
    const additions: LogoEntry[] = assets.map(a => ({ assetId: a.id, url: a.url, label: a.name }))
    onChange([...value, ...additions])
  }

  function setPrimary(index: number) {
    if (index === 0) return
    const next = [...value]
    const [item] = next.splice(index, 1)
    next.unshift(item)
    onChange(next)
  }

  function remove(index: number) {
    onChange(value.filter((_, i) => i !== index))
  }

  function relabel(index: number, label: string) {
    const next = [...value]
    next[index] = { ...next[index], label }
    onChange(next)
  }

  return (
    <div className="field">
      <label>Λογότυπα</label>
      <div className="flex flex-wrap gap-2.5">
        {value.map((logo, i) => (
          <div
            key={`${logo.assetId}-${i}`}
            className="relative flex w-[136px] flex-col gap-1.5 rounded-[16px] border p-2"
            style={{ borderColor: i === 0 ? 'var(--info)' : 'var(--border)', background: 'var(--card)' }}
          >
            <button
              type="button"
              onClick={() => remove(i)}
              className="absolute top-1.5 right-1.5 z-10 flex size-5 items-center justify-center rounded-full bg-black/55 text-white"
              aria-label={`Αφαίρεση «${logo.label || 'λογότυπο'}»`}
            >
              <X className="size-3" strokeWidth={2.5} />
            </button>
            {i === 0 && (
              <span className="badge-pill ok absolute top-1.5 left-1.5 z-10" style={{ padding: '2px 7px', fontSize: 10 }}>
                <Star className="size-2.5" strokeWidth={2.5} aria-hidden />
                Κύριο
              </span>
            )}
            <div className="flex aspect-square items-center justify-center overflow-hidden rounded-[10px]" style={{ background: 'var(--muted)' }}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={logo.url} alt={logo.label || 'Λογότυπο'} className="size-full object-contain" />
            </div>
            <input
              value={logo.label}
              onChange={e => relabel(i, e.target.value)}
              placeholder="Ετικέτα (π.χ. Λευκό)"
              aria-label="Ετικέτα λογοτύπου"
              className="w-full rounded-md border border-border bg-transparent px-1.5 py-1 text-[11px]"
            />
            {i !== 0 && (
              <button
                type="button"
                onClick={() => setPrimary(i)}
                className="text-left text-[10.5px] font-semibold text-(--info) hover:underline"
              >
                Ορισμός ως κύριο
              </button>
            )}
          </div>
        ))}
        <button
          type="button"
          onClick={() => setPickerOpen(true)}
          className="flex aspect-square w-[136px] flex-col items-center justify-center gap-1.5 rounded-[16px] border border-dashed text-muted-foreground hover:bg-muted"
          style={{ borderColor: 'var(--border)' }}
        >
          <Plus className="size-5" strokeWidth={1.8} aria-hidden />
          <span className="px-2 text-center text-[11px] font-semibold">Προσθήκη λογοτύπου</span>
        </button>
      </div>
      <div className="help">Το πρώτο (με το ✓ Κύριο) χρησιμοποιείται ως προεπιλεγμένο λογότυπο.</div>

      <MediaPicker open={pickerOpen} onOpenChange={setPickerOpen} onSelect={handlePicked} multiple accept={['IMAGE']} />
    </div>
  )
}
