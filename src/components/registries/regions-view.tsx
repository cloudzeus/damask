'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Search, Loader2, ChevronRight, ChevronDown, MapPin, Pencil, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  regionChildrenAction,
  regionDecodeAction,
  regionCreateAction,
  regionUpdateAction,
  regionDeleteAction,
  type RegionChildNode,
  type DecodedRegion,
} from '@/lib/registries/actions'

/**
 * `/regions` client view — self-contained, ίδιο idiom με deadlines-view.tsx /
 * pm-workspace.tsx (glass cards, badge-pill, dotted-leader). Ενότητες:
 * (a) Decoder — κωδικός/όνομα → ιεραρχία + παιδιά· (b) Lazy δέντρο από τα
 * level-3 (Περιφέρειες) με cache παιδιών ανά κόμβο· (c) όταν canManage
 * (regions.manage): προσθήκη ρίζας/παιδιού, επεξεργασία, ενεργό/ανενεργό,
 * διαγραφή (με AlertDialog, ίδιο idiom με programs-table.tsx).
 */

const LEVEL_LABEL: Record<number, string> = { 3: 'Περιφέρεια', 4: 'Π.Ε. / Νομός', 5: 'Δήμος' }

function LevelBadge({ level }: { level: number }) {
  return <span className={level === 3 ? 'badge-pill info' : 'badge-pill muted'}>{LEVEL_LABEL[level] ?? `L${level}`}</span>
}

function formatCoords(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null
  return `${lat.toFixed(4)}, ${lng.toFixed(4)}`
}

