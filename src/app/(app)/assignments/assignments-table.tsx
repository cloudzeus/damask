'use client'

import * as React from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { UserCog, Users, LoaderCircle, Search, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { LIFECYCLE_COLORS, lifecycleLabel, type LifecycleStr } from '@/lib/pm/types'
import {
  assignApplication,
  type AssignableApplicationRow,
  type StaffOption,
} from '@/lib/assignments/actions'

type Staff = { managers: StaffOption[]; employees: StaffOption[] }

const NONE = '__none__'

const dateFmt = new Intl.DateTimeFormat('el-GR', { day: '2-digit', month: '2-digit', year: 'numeric' })

function LifecycleBadge({ lifecycle }: { lifecycle: string }) {
  const c = LIFECYCLE_COLORS[lifecycle as LifecycleStr]
  if (!c) return <span className="badge-pill muted">{lifecycle}</span>
  return <span className="badge-pill" style={{ color: c.fg, background: c.bg }}>{lifecycleLabel(lifecycle as LifecycleStr)}</span>
}

export function AssignmentsTable({ rows, staff }: { rows: AssignableApplicationRow[]; staff: Staff }) {
  const router = useRouter()
  const [dialogOpen, setDialogOpen] = React.useState(false)
  const [assigning, setAssigning] = React.useState<AssignableApplicationRow | null>(null)

  function openAssign(row: AssignableApplicationRow) {
    setAssigning(row)
    setDialogOpen(true)
  }

  const columns: DataTableColumn<AssignableApplicationRow>[] = [
    {
      id: 'programTitle',
      header: 'Πρόγραμμα',
      width: 260,
      enableHide: false,
      sortValue: r => r.programTitle,
      cell: r => <b>{r.programTitle}</b>,
    },
    {
      id: 'trdrName',
      header: 'Πελάτης',
      width: 220,
      sortValue: r => r.trdrName,
      cell: r => r.trdrName,
    },
    {
      id: 'lifecycle',
      header: 'Κατάσταση',
      width: 140,
      sortValue: r => r.lifecycle,
      cell: r => <LifecycleBadge lifecycle={r.lifecycle} />,
    },
    {
      id: 'manager',
      header: 'Manager',
      width: 180,
      sortValue: r => r.managerName ?? '',
      cell: r =>
        r.managerName
          ? <span className="badge-pill info"><UserCog className="size-3" aria-hidden /> {r.managerName}</span>
          : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'employees',
      header: 'Υπάλληλοι',
      width: 260,
      sortValue: r => r.employeeNames.length,
      cell: r =>
        r.employeeNames.length
          ? (
            <span className="flex flex-wrap gap-1">
              {r.employeeNames.map((n, i) => (
                <span key={`${r.id}-${i}`} className="badge-pill muted">{n}</span>
              ))}
            </span>
          )
          : <span className="text-muted-foreground">—</span>,
    },
    {
      id: 'createdAt',
      header: 'Ημ/νία',
      width: 110,
      nowrap: true,
      sortValue: r => r.createdAt,
      cell: r => <span className="tabular-nums">{dateFmt.format(new Date(r.createdAt))}</span>,
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 120,
      enableHide: false,
      enableResize: false,
      cell: r => (
        <Button type="button" variant="outline" size="sm" onClick={() => openAssign(r)}>
          <UserCog className="size-3.5" aria-hidden /> Ανάθεση
        </Button>
      ),
    },
  ]

  return (
    <>
      <DataTable
        tableId="assignments"
        columns={columns}
        rows={rows}
        rowKey={r => r.id}
        initialSort={{ columnId: 'createdAt', dir: 'desc' }}
        emptyMessage="Δεν υπάρχουν έργα προς ανάθεση."
        footer={<span>{rows.length} {rows.length === 1 ? 'έργο' : 'έργα'}</span>}
      />

      {assigning && (
        <AssignDialog
          key={assigning.id}
          open={dialogOpen}
          onOpenChange={setDialogOpen}
          row={assigning}
          staff={staff}
          onSaved={() => { setDialogOpen(false); router.refresh() }}
        />
      )}
    </>
  )
}

function AssignDialog({
  open, onOpenChange, row, staff, onSaved,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  row: AssignableApplicationRow
  staff: Staff
  onSaved: () => void
}) {
  const [managerId, setManagerId] = React.useState<string>(row.managerId ?? NONE)
  const [selected, setSelected] = React.useState<Set<string>>(new Set(row.employeeIds))
  const [query, setQuery] = React.useState('')
  const [pending, startTransition] = React.useTransition()

  const filtered = React.useMemo(() => {
    const q = query.trim().toLowerCase()
    if (!q) return staff.employees
    return staff.employees.filter(e => e.name.toLowerCase().includes(q) || e.email.toLowerCase().includes(q))
  }, [query, staff.employees])

  function toggle(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  function handleSave() {
    startTransition(async () => {
      const res = await assignApplication({
        applicationId: row.id,
        managerId: managerId === NONE ? null : managerId,
        employeeIds: [...selected],
      })
      if (res.ok) {
        toast.success('Η ανάθεση αποθηκεύτηκε.')
        onSaved()
      } else {
        toast.error(res.error ?? 'Η αποθήκευση απέτυχε.')
      }
    })
  }

  const managerName = (id: string) => staff.managers.find(m => m.id === id)?.name ?? 'Κανένας'

  return (
    <Dialog open={open} onOpenChange={next => { if (!pending) onOpenChange(next) }}>
      <DialogContent className="glass sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>Ανάθεση έργου</DialogTitle>
          <DialogDescription>Ορίστε έναν υπεύθυνο (manager) και τους υπαλλήλους-εκτελεστές.</DialogDescription>
        </DialogHeader>

        <div className="rounded-lg bg-muted/50 px-3 py-2 ring-1 ring-foreground/10">
          <div className="text-[13px] font-bold text-foreground">{row.programTitle}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] text-muted-foreground">
            <span>{row.trdrName}</span>
            <span aria-hidden>·</span>
            <LifecycleBadge lifecycle={row.lifecycle} />
          </div>
        </div>

        <div className="field">
          <label htmlFor="assign-manager">Υπεύθυνος (Manager)</label>
          <Select value={managerId} onValueChange={v => setManagerId(v ?? NONE)}>
            <SelectTrigger id="assign-manager" className="h-11 w-full rounded-full border-border bg-card px-4">
              <SelectValue>{(v: string) => managerName(v)}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NONE}>Κανένας</SelectItem>
              {staff.managers.map(m => (
                <SelectItem key={m.id} value={m.id}>{m.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="field">
          <label htmlFor="assign-emp-search">
            <span className="inline-flex items-center gap-1.5"><Users className="size-3.5" aria-hidden /> Υπάλληλοι ({selected.size})</span>
          </label>
          <div className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-3 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <Input
              id="assign-emp-search"
              className="w-full pl-9"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Αναζήτηση υπαλλήλου…"
            />
          </div>
          <div className="mt-2 max-h-64 overflow-y-auto rounded-lg ring-1 ring-foreground/10">
            {filtered.length === 0 && (
              <div className="px-3 py-6 text-center text-[12.5px] text-muted-foreground">Δεν βρέθηκαν υπάλληλοι.</div>
            )}
            {filtered.map(e => {
              const checked = selected.has(e.id)
              return (
                <label
                  key={e.id}
                  className="flex min-h-11 cursor-pointer items-center gap-2.5 border-b border-border/60 px-3 py-2 last:border-b-0 hover:bg-muted/50"
                >
                  <span
                    className="flex size-5 shrink-0 items-center justify-center rounded-md ring-1 ring-border"
                    style={checked ? { background: 'var(--primary)', color: 'var(--primary-foreground)' } : undefined}
                  >
                    {checked && <Check className="size-3.5" aria-hidden />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checked}
                    onChange={() => toggle(e.id)}
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-semibold text-foreground">{e.name}</span>
                    <span className="block truncate text-[11.5px] text-muted-foreground">{e.email}</span>
                  </span>
                  <span className="badge-pill muted shrink-0">{e.role}</span>
                </label>
              )
            })}
          </div>
        </div>

        <DialogFooter>
          <DialogClose render={<Button type="button" variant="outline" disabled={pending}>Άκυρο</Button>} />
          <Button type="button" onClick={handleSave} disabled={pending}>
            {pending ? <LoaderCircle className="size-3.5 animate-spin" aria-hidden /> : null}
            Αποθήκευση
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
