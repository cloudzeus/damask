'use client'

import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog'
import { MassUploader, type UploadedAsset } from '@/components/media/mass-uploader'

export function UploadDialog({
  open,
  onOpenChange,
  folderId,
  folderLabel,
  onUploaded,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  folderId: string | null
  folderLabel: string
  onUploaded: () => void
}) {
  function handleUploaded(assets: UploadedAsset[]) {
    if (assets.length > 0) onUploaded()
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="glass max-h-[85vh] w-full max-w-[calc(100%-2rem)] overflow-y-auto sm:max-w-[560px]">
        <DialogHeader>
          <DialogTitle>Μεταφόρτωση αρχείων</DialogTitle>
          <DialogDescription>Προορισμός: «{folderLabel}»</DialogDescription>
        </DialogHeader>
        <MassUploader
          pathPrefix={`media-gallery/${folderId ?? 'root'}`}
          folderId={folderId}
          onUploaded={handleUploaded}
        />
      </DialogContent>
    </Dialog>
  )
}