export function RegionsView({ total, canManage }: { total: number; canManage: boolean }) {
  const [roots, setRoots] = React.useState<RegionChildNode[] | null>(null)
  const [rootsError, setRootsError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const reloadRoots = React.useCallback(async () => {
    try {
      setRoots(await regionChildrenAction(null))
      setRootsError(null)
    } catch (err) {
      setRootsError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης δέντρου')
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    regionChildrenAction(null)
      .then(nodes => { if (!cancelled) setRoots(nodes) })
      .catch(err => { if (!cancelled) setRootsError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης δέντρου') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <RegionDecoder />

      <section className="glass rounded-[22px] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="dotted-leader flex-1 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
            Ιεραρχικό δέντρο
          </div>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden /> Νέα Περιφέρεια
            </Button>
          )}
        </div>

        {rootsError && <p className="py-4 text-center text-[0.78125rem] text-destructive">{rootsError}</p>}

        {!rootsError && roots === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-[0.78125rem] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Φόρτωση…
          </div>
        )}

        {!rootsError && roots !== null && roots.length === 0 && (
          <p className="py-8 text-center text-[0.78125rem] text-muted-foreground">
            Δεν υπάρχουν δεδομένα ({total.toLocaleString('el-GR')} εγγραφές συνολικά).
          </p>
        )}

        {roots !== null && roots.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {roots.map(r => (
              <RegionNode key={r.code} node={r} depth={0} canManage={canManage} reloadSiblings={reloadRoots} />
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <RegionFormDialog
          open={createOpen}
          onOpenChange={setCreateOpen}
          mode="create"
          parent={null}
          onSaved={reloadRoots}
        />
      )}
    </div>
  )
}

function RegionDecoder() {
  const [input, setInput] = React.useState('')
  const [result, setResult] = React.useState<DecodedRegion | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searched, setSearched] = React.useState(false)

  const decode = React.useCallback(async () => {
    const q = input.trim()
    if (!q) { setError('Εισάγετε κωδικό ή όνομα'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await regionDecodeAction(q)
      setResult(res)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα αναζήτησης')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [input])

  const chain = result
    ? ([result.breadcrumb.region, result.breadcrumb.regionalUnit, result.breadcrumb.municipality].filter(Boolean) as { code: string; nameEL: string }[])
    : []

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[0.65625rem] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αναζήτηση περιοχής
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="π.χ. 1110202 ή «Δοξάτου»"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') decode() }}
          disabled={loading}
        />
        <Button type="button" onClick={decode} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Αναζήτηση
        </Button>
      </div>

      {error && <p className="mt-3 text-[0.78125rem] text-destructive">{error}</p>}
      {searched && !error && !result && <p className="mt-3 text-[0.78125rem] text-muted-foreground">Δεν βρέθηκε περιοχή με αυτόν τον κωδικό/όνομα.</p>}

      {result && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <MapPin className="size-4 text-muted-foreground" aria-hidden />
            <span className="font-mono text-[0.8125rem] font-semibold">{result.code}</span>
            <span className="text-[0.8125rem]">{result.nameEL}</span>
            <LevelBadge level={result.level} />
            {formatCoords(result.latitude, result.longitude) && (
              <span className="text-[0.6875rem] text-muted-foreground">{formatCoords(result.latitude, result.longitude)}</span>
            )}
          </div>

          {chain.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[0.75rem] text-muted-foreground">
              {chain.map((c, i) => (
                <React.Fragment key={c.code}>
                  {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                  <span>{c.nameEL}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {result.children.length > 0 && (
            <div>
              <div className="mb-1.5 text-[0.6875rem] font-semibold text-muted-foreground">Υποδιαιρέσεις ({result.children.length})</div>
              <ul className="flex max-h-56 flex-col overflow-auto">
                {result.children.map(c => (
                  <li key={c.code} className="dotted-row-bottom flex items-center gap-2 py-1.5 text-[0.78125rem]">
                    <span className="w-24 shrink-0 font-mono text-[0.6875rem] text-muted-foreground">{c.code}</span>
                    <span>{c.nameEL}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </section>
  )
}

function RegionNode({
  node, depth, canManage, reloadSiblings,
}: {
  node: RegionChildNode
  depth: number
  canManage: boolean
  reloadSiblings: () => Promise<void>
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [children, setChildren] = React.useState<RegionChildNode[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)
  const coords = formatCoords(node.latitude, node.longitude)

  const reloadChildren = React.useCallback(async () => {
    try {
      setChildren(await regionChildrenAction(node.code))
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης')
    }
  }, [node.code])

  const toggle = React.useCallback(async () => {
    if (!node.hasChildren && children === null) return
    if (!expanded && children === null) {
      setLoading(true)
      setError(null)
      try {
        const kids = await regionChildrenAction(node.code)
        setChildren(kids)
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης')
      } finally {
        setLoading(false)
      }
    }
    setExpanded(v => !v)
  }, [node.hasChildren, node.code, expanded, children])

  const handleDelete = React.useCallback(async () => {
    setDeleting(true)
    try {
      await regionDeleteAction(node.code)
      toast.success(`Η περιοχή «${node.nameEL}» διαγράφηκε.`)
      setDeleteOpen(false)
      await reloadSiblings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.')
    } finally {
      setDeleting(false)
    }
  }, [node.code, node.nameEL, reloadSiblings])

  const expandable = node.hasChildren || (children !== null && children.length > 0)

  return (
    <li>
      <div className="group flex items-center gap-2 rounded-xl border border-border/60 bg-card px-2.5 py-1.5">
        <button
          type="button"
          onClick={toggle}
          disabled={!expandable}
          aria-label={expandable ? (expanded ? 'Σύμπτυξη' : 'Ανάπτυξη') : undefined}
          className="flex size-5 shrink-0 items-center justify-center text-muted-foreground disabled:opacity-30"
        >
          {loading ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : expandable ? (
            expanded ? <ChevronDown className="size-3.5" /> : <ChevronRight className="size-3.5" />
          ) : (
            <span className="size-1.5 rounded-full bg-border" />
          )}
        </button>

        <span className="w-24 shrink-0 font-mono text-[0.6875rem] tabular-nums text-muted-foreground">{node.code}</span>
        <span className="truncate text-[0.78125rem] font-medium">{node.nameEL}</span>
        {!node.isActive && <span className="badge-pill warn shrink-0">Ανενεργό</span>}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {coords && <span className="text-[0.65625rem] text-muted-foreground">{coords}</span>}
          {node.descendants > 0 && (
            <span className="badge-pill muted">{node.directChildren.toLocaleString('el-GR')} άμεσα · {node.descendants.toLocaleString('el-GR')} συνολικά</span>
          )}
          <LevelBadge level={node.level} />

          {canManage && (
            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button variant="ghost" size="icon" className="size-6" aria-label="Επεξεργασία" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" />
              </Button>
              {node.level < 5 && (
                <Button variant="ghost" size="icon" className="size-6" aria-label="Προσθήκη υποδιαίρεσης" onClick={() => setAddOpen(true)}>
                  <Plus className="size-3.5" />
                </Button>
              )}
              <Button variant="ghost" size="icon" className="size-6 text-destructive" aria-label="Διαγραφή" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="size-3.5" />
              </Button>
            </span>
          )}
        </div>
      </div>

      {error && <p className="mt-1 ml-7 text-[0.71875rem] text-destructive">{error}</p>}

      {expanded && children && children.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5" style={{ paddingLeft: (depth + 1) * 20 }}>
          {children.map(c => (
            <RegionNode key={c.code} node={c} depth={depth + 1} canManage={canManage} reloadSiblings={reloadChildren} />
          ))}
        </ul>
      )}

      {canManage && (
        <>
          <RegionFormDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            mode="edit"
            node={node}
            onSaved={reloadSiblings}
          />
          <RegionFormDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            mode="create"
            parent={node}
            onSaved={async () => { await reloadChildren(); setExpanded(true) }}
          />
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Διαγραφή «{node.nameEL}»;</AlertDialogTitle>
                <AlertDialogDescription>
                  Η περιοχή {node.code} θα διαγραφεί οριστικά από το μητρώο. Η διαγραφή αποτρέπεται αν έχει υποδιαιρέσεις ή χρησιμοποιείται από συναλλασσόμενους.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Άκυρο</AlertDialogCancel>
                <AlertDialogAction variant="destructive" disabled={deleting} onClick={handleDelete}>
                  {deleting ? 'Διαγραφή…' : 'Διαγραφή'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </>
      )}
    </li>
  )
}

/** Create/edit dialog — create: code+ονόματα (+γονέας read-only)· edit: ονόματα, συντεταγμένες, ενεργό. */
function RegionFormDialog({
  open, onOpenChange, mode, node, parent, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  node?: RegionChildNode
  parent?: RegionChildNode | null
  onSaved: () => Promise<void> | void
}) {
  const [code, setCode] = React.useState('')
  const [nameEL, setNameEL] = React.useState('')
  const [nameEN, setNameEN] = React.useState('')
  const [lat, setLat] = React.useState('')
  const [lng, setLng] = React.useState('')
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (mode === 'edit' && node) {
      setCode(node.code)
      setNameEL(node.nameEL)
      setNameEN(node.nameEN ?? '')
      setLat(node.latitude != null ? String(node.latitude) : '')
      setLng(node.longitude != null ? String(node.longitude) : '')
      setIsActive(node.isActive)
    } else {
      setCode('')
      setNameEL('')
      setNameEN('')
      setLat('')
      setLng('')
      setIsActive(true)
    }
  }, [open, mode, node])

  const parseCoord = (v: string): number | null => {
    const t = v.trim().replace(',', '.')
    if (!t) return null
    const n = Number(t)
    return Number.isFinite(n) ? n : null
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      if (mode === 'create') {
        await regionCreateAction({
          code: code.trim(),
          nameEL: nameEL.trim(),
          nameEN: nameEN.trim() || undefined,
          parentCode: parent?.code,
          latitude: parseCoord(lat),
          longitude: parseCoord(lng),
        })
        toast.success(`Η περιοχή «${nameEL.trim()}» δημιουργήθηκε.`)
      } else {
        await regionUpdateAction({
          code,
          nameEL: nameEL.trim(),
          nameEN: nameEN.trim() || null,
          latitude: parseCoord(lat),
          longitude: parseCoord(lng),
          isActive,
        })
        toast.success(`Η περιοχή «${nameEL.trim()}» ενημερώθηκε.`)
      }
      onOpenChange(false)
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  const childLevelLabel = parent ? (LEVEL_LABEL[parent.level + 1] ?? `L${parent.level + 1}`) : LEVEL_LABEL[3]

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? parent ? `Νέα υποδιαίρεση — ${childLevelLabel}` : 'Νέα Περιφέρεια'
              : `Επεξεργασία «${node?.nameEL}»`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? parent
                ? <>Κάτω από: <b>{parent.nameEL}</b> ({parent.code}) — ο κωδικός πρέπει να ξεκινά με {parent.code}.</>
                : 'Κορυφαίο επίπεδο (Περιφέρεια, 3-ψήφιος κωδικός).'
              : `Κωδικός: ${code} — δεν αλλάζει.`}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {mode === 'create' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region-code">Κωδικός</Label>
              <Input
                id="region-code"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={parent ? `π.χ. ${parent.code}01` : 'π.χ. 111'}
                className="font-mono"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="region-name-el">Όνομα (ΕΛ)</Label>
            <Input id="region-name-el" value={nameEL} onChange={e => setNameEL(e.target.value)} placeholder="π.χ. Δήμος Δοξάτου" />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="region-name-en">Όνομα (EN)</Label>
            <Input id="region-name-en" value={nameEN} onChange={e => setNameEN(e.target.value)} placeholder="προαιρετικό" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region-lat">Latitude</Label>
              <Input id="region-lat" value={lat} onChange={e => setLat(e.target.value)} placeholder="π.χ. 41.1234" className="font-mono" />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="region-lng">Longitude</Label>
              <Input id="region-lng" value={lng} onChange={e => setLng(e.target.value)} placeholder="π.χ. 24.1234" className="font-mono" />
            </div>
          </div>
          {mode === 'edit' && (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2">
              <Label htmlFor="region-active" className="text-[0.78125rem]">Ενεργή περιοχή</Label>
              <Switch id="region-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Άκυρο</Button>} />
          <Button onClick={handleSave} disabled={saving || !nameEL.trim() || (mode === 'create' && !code.trim())}>
            {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Αποθήκευση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
