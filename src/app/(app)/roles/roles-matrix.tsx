'use client'

import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { roleColorVar, ROLE_DESCRIPTIONS } from '@/lib/role-meta'
import { togglePermission } from './actions'

export type RoleData = {
  id: string
  name: string
  userCount: number
  grantedKeys: string[]
}

export type PermGroup = {
  label: string
  items: { key: string; description: string }[]
}

export function RolesMatrix({ roles, groups }: { roles: RoleData[]; groups: PermGroup[] }) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function handleToggle(roleName: string, permKey: string) {
    startTransition(async () => {
      const res = await togglePermission(roleName, permKey)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  return (
    <>
      <div className="roles-row stagger">
        {roles.map(role => {
          const on = selectedRole === role.name
          return (
            <button
              key={role.id}
              type="button"
              className={`role-card glass lift${on ? ' on' : ''}`}
              aria-pressed={on}
              onClick={() => setSelectedRole(prev => (prev === role.name ? null : role.name))}
            >
              <div className="n">
                <span className="status-dot" style={{ background: roleColorVar(role.name) }} aria-hidden />
                {role.name}
              </div>
              <div className="c">{ROLE_DESCRIPTIONS[role.name] ?? '—'}</div>
              <div className="cnt">
                {role.userCount}
                <small>{role.userCount === 1 ? 'χρήστης' : 'χρήστες'}</small>
              </div>
            </button>
          )
        })}
      </div>

      <div className="glass table-card stagger">
        <p className="matrix-legend">
          💡 Κλικ σε οποιοδήποτε κελί για ενεργοποίηση/απενεργοποίηση — αποθηκεύεται αυτόματα
        </p>
        <div className="table-wrap">
          <table className="data-table matrix">
            <thead>
              <tr>
                <th style={{ minWidth: 230 }}>Δικαίωμα</th>
                {roles.map(role => (
                  <th key={role.id} className={selectedRole === role.name ? 'matrix-col-on' : ''}>
                    {role.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {groups.map(group => (
                <Fragment key={group.label}>
                  <tr className="grp">
                    <td colSpan={roles.length + 1}>
                      <span>{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map(perm => (
                    <tr key={perm.key} className="dotted-row-bottom">
                      <td className="perm">
                        {perm.description}
                        <small>{perm.key}</small>
                      </td>
                      {roles.map(role => {
                        const isLocked = role.name === 'SUPER_ADMIN'
                        const granted = role.grantedKeys.includes(perm.key)
                        const cellClassName = selectedRole === role.name ? 'matrix-col-on' : ''

                        if (isLocked) {
                          return (
                            <td key={role.id} className={cellClassName}>
                              <Tooltip>
                                <TooltipTrigger
                                  render={
                                    <span className="tickchip locked" aria-label="Ο SUPER ADMIN έχει πάντα πλήρη πρόσβαση">
                                      ✓
                                    </span>
                                  }
                                />
                                <TooltipContent>Ο SUPER ADMIN έχει πάντα πλήρη πρόσβαση</TooltipContent>
                              </Tooltip>
                            </td>
                          )
                        }

                        return (
                          <td key={role.id} className={cellClassName}>
                            <button
                              type="button"
                              className={granted ? 'tickchip' : 'tick-off'}
                              disabled={pending}
                              title="Κλικ για εναλλαγή"
                              aria-label={`${granted ? 'Αφαίρεση' : 'Προσθήκη'} «${perm.description}» για τον ρόλο ${role.name}`}
                              onClick={() => handleToggle(role.name, perm.key)}
                            >
                              {granted ? '✓' : <span className="tick-preview" aria-hidden>✓</span>}
                            </button>
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  )
}
