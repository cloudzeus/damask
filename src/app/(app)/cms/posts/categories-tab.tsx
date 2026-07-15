'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { toast } from 'sonner'
import { Plus, MoreVertical, Pencil, Trash2, Languages } from 'lucide-react'
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
import { Button } from '@/components/ui/button'
import { createCategory, updateCategory, deleteCategory, translateCategoryNameDraft, type CategoryFormValues } from './actions'

export type CategoryRow = {
  id: string
  slug: string
  nameEl: string
  nameEn: string | null
  postCount: number
}

export function CategoriesTab({ categories, canEdit }: { categories: CategoryRow[]; canEdit: boolean }) {
  const [createOpen, setCreateOpen] = useState(false)

  return (
    <div className="glass table-card stagger">
      <div className="table-toolbar">
        <span className="mr-auto text-[12.5px] text-muted-foreground">
          {categories.length} {categories.length === 1 ? 'κατηγορία' : 'κατηγορίες'}
        </span>
        {canEdit && (
          <Button type="button" size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="size-3.5" strokeWidth={2} aria-hidden /> Νέα κατηγορία
          </Button>
        )}
      </div>

      <div className="table-wrap">
        <table className="data-table">
          <thead>
            <tr>
              <th>Όνομα (Ελληνικά)</th>
              <th>Όνομα (English)</th>
              <th>Slug</th>
              <th>Άρθρα</th>
              {canEdit && <th className="ctr" style={{ width: 40 }}>⋯</th>}
            </tr>
          </thead>
          <tbody>
            {categories.map(category => (
              <tr key={category.id} className="dotted-row-bottom">
                <td className="font-semibold">{category.nameEl}</td>
                <td>{category.nameEn ?? '—'}</td>
                <td className="text-muted-foreground">{category.slug}</td>
                <td className="tabular-nums">{category.postCount}</td>
                {canEdit && (
                  <td className="ctr">
                    <CategoryRowActions category={category} />
                  </td>
                )}
              </tr>
            ))}
            {categories.length === 0 && (
              <tr>
                <td colSpan={canEdit ? 5 : 4} className="py-8 text-center text-muted-foreground">
                  Δεν υπάρχουν κατηγορίες ακόμα.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {canEdit && <CategoryFormDialog mode="create" open={createOpen} onOpenChange={setCreateOpen} />}
    </div>
  )
}

function CategoryRowActions({ category }: { category: CategoryRow }) {
  const [editOpen, setEditOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)
  const [pending, startTransition] = useTransition()

  function handleDelete() {
    startTransition(async () => {
      const res = await deleteCategory(category.id)
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
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για την κατηγορία ${category.nameEl}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem onClick={() => setEditOpen(true)}>
            <Pencil className="size-3.5" strokeWidth={1.75} /> Επεξεργασία
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            variant="destructive"
            disabled={category.postCount > 0}
            onClick={() => setDeleteOpen(true)}
          >
            <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <CategoryFormDialog mode="edit" open={editOpen} onOpenChange={setEditOpen} category={category} />

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{category.nameEl}»;</AlertDialogTitle>
            <AlertDialogDescription>
              {category.postCount > 0
                ? `Η κατηγορία έχει ${category.postCount} άρθρα — μετακίνησέ τα πρώτα σε άλλη κατηγορία.`
                : 'Η κατηγορία είναι άδεια. Η διαγραφή δεν αναιρείται.'}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Άκυρο</AlertDialogCancel>
            <AlertDialogAction variant="destructive" disabled={category.postCount > 0 || pending} onClick={handleDelete}>
              {pending ? 'Διαγραφή…' : 'Διαγραφή'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}

function CategoryFormDialog({
  mode, open, onOpenChange, category,
}: {
  mode: 'create' | 'edit'
  open: boolean
  onOpenChange: (open: boolean) => void
  category?: CategoryRow
}) {
  const [values, setValues] = useState<CategoryFormValues>(() => ({
    nameEl: category?.nameEl ?? '',
    nameEn: category?.nameEn ?? '',
  }))
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [translating, startTranslate] = useTransition()

  function handleTranslate() {
    startTranslate(async () => {
      const res = await translateCategoryNameDraft(values.nameEl)
      if (res.ok) setValues(v => ({ ...v, nameEn: res.nameEn }))
      else toast.error(res.message)
    })
  }

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    startTransition(async () => {
      const res = mode === 'create' ? await createCategory(values) : await updateCategory(category!.id, values)
      if (res.ok) {
        toast.success(res.message)
        onOpenChange(false)
      } else {
        setError(res.fieldErrors?.nameEl ?? res.message)
      }
    })
  }

  return (
    <Dialog
      open={open}
      onOpenChange={next => {
        onOpenChange(next)
        if (next) { setValues({ nameEl: category?.nameEl ?? '', nameEn: category?.nameEn ?? '' }); setError(null) }
      }}
    >
      <DialogContent className="glass sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle>{mode === 'create' ? 'Νέα κατηγορία' : `Επεξεργασία — ${category?.nameEl}`}</DialogTitle>
          <DialogDescription>
            {mode === 'create' ? 'Το slug δημιουργείται αυτόματα από το ελληνικό όνομα.' : 'Το slug δεν αλλάζει — παραμένουν σταθεροί οι σύνδεσμοι.'}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 gap-x-3 sm:grid-cols-2">
            <div className="field">
              <label htmlFor="category-name-el">Όνομα (Ελληνικά)*</label>
              <div className="inwrap">
                <input
                  id="category-name-el"
                  value={values.nameEl}
                  onChange={e => { setValues(v => ({ ...v, nameEl: e.target.value })); setError(null) }}
                  placeholder="π.χ. Ταπετσαρίες"
                  autoFocus
                  required
                  style={{ paddingLeft: 16 }}
                />
              </div>
              {error && <div className="error">{error}</div>}
            </div>

            <div className="field">
              <label htmlFor="category-name-en">Όνομα (English)</label>
              <div className="flex items-center gap-1.5">
                <div className="inwrap flex-1">
                  <input
                    id="category-name-en"
                    value={values.nameEn}
                    onChange={e => setValues(v => ({ ...v, nameEn: e.target.value }))}
                    placeholder="π.χ. Upholstery"
                    style={{ paddingLeft: 16 }}
                  />
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="icon"
                  disabled={translating || values.nameEl.trim() === ''}
                  onClick={handleTranslate}
                  aria-label="Μετάφραση με DeepSeek"
                  title="Μετάφραση με DeepSeek"
                >
                  <Languages className="size-3.5" strokeWidth={1.8} />
                </Button>
              </div>
            </div>
          </div>

          <DialogFooter className="-mx-4 -mb-4 rounded-b-[22px] bg-transparent p-4 pt-3" style={{ borderTop: '1px dotted var(--dotted)' }}>
            <DialogClose render={<Button type="button" variant="outline">Άκυρο</Button>} />
            <Button type="submit" disabled={pending || values.nameEl.trim() === ''}>
              {pending ? 'Αποθήκευση…' : 'Αποθήκευση'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
