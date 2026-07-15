'use client'

import { useMemo, useState } from 'react'
import { Search, Columns3 } from 'lucide-react'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { roleColorVar } from '@/lib/role-meta'
import { UserRowActions } from './row-actions'

export type UserRow = {
  id: string
  name: string
  email: string
  active: boolean
  roleId: string
  roleName: string
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

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
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
        <div className="flex-1" />
        <Tooltip>
          <TooltipTrigger
            render={
              <button type="button" className="pill" aria-disabled="true" style={{ opacity: 0.55, cursor: 'default' }}>
                <Columns3 className="size-3.5" strokeWidth={1.8} aria-hidden /> Στήλες ▾
              </button>
            }
          />
          <TooltipContent>Έρχεται με το DataTable engine (Φάση 2)</TooltipContent>
        </Tooltip>
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 30 }}>
                <input type="checkbox" aria-label="Επιλογή όλων" disabled />
              </th>
              <th>Χρήστης</th>
              <th>Ρόλος</th>
              <th>Συνδεδεμένος πελάτης</th>
              <th>Ενημερώθηκε</th>
              <th>Κατάσταση</th>
              <th className="ctr" style={{ width: 40 }}>⋯</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map(user => (
              <tr key={user.id} className="dotted-row-bottom">
                <td>
                  <input type="checkbox" aria-label={`Επιλογή ${user.name}`} disabled />
                </td>
                <td>
                  <div className="user-cell">
                    <span className="avatar-ring size-8 text-[11px]">{initialsOf(user.name)}</span>
                    <span>
                      <b>{user.name}</b>
                      <small>{user.email}</small>
                    </span>
                  </div>
                </td>
                <td>
                  <span className="role-pill">
                    <i style={{ background: roleColorVar(user.roleName) }} />
                    {user.roleName}
                  </span>
                </td>
                <td>{user.connectedLabel}</td>
                <td>{user.updatedLabel}</td>
                <td>
                  {user.active ? (
                    <span className="badge-pill ok">
                      <span className="status-dot pulse" style={{ background: 'var(--success)', color: 'var(--success)' }} aria-hidden />
                      Ενεργός
                    </span>
                  ) : (
                    <span className="badge-pill" style={{ color: 'var(--muted-foreground)', background: 'var(--muted)' }}>
                      <span className="status-dot" style={{ background: 'var(--muted-foreground)' }} aria-hidden />
                      Ανενεργός
                    </span>
                  )}
                </td>
                <td className="ctr">
                  <UserRowActions
                    userId={user.id}
                    userName={user.name}
                    active={user.active}
                    roleId={user.roleId}
                    roles={roles}
                    isSelf={user.id === currentUserId}
                  />
                </td>
              </tr>
            ))}
            {filtered.length === 0 && (
              <tr>
                <td colSpan={7} className="py-8 text-center text-muted-foreground">
                  Δεν βρέθηκαν χρήστες.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="table-foot dotted-row-top">
        <span>{filtered.length} {filtered.length === 1 ? 'χρήστης' : 'χρήστες'}</span>
      </div>
    </div>
  )
}
