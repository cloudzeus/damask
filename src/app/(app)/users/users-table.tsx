'use client'

import { useMemo, useState } from 'react'
import { Search } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { DataTable, type DataTableColumn } from '@/components/ui/data-table'
import { roleColorVar } from '@/lib/role-meta'
import { UserRowActions } from './row-actions'

export type UserRow = {
  id: string
  name: string
  email: string
  active: boolean
  roleId: string
  roleName: string
  phone: string | null
  mobile: string | null
  address: string | null
  city: string | null
  country: string | null
  connectedLabel: string
  updatedLabel: string
}

type RoleOption = { id: string; name: string }

type StatusFilter = 'all' | 'active' | 'inactive'

function initialsOf(name: string): string {
  return name
    .split(' ')
    .map(w => w[0])
    .slice(0, 2)
    .join('')
    .toUpperCase()
}

/** Πλήρη στοιχεία επικοινωνίας για το tooltip στο όνομα — ό,τι δεν χωράει στις 2 ορατές στήλες. */
function contactLines(user: UserRow): string[] {
  const lines: string[] = []
  if (user.mobile) lines.push(`Mobile: ${user.mobile}`)
  if (user.address) lines.push(user.address)
  const cityCountry = [user.city, user.country].filter(Boolean).join(', ')
  if (cityCountry) lines.push(cityCountry)
  return lines
}

export function UsersTable({
  users,
  roles,
  currentUserId,
}: {
  users: UserRow[]
  roles: RoleOption[]
  currentUserId: string
}) {
  const [query, setQuery] = useState('')
  const [status, setStatus] = useState<StatusFilter>('all')

  const activeCount = useMemo(() => users.filter(u => u.active).length, [users])
  const inactiveCount = users.length - activeCount

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    return users.filter(u => {
      if (status === 'active' && !u.active) return false
      if (status === 'inactive' && u.active) return false
      if (q && !u.name.toLowerCase().includes(q) && !u.email.toLowerCase().includes(q)) return false
      return true
    })
  }, [users, query, status])

  const columns: DataTableColumn<UserRow>[] = [
    {
      id: 'select',
      header: <input type="checkbox" aria-label="Επιλογή όλων" disabled />,
      headerLabel: 'Επιλογή',
      cell: user => <input type="checkbox" aria-label={`Επιλογή ${user.name}`} disabled />,
      width: 34,
      enableHide: false,
      enableResize: false,
    },
    {
      id: 'user',
      header: 'Χρήστης',
      width: 240,
      sortValue: u => u.name,
      cell: user => {
        const lines = contactLines(user)
        return (
          <Tooltip>
            <TooltipTrigger
              render={
                <div className="user-cell cursor-default">
                  <span className="avatar-ring size-8 text-[0.6875rem]">{initialsOf(user.name)}</span>
                  <span>
                    <b>{user.name}</b>
                    <small>{user.email}</small>
                  </span>
                </div>
              }
            />
            <TooltipContent>
              <div className="flex flex-col gap-0.5">
                {lines.length > 0
                  ? lines.map((line, i) => <span key={i}>{line}</span>)
                  : <span>Χωρίς επιπλέον στοιχεία επικοινωνίας</span>}
              </div>
            </TooltipContent>
          </Tooltip>
        )
      },
    },
    {
      id: 'role',
      header: 'Ρόλος',
      width: 150,
      sortValue: u => u.roleName,
      cell: user => (
        <span className="role-pill">
          <i style={{ background: roleColorVar(user.roleName) }} />
          {user.roleName}
        </span>
      ),
    },
    { id: 'phone', header: 'Τηλέφωνο', width: 130, sortValue: u => u.phone, cell: u => u.phone ?? '—' },
    { id: 'city', header: 'Πόλη', width: 130, sortValue: u => u.city, cell: u => u.city ?? '—' },
    { id: 'connected', header: 'Συνδεδεμένος πελάτης', width: 180, sortValue: u => u.connectedLabel, cell: u => u.connectedLabel },
    { id: 'updated', header: 'Ενημερώθηκε', width: 140, sortValue: u => u.updatedLabel, cell: u => u.updatedLabel },
    {
      id: 'status',
      header: 'Κατάσταση',
      width: 130,
      sortValue: u => u.active,
      cell: user =>
        user.active ? (
          <span className="badge-pill ok">
            <span className="status-dot pulse" style={{ background: 'var(--success)', color: 'var(--success)' }} aria-hidden />
            Ενεργός
          </span>
        ) : (
          <span className="badge-pill" style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}>
            <span className="status-dot" style={{ background: 'var(--muted-foreground)' }} aria-hidden />
            Ανενεργός
          </span>
        ),
    },
    {
      id: 'actions',
      header: '⋯',
      headerLabel: 'Ενέργειες',
      align: 'center',
      width: 48,
      enableHide: false,
      enableResize: false,
      cell: user => (
        <UserRowActions
          userId={user.id}
          userName={user.name}
          userEmail={user.email}
          active={user.active}
          roleId={user.roleId}
          roles={roles}
          isSelf={user.id === currentUserId}
          phone={user.phone}
          mobile={user.mobile}
          address={user.address}
          city={user.city}
          country={user.country}
        />
      ),
    },
  ]

  return (
    <DataTable
      tableId="users"
      columns={columns}
      rows={filtered}
      rowKey={u => u.id}
      emptyMessage="Δεν βρέθηκαν χρήστες."
      footer={<span>{filtered.length} {filtered.length === 1 ? 'χρήστης' : 'χρήστες'}</span>}
      toolbarExtras={
        <>
          <label className="search">
            <Search className="size-3.5 shrink-0" strokeWidth={1.8} aria-hidden />
            <input
              type="text"
              placeholder="Αναζήτηση με όνομα ή email…"
              value={query}
              onChange={e => setQuery(e.target.value)}
              aria-label="Αναζήτηση χρηστών"
            />
          </label>
          <button type="button" className={`pill${status === 'all' ? ' on' : ''}`} onClick={() => setStatus('all')}>
            Όλοι
          </button>
          <button type="button" className={`pill${status === 'active' ? ' on' : ''}`} onClick={() => setStatus('active')}>
            Ενεργοί <span className="cnt">{activeCount}</span>
          </button>
          <button type="button" className={`pill${status === 'inactive' ? ' on' : ''}`} onClick={() => setStatus('inactive')}>
            Ανενεργοί <span className="cnt">{inactiveCount}</span>
          </button>
        </>
      }
    />
  )
}
