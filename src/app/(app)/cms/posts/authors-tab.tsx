'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, MoreVertical, Pencil, Trash2, User as UserIcon } from 'lucide-react'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter, DialogClose,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Button } from '@/components/ui/button'
import { MediaPicker } from '@/components/media/media-picker'
import { createAuthor, updateAuthor, deleteAuthor, type AuthorFormValues } from './actions'

export type AuthorRow = {
  id: string
  name: string
  bio: string | null
  avatarUrl: string | null
  userId: string | null
  userName: string | null
  postCount: number
}

type UserOption = { id: string; name: string }

const NO_USER = '__none__'

export function AuthorsTab({ authors, users, canEdit }: { authors: AuthorRow[]; users: UserOption[]; canEdit: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
        <span className="mr-auto text-[12.5px] text-muted-foreground">
          {authors.length} {authors.length === 1 ? 'συγγραφέας' : 'συγγραφείς'}
        </span>
        {canEdit && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέος συγγραφέας
          </Button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th style={{ width: 40 }} />
              <th>Όνομα</th>
              <th>Bio</th>
              <th>Συνδεδεμένος χρήστης</th>
              <th>Άρθρα</th>
              {canEdit && <th className="ctr" style={{ width: 40 }}>⋯</th>}
            </tr>
          </thead>
          <tbody>
            {authors.map(author => (
              <tr key={author.id} className="dotted-row-bottom">
                <td>
                  {author.avatarUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={author.avatarUrl} alt={author.name} className="size-7 rounded-full object-cover" />
                  ) : (
                    <span className="avatar-ring size-7 text-[10.5px]">
                      {author.name.split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase()}
                    </span>
                  )}
                </td>
                <td className="font-semibold">{author.name}</td>
                <td className="max-w-[280px] truncate text-muted-foreground">{author.bio ?? '—'}</td>
                <td>{author.userName ?? '—'}</td>
                <td className="tabular-nums">{author.postCount}</td>
                {canEdit && (
                  <td className="ctr">
                    <AuthorRowActions author={author} users={users} />
                  </td>
                )}
              </tr>
            ))}
            {authors.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 6 : 5} className="py-8 text-center text-muted-foreground">
                  Δεν υπάρχουν συγγραφείς ακόμα.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && <AuthorFormDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} users={users} />}
    </div>
  )
}

function AuthorRowActions({ author, users }: { author: AuthorRow; users: UserOption[] }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteAuthor(author.id)
      if (res.ok) {
        toast.success(res.message)
        setDeleteOpen(false)
      } else {
        toast.error(res.message)
      }
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${author.name}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" strokeWidth={1.75} /> Επεξεργασία
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AuthorFormDialog mode="edit" open={editOpen} onOpenChange={setEditOpen} author={author} users={users} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{author.name}»;</AlertDialogTitle>
            <AlertDialogDescription>
              {author.postCount > 0
                ? `Ο συγγραφέας είναι συνδεδεμένος με ${author.postCount} άρθρα — θα αφαιρεθεί από αυτά. Η διαγραφή δεν αναιρείται.`
                : 'Η διαγραφή δεν αναιρείται.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function toFormValues(author?: AuthorRow): AuthorFormValues {
  return {
    name: author?.name ?? '',
    bio: author?.bio ?? '',
    avatarUrl: author?.avatarUrl ?? null,
    userId: author?.userId ?? null,
  }
}

function AuthorFormDialog({
  mode, open, onOpenChange, author, users,
}: {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  author?: AuthorRow
  users: UserOption[]
}) {
  const [values, setValues] = useState<AuthorFormValues>(() => toFormValues(author))
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function set<K extends keyof AuthorFormValues>(key: K, value: AuthorFormValues[K]) {
    setValues(v => ({ ...v, [key]: value }))
    setFieldErrors(e => {
      if (!(key in e)) return e
      const next = { ...e }
      delete next[key]
      return next
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = mode === 'create' ? await createAuthor(values) : await updateAuthor(author!.id, values)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        toast.error(res.message)
        setFieldErrors(res.fieldErrors ?? {})
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (next) { setValues(toFormValues(author)); setFieldErrors({}) }
      }}
    >
      <DialogContent className="glass max-h-[88vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[520px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Νέος συγγραφέας' : `Επεξεργασία — ${author?.name}`}</DialogTitle>
          <DialogDescription>Όνομα, σύντομο βιογραφικό και προαιρετική φωτογραφία.</DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit}>
          <div className="mb-3.5 flex items-center gap-3">
            {values.avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={values.avatarUrl} alt="" className="size-14 rounded-full object-cover" />
            ) : (
              <span className="avatar-ring size-14 text-[15px]">
                <UserIcon className="size-5" strokeWidth={1.6} aria-hidden />
              </span>
            )}
            <div className="flex flex-col items-start gap-1">
              <Button type="button" variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
                {values.avatarUrl ? 'Αλλαγή φωτογραφίας' : 'Επιλογή φωτογραφίας'}
              </Button>
              {values.avatarUrl && (
                <button type="button" onClick={() => set('avatarUrl', null)} className="text-[11px] text-muted-foreground hover:text-destructive">
                  Αφαίρεση
                </button>
              )}
            </div>
          </div>

          <div className="field">
            <label htmlFor="author-name">Όνομα*</label>
            <div className="inwrap">
              <input
                id="author-name"
                value={values.name}
                onChange={e => set('name', e.target.value)}
                placeholder="π.χ. Μαρία Παπαδάκη"
                autoFocus
                required
                style={{ paddingLeft: 16 }}
              />
            </div>
            {fieldErrors.name && <div className="error">{fieldErrors.name}</div>}
          </div>

          <div className="field">
            <label htmlFor="author-bio">Bio</label>
            <textarea
              id="author-bio"
              className="cms-textarea"
              value={values.bio}
              onChange={e => set('bio', e.target.value)}
              placeholder="Σύντομο βιογραφικό…"
              rows={3}
            />
          </div>

          <div className="field">
            <label htmlFor="author-user">Σύνδεση με χρήστη (προαιρετικό)</label>
            <Select
              value={values.userId ?? NO_USER}
              onValueChange={value => set('userId', value === NO_USER ? null : (value as string))}
            >
              <SelectTrigger id="author-user" aria-label="Σύνδεση με χρήστη" className="h-11 w-full rounded-full border-border bg-card px-4">
                <SelectValue>
                  {(value: string) => (value === NO_USER ? 'Χωρίς σύνδεση' : (users.find(u => u.id === value)?.name ?? 'Χωρίς σύνδεση'))}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_USER}>Χωρίς σύνδεση</SelectItem>
                {users.map(user => (
                  <SelectItem key={user.id} value={user.id}>{user.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldErrors.userId && <div className="error">{fieldErrors.userId}</div>}
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending || values.name.trim() === ''}>
              {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>

      <MediaPicker
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        multiple={false}
        accept={['IMAGE']}
        onSelect={assets => {
          const asset = assets[0]
          if (asset) set('avatarUrl', asset.url)
        }}
      />
    </Dialog>
  )
}
