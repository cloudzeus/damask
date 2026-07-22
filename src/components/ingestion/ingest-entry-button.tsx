'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { LuImport, LuChevronDown } from 'react-icons/lu'
import { Button } from '@/components/ui/button'
import { ingestionTargetByKey } from '@/lib/ingestion/registry'
import { IngestDrawer } from './ingest-drawer'

/**
 * Secondary «Καταχώριση από… ▾» entry point for the universal ingestion drawer.
 * Deliberately styled with `variant="outline"` so it never competes with a
 * page's primary «Νέο …» action — permission gating happens server-side
 * inside the drawer's actions (requirePermission(target.permission)).
 */
export function IngestEntryButton({ targetKey, onDone }: { targetKey: string; onDone?: () => void }) {
  const [open, setOpen] = useState(false)
  const router = useRouter()
  const target = ingestionTargetByKey(targetKey)
  if (!target) return null

  return (
    <>
      <Button type="button" variant="outline" size="sm" onClick={() => setOpen(true)}>
        <LuImport className="size-3.5" /> Καταχώριση από… <LuChevronDown className="size-3.5" />
      </Button>
      <IngestDrawer
        target={target}
        open={open}
        onOpenChange={setOpen}
        onDone={() => {
          router.refresh()
          onDone?.()
        }}
      />
    </>
  )
}
