'use client'

import * as React from 'react'
import { toast } from 'sonner'
import { Search, Loader2, ChevronRight, ChevronDown, ShieldAlert, ClipboardList, History, Pencil, Plus, Trash2 } from 'lucide-react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Switch } from '@/components/ui/switch'
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from '@/components/ui/table'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  kadChildrenAction,
  kadDecodeAction,
  kadSearchAction,
  kadCreateAction,
  kadUpdateAction,
  kadDeleteAction,
  type KadChildNode,
  type DecodedKad,
  type KadSearchResultItem,
} from '@/lib/registries/actions'

/**
 * `/kad` client view — self-contained, ίδιο idiom με regions-view.tsx (glass
 * cards, badge-pill, dotted-leader). Τέσσερις ενότητες: header stats, search
 * (debounced ≥2 χαρακτήρες), decoder, lazy δέντρο από τομείς (level 1) — όλα
 * με το badge «Άδεια λειτουργίας» όπου το KadSearchResultItem/KadChildNode
 * σηματοδοτεί requiresLicense (T5 extension στο @/lib/registries/kad.ts).
 * Όταν canManage (kad.manage): προσθήκη/επεξεργασία/ενεργό-ανενεργό/διαγραφή
 * ανά κόμβο του δέντρου — ίδιο CRUD idiom με regions-view.tsx.
 */

const LEVEL_LABEL: Record<number, string> = {
  1: 'Τομέας', 2: 'Κλάδος', 3: 'Ομάδα', 4: 'Τάξη NACE',
  5: 'Κατηγορία CPA', 6: 'Υποκατηγορία CPA', 7: 'Εθνική δραστηριότητα',
}

function LevelBadge({ level }: { level: number | null }) {
  if (level == null) return null
  return <span className="badge-pill muted">{LEVEL_LABEL[level] ?? `L${level}`}</span>
}

function LicenseBadge() {
  return (
    <span className="badge-pill warn">
      <ShieldAlert className="size-3" aria-hidden /> Άδεια λειτουργίας
    </span>
  )
}

export function KadView({
  total,
  canManage,
  lastImport,
}: {
  total: number
  canManage: boolean
  lastImport: { importedAt: string; totalCodes: number; sourceVersion: string } | null
}) {
  const [roots, setRoots] = React.useState<KadChildNode[] | null>(null)
  const [rootsError, setRootsError] = React.useState<string | null>(null)
  const [createOpen, setCreateOpen] = React.useState(false)

  const reloadRoots = React.useCallback(async () => {
    try {
      setRoots(await kadChildrenAction(null))
      setRootsError(null)
    } catch (err) {
      setRootsError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης δέντρου')
    }
  }, [])

  React.useEffect(() => {
    let cancelled = false
    kadChildrenAction(null)
      .then(nodes => { if (!cancelled) setRoots(nodes) })
      .catch(err => { if (!cancelled) setRootsError(err instanceof Error ? err.message : 'Σφάλμα φόρτωσης δέντρου') })
    return () => { cancelled = true }
  }, [])

  return (
    <div className="flex flex-col gap-4">
      <section className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="glass flex items-center gap-3 rounded-[22px] p-4">
          <span className="icon-pill"><ClipboardList className="size-4" aria-hidden /></span>
          <div>
            <div className="text-[19px] font-semibold tabular-nums">{total.toLocaleString('el-GR')}</div>
            <div className="text-[11.5px] text-muted-foreground">Σύνολο κωδικών ΚΑΔ</div>
          </div>
        </div>
        <div className="glass flex items-center gap-3 rounded-[22px] p-4">
          <span className="icon-pill"><History className="size-4" aria-hidden /></span>
          <div>
            {lastImport ? (
              <>
                <div className="text-[13px] font-semibold">
                  {new Date(lastImport.importedAt).toLocaleDateString('el-GR')} · v{lastImport.sourceVersion}
                </div>
                <div className="text-[11.5px] text-muted-foreground">
                  Τελευταία εισαγωγή — {lastImport.totalCodes.toLocaleString('el-GR')} κωδικοί
                </div>
              </>
            ) : (
              <div className="text-[12.5px] text-muted-foreground">Δεν έχει καταγραφεί εισαγωγή</div>
            )}
          </div>
        </div>
      </section>

      <KadSearch />
      <KadDecoder />

      <section className="glass rounded-[22px] p-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div className="dotted-leader flex-1 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
            Ιεραρχικό δέντρο
          </div>
          {canManage && (
            <Button size="sm" className="gap-1.5" onClick={() => setCreateOpen(true)}>
              <Plus className="size-3.5" aria-hidden /> Νέος Τομέας
            </Button>
          )}
        </div>

        {rootsError && <p className="py-4 text-center text-[12.5px] text-destructive">{rootsError}</p>}

        {!rootsError && roots === null && (
          <div className="flex items-center justify-center gap-2 py-8 text-[12.5px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" /> Φόρτωση…
          </div>
        )}

        {!rootsError && roots !== null && roots.length === 0 && (
          <p className="py-8 text-center text-[12.5px] text-muted-foreground">Δεν υπάρχουν δεδομένα.</p>
        )}

        {roots !== null && roots.length > 0 && (
          <ul className="flex flex-col gap-1.5">
            {roots.map(r => (
              <KadNode key={r.code} node={r} depth={0} canManage={canManage} reloadSiblings={reloadRoots} />
            ))}
          </ul>
        )}
      </section>

      {canManage && (
        <KadFormDialog open={createOpen} onOpenChange={setCreateOpen} mode="create" parent={null} onSaved={reloadRoots} />
      )}
    </div>
  )
}

