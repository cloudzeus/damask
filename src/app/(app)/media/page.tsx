import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { getMediaList } from '@/lib/media'
import { MediaGallery } from './media-gallery'

export default async function MediaPage() {
  await requirePermission('media.manage')
  await assertObjectEnabled('media')

  const initial = await getMediaList()

  return (
    <div>
      <div className="mb-4 flex items-end gap-3 pt-1.5">
        <div>
          <div className="mb-0.5 flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
            Καθημερινά <span aria-hidden>›</span> <b className="text-foreground">Media Gallery</b>
          </div>
          <h1 className="text-[22px]">Media Gallery</h1>
        </div>
      </div>

      <MediaGallery initialFolders={initial.folders} initialAssets={initial.assets} />
    </div>
  )
}
