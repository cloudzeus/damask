'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { toast } from 'sonner'
import { MoreVertical, Pencil, Languages, UploadCloud, Archive, Trash2 } from 'lucide-react'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu'
import {
  AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription,
  AlertDialogFooter, AlertDialogAction, AlertDialogCancel,
} from '@/components/ui/alert-dialog'
import { deletePost, togglePublishPost, translatePostToEnglish } from './actions'
import type { PostRow } from './posts-table'

export function PostRowActions({ post }: { post: PostRow }) {
  const [pending, startTransition] = useTransition()
  const [translating, startTranslate] = useTransition()
  const [publishing, startPublish] = useTransition()
  const [deleteOpen, setDeleteOpen] = useState(false)

  function handleTranslate() {
    startTranslate(async () => {
      const res = await translatePostToEnglish(post.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleTogglePublish() {
    startPublish(async () => {
      const res = await togglePublishPost(post.id)
      if (res.ok) toast.success(res.message)
      else toast.error(res.message)
    })
  }

  function handleDelete() {
    startTransition(async () => {
      const res = await deletePost(post.id)
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
            <button type="button" className="rowmenu-btn" aria-label={`Ενέργειες για ${post.titleEl}`}>
              <MoreVertical className="size-4" strokeWidth={1.8} />
            </button>
          }
        />
        <DropdownMenuContent align="end">
          <DropdownMenuItem render={<Link href={`/cms/posts/${post.id}/edit`} />}>
            <Pencil className="size-3.5" strokeWidth={1.75} /> Επεξεργασία
          </DropdownMenuItem>
          <DropdownMenuItem disabled={translating} onClick={handleTranslate}>
            <Languages className="size-3.5" strokeWidth={1.75} /> {translating ? 'Μετάφραση…' : 'Μετάφραση EN (DeepSeek)'}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem disabled={publishing} onClick={handleTogglePublish}>
            {post.status === 'PUBLISHED' ? (
              <><Archive className="size-3.5" strokeWidth={1.75} /> Αρχειοθέτηση</>
            ) : (
              <><UploadCloud className="size-3.5" strokeWidth={1.75} /> Δημοσίευση</>
            )}
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="size-3.5" strokeWidth={1.75} /> Διαγραφή
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Διαγραφή «{post.titleEl}»;</AlertDialogTitle>
            <AlertDialogDescription>Η διαγραφή του άρθρου (και των μεταφράσεών του) δεν αναιρείται.</AlertDialogDescription>
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