function KadSearch() {
  const [query, setQuery] = React.useState('')
  const [results, setResults] = React.useState<KadSearchResultItem[] | null>(null)
  const [total, setTotal] = React.useState(0)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)

  const trimmed = query.trim()
  const tooShort = trimmed.length < 2

  // Debounced search — all setState calls live inside the timer/promise callbacks
  // (never synchronously in the effect body), so an early "query too short" pass
  // simply skips scheduling anything; the stale `results` from a previous longer
  // query is masked at render time via `tooShort` rather than reset here.
  React.useEffect(() => {
    if (tooShort) return
    let cancelled = false
    const timer = setTimeout(() => {
      setLoading(true)
      setError(null)
      kadSearchAction(trimmed, 50)
        .then(res => { if (!cancelled) { setResults(res.codes); setTotal(res.total) } })
        .catch(err => { if (!cancelled) setError(err instanceof Error ? err.message : 'Σφάλμα αναζήτησης') })
        .finally(() => { if (!cancelled) setLoading(false) })
    }, 300)
    return () => { cancelled = true; clearTimeout(timer) }
  }, [trimmed, tooShort])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αναζήτηση ΚΑΔ
      </div>

      <div className="relative">
        <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          placeholder="Αναζήτηση με κωδικό ή τίτλο (τουλάχιστον 2 χαρακτήρες)…"
          value={query}
          onChange={e => setQuery(e.target.value)}
          className="pl-8"
        />
      </div>

      {!tooShort && loading && (
        <div className="flex items-center gap-2 py-4 text-[12.5px] text-muted-foreground">
          <Loader2 className="size-4 animate-spin" /> Αναζήτηση…
        </div>
      )}
      {!tooShort && error && <p className="py-4 text-[12.5px] text-destructive">{error}</p>}

      {!tooShort && !loading && !error && results !== null && (
        results.length === 0 ? (
          <p className="py-4 text-[12.5px] text-muted-foreground">Δεν βρέθηκαν αποτελέσματα.</p>
        ) : (
          <div className="mt-3">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Κωδικός</TableHead>
                  <TableHead>Τίτλος</TableHead>
                  <TableHead>Επίπεδο</TableHead>
                  <TableHead />
                </TableRow>
              </TableHeader>
              <TableBody>
                {results.map(r => (
                  <TableRow key={r.code}>
                    <TableCell className="font-mono text-[11.5px]">{r.code}</TableCell>
                    <TableCell className="text-[12.5px]">{r.title ?? r.description}</TableCell>
                    <TableCell><LevelBadge level={r.level} /></TableCell>
                    <TableCell>{r.requiresLicense && <LicenseBadge />}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            {total > results.length && (
              <p className="mt-2 text-[11.5px] text-muted-foreground">Εμφανίζονται {results.length} από {total.toLocaleString('el-GR')} αποτελέσματα.</p>
            )}
          </div>
        )
      )}
    </section>
  )
}

function KadDecoder() {
  const [input, setInput] = React.useState('')
  const [result, setResult] = React.useState<DecodedKad | null>(null)
  const [loading, setLoading] = React.useState(false)
  const [error, setError] = React.useState<string | null>(null)
  const [searched, setSearched] = React.useState(false)

  const decode = React.useCallback(async () => {
    const q = input.trim()
    if (!q) { setError('Εισάγετε έναν κωδικό ΚΑΔ'); return }
    setLoading(true)
    setError(null)
    try {
      const res = await kadDecodeAction(q)
      setResult(res)
      setSearched(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Σφάλμα αναζήτησης')
      setResult(null)
    } finally {
      setLoading(false)
    }
  }, [input])

  return (
    <section className="glass rounded-[22px] p-4">
      <div className="dotted-leader mb-3 text-[10.5px] font-extrabold tracking-[0.1em] text-muted-foreground uppercase">
        Αποκωδικοποίηση ΚΑΔ
      </div>

      <div className="flex gap-2">
        <Input
          placeholder="π.χ. 43210000 ή 43.21.00"
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') decode() }}
          disabled={loading}
          className="font-mono"
        />
        <Button type="button" onClick={decode} disabled={loading} className="gap-1.5">
          {loading ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
          Αναζήτηση
        </Button>
      </div>

      {error && <p className="mt-3 text-[12.5px] text-destructive">{error}</p>}
      {searched && !error && !result && <p className="mt-3 text-[12.5px] text-muted-foreground">Δεν βρέθηκε ΚΑΔ με αυτόν τον κωδικό.</p>}

      {result && (
        <div className="mt-4 flex flex-col gap-3 border-t border-border pt-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-[13px] font-semibold">{result.code}</span>
            <span className="text-[13px]">{result.title}</span>
            <LevelBadge level={result.level} />
            {result.sector && <span className="badge-pill info">Τομέας {result.sector}</span>}
          </div>

          {result.hierarchy.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-[12px] text-muted-foreground">
              {result.hierarchy.map((it, i) => (
                <React.Fragment key={it.code}>
                  {i > 0 && <ChevronRight className="size-3" aria-hidden />}
                  <span>{it.title ?? it.code}</span>
                </React.Fragment>
              ))}
            </div>
          )}

          {result.children.length > 0 && (
            <div>
              <div className="mb-1.5 text-[11px] font-semibold text-muted-foreground">Παιδιά ({result.children.length})</div>
              <ul className="flex max-h-56 flex-col overflow-auto">
                {result.children.map(c => (
                  <li key={c.code} className="dotted-row-bottom flex items-center gap-2 py-1.5 text-[12.5px]">
                    <span className="w-24 shrink-0 font-mono text-[11px] text-muted-foreground">{c.code}</span>
                    <span>{c.title}</span>
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

function KadNode({
  node, depth, canManage, reloadSiblings,
}: {
  node: KadChildNode
  depth: number
  canManage: boolean
  reloadSiblings: () => Promise<void>
}) {
  const [expanded, setExpanded] = React.useState(false)
  const [loading, setLoading] = React.useState(false)
  const [children, setChildren] = React.useState<KadChildNode[] | null>(null)
  const [error, setError] = React.useState<string | null>(null)
  const [editOpen, setEditOpen] = React.useState(false)
  const [addOpen, setAddOpen] = React.useState(false)
  const [deleteOpen, setDeleteOpen] = React.useState(false)
  const [deleting, setDeleting] = React.useState(false)

  const reloadChildren = React.useCallback(async () => {
    try {
      setChildren(await kadChildrenAction(node.code))
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
        const kids = await kadChildrenAction(node.code)
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
      await kadDeleteAction(node.code)
      toast.success(`Ο ΚΑΔ ${node.code} διαγράφηκε.`)
      setDeleteOpen(false)
      await reloadSiblings()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η διαγραφή απέτυχε.')
    } finally {
      setDeleting(false)
    }
  }, [node.code, reloadSiblings])

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

        <span className="w-24 shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">{node.code}</span>
        <span className="truncate text-[12.5px] font-medium">{node.title}</span>
        {!node.isActive && <span className="badge-pill warn shrink-0">Ανενεργός</span>}

        <div className="ml-auto flex shrink-0 items-center gap-1.5">
          {node.requiresLicense && <LicenseBadge />}
          {node.descendants > 0 && (
            <span className="badge-pill muted">{node.directChildren.toLocaleString('el-GR')} άμεσα · {node.descendants.toLocaleString('el-GR')} συνολικά</span>
          )}
          <LevelBadge level={node.level} />

          {canManage && (
            <span className="flex items-center gap-0.5 opacity-0 transition-opacity group-hover:opacity-100 focus-within:opacity-100">
              <Button variant="ghost" size="icon" className="size-6" aria-label="Επεξεργασία" onClick={() => setEditOpen(true)}>
                <Pencil className="size-3.5" />
              </Button>
              {(node.level ?? 0) < 7 && (
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

      {error && <p className="mt-1 ml-7 text-[11.5px] text-destructive">{error}</p>}

      {expanded && children && children.length > 0 && (
        <ul className="mt-1.5 flex flex-col gap-1.5" style={{ paddingLeft: (depth + 1) * 20 }}>
          {children.map(c => (
            <KadNode key={c.code} node={c} depth={depth + 1} canManage={canManage} reloadSiblings={reloadChildren} />
          ))}
        </ul>
      )}

      {canManage && (
        <>
          <KadFormDialog open={editOpen} onOpenChange={setEditOpen} mode="edit" node={node} onSaved={reloadSiblings} />
          <KadFormDialog
            open={addOpen}
            onOpenChange={setAddOpen}
            mode="create"
            parent={node}
            onSaved={async () => { await reloadChildren(); setExpanded(true) }}
          />
          <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Διαγραφή ΚΑΔ {node.code};</AlertDialogTitle>
                <AlertDialogDescription>
                  Ο κωδικός «{node.title}» θα διαγραφεί οριστικά από το μητρώο. Η διαγραφή αποτρέπεται αν έχει υποδιαιρέσεις ή χρησιμοποιείται σε συναλλασσόμενους.
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

/** Create/edit dialog — create: κωδικός+τίτλος (+γονέας read-only)· edit: τίτλος, ενεργό. */
function KadFormDialog({
  open, onOpenChange, mode, node, parent, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  mode: 'create' | 'edit'
  node?: KadChildNode
  parent?: KadChildNode | null
  onSaved: () => Promise<void> | void
}) {
  const [code, setCode] = React.useState('')
  const [title, setTitle] = React.useState('')
  const [isActive, setIsActive] = React.useState(true)
  const [saving, setSaving] = React.useState(false)

  React.useEffect(() => {
    if (!open) return
    if (mode === 'edit' && node) {
      setCode(node.code)
      setTitle(node.title ?? '')
      setIsActive(node.isActive)
    } else {
      setCode('')
      setTitle('')
      setIsActive(true)
    }
  }, [open, mode, node])

  const handleSave = async () => {
    setSaving(true)
    try {
      if (mode === 'create') {
        await kadCreateAction({ code: code.trim(), title: title.trim(), parentCode: parent?.code })
        toast.success(`Ο ΚΑΔ ${code.trim()} δημιουργήθηκε.`)
      } else {
        await kadUpdateAction({ code, title: title.trim(), isActive })
        toast.success(`Ο ΚΑΔ ${code} ενημερώθηκε.`)
      }
      onOpenChange(false)
      await onSaved()
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Η αποθήκευση απέτυχε.')
    } finally {
      setSaving(false)
    }
  }

  const childLevel = parent?.level != null ? parent.level + 1 : 1
  const childLevelLabel = LEVEL_LABEL[childLevel] ?? `L${childLevel}`

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>
            {mode === 'create'
              ? parent ? `Νέος ΚΑΔ — ${childLevelLabel}` : 'Νέος Τομέας'
              : `Επεξεργασία ΚΑΔ ${code}`}
          </DialogTitle>
          <DialogDescription>
            {mode === 'create'
              ? parent
                ? <>Κάτω από: <b>{parent.title}</b> ({parent.code}).</>
                : 'Κορυφαίο επίπεδο — Τομέας (γράμμα, π.χ. Α).'
              : 'Ο κωδικός δεν αλλάζει μετά τη δημιουργία.'}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {mode === 'create' && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="kad-code">Κωδικός</Label>
              <Input
                id="kad-code"
                value={code}
                onChange={e => setCode(e.target.value)}
                placeholder={parent ? `π.χ. ${parent.code}.01` : 'π.χ. Α'}
                className="font-mono"
              />
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="kad-title">Τίτλος</Label>
            <Input id="kad-title" value={title} onChange={e => setTitle(e.target.value)} placeholder="Περιγραφή δραστηριότητας" />
          </div>
          {mode === 'edit' && (
            <div className="flex items-center justify-between rounded-xl border border-border/60 bg-card px-3 py-2">
              <Label htmlFor="kad-active" className="text-[12.5px]">Ενεργός ΚΑΔ</Label>
              <Switch id="kad-active" checked={isActive} onCheckedChange={setIsActive} />
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="ghost">Άκυρο</Button>} />
          <Button onClick={handleSave} disabled={saving || !title.trim() || (mode === 'create' && !code.trim())}>
            {saving && <Loader2 className="size-3.5 animate-spin" aria-hidden />}
            Αποθήκευση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
