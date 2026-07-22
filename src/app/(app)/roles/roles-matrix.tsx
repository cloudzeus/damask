'use client'

import { Fragment, useState, useTransition } from 'react'
import { toast } from 'sonner'
import { Tooltip, TooltipTrigger, TooltipContent } from '@/components/ui/tooltip'
import { roleColorVar, ROLE_DESCRIPTIONS } from '@/lib/role-meta'
import { togglePermission } from './actions'
import { Plus, Trash2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { CreateRoleDialog } from './create-role-dialog'
import { DeleteRoleDialog } from './delete-role-dialog'

export type RoleData = {
  id: string
  name: string
  description: string | null
  system: boolean
  b2b: boolean
  userCount: number
  grantedKeys: string[]
}

export type PermGroup = {
  label: string
  items: { key: string; description: string }[]
}

export function RolesMatrix({ roles, groups, isSuperAdmin }: { roles: RoleData[]; groups: PermGroup[]; isSuperAdmin: boolean }) {
  const [selectedRole, setSelectedRole] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [createOpen, setCreateOpen] = useState(false)
  const [deleteRoleTarget, setDeleteRoleTarget] = useState<RoleData | null>(null)

  function handleToggle(roleName: string, permKey: string) {
    startTransition(async () => {
      const res = await togglePermission(roleName, permKey)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  // Focus mode: όταν έχει επιλεγεί ρόλος, το matrix δείχνει μόνο τη στήλη του
  // (καθαρή διαχείριση ενός ρόλου με πολλούς ρόλους). Αλλιώς, όλες οι στήλες.
  const selectedRoleData = selectedRole ? roles.find(r => r.name === selectedRole) ?? null : null
  const visibleRoles = selectedRoleData ? [selectedRoleData] : roles

  return (
    <>
      {isSuperAdmin && (
        <div className="mb-3 flex justify-end">
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus width={15} height={15} strokeWidth={2} aria-hidden /> Νέος ρόλος
          </Button>
        </div>
      )}

      <div className="roles-row stagger">
        {roles.map(role => {
          const on = selectedRole === role.name
          const canDelete = isSuperAdmin && !role.system
          return (
            <div key={role.id} className={`role-card glass lift${on ? ' on' : ''}`} style={{ position: 'relative' }}>
              {canDelete && (
                <button
                  type="button"
                  // Ίδιο μέγεθος/θέση με το ✓ badge (::after). Όταν η κάρτα είναι
                  // επιλεγμένη, ο κάδος μετατοπίζεται αριστερά του ✓ (.shifted).
                  className={`role-card-del${on ? ' shifted' : ''}`}
                  aria-label={`Διαγραφή ρόλου ${role.name}`}
                  title="Διαγραφή ρόλου"
                  onClick={e => { e.stopPropagation(); setDeleteRoleTarget(role) }}
                >
                  <Trash2 width={13} height={13} strokeWidth={1.9} aria-hidden />
                </button>
              )}
              <button
                type="button"
                className="role-card-body"
                aria-pressed={on}
                style={{ all: 'unset', cursor: 'pointer', display: 'block' }}
                onClick={() => setSelectedRole(prev => (prev === role.name ? null : role.name))}
              >
                <div className="n">
                  <span className="status-dot" style={{ background: roleColorVar(role.name) }} aria-hidden />
                  <span className="rname" title={role.name}>{role.name}</span>
                </div>
                <div className="c">{role.description || ROLE_DESCRIPTIONS[role.name] || '—'}</div>
                <div className="cnt">
                  {role.userCount}
                  <small>{role.userCount === 1 ? 'χρήστης' : 'χρήστες'}</small>
                </div>
              </button>
            </div>
          )
        })}
      </div>

      <div className="glass table-card stagger">
        {selectedRole ? (
          <div className="mb-2 flex items-center gap-2.5">
            <Button type="button" variant="outline" onClick={() => setSelectedRole(null)}>
              ‹ Όλοι οι ρόλοι
            </Button>
            <span className="text-[12.5px] text-muted-foreground">
              Διαχείριση: <b className="text-foreground">{selectedRole}</b>
            </span>
          </div>
        ) : (
          <p className="matrix-legend">
            💡 {roles.length > 6 ? 'Κάνε κλικ σε έναν ρόλο για εστιασμένη διαχείριση — ' : ''}
            κλικ σε κελί για εναλλαγή, αποθηκεύεται αυτόματα
          </p>
        )}
        <div className="table-wrap">
          <table className="data-table matrix">
            <thead>
              <tr>
                <th style={{ minWidth: 230 }}>Δικαίωμα</th>
                {visibleRoles.map(role => (
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
                    <td colSpan={visibleRoles.length + 1}>
                      <span>{group.label}</span>
                    </td>
                  </tr>
                  {group.items.map(perm => (
                    <tr key={perm.key} className="dotted-row-bottom">
                      <td className="perm">
                        {perm.description}
                        <small>{perm.key}</small>
                      </td>
                      {visibleRoles.map(role => {
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

      {isSuperAdmin && createOpen && (
        // Mount only while open (like DeleteRoleDialog) so the form starts fresh each time.
        <CreateRoleDialog roles={roles} open={createOpen} onOpenChange={setCreateOpen} />
      )}
      {deleteRoleTarget && (
        <DeleteRoleDialog
          role={deleteRoleTarget}
          roles={roles}
          open={deleteRoleTarget !== null}
          onOpenChange={openState => { if (!openState) setDeleteRoleTarget(null) }}
        />
      )}
    </>
  )
}
