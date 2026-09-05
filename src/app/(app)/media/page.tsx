import { requirePermission } from '@/lib/rbac-server'
import { assertObjectEnabled } from '@/lib/objects-server'
import { getMediaList } from '@/lib/media'
import { MediaGallery } from './media-gallery'
import { PageHeader } from '@/components/ui/page-header'

export default async function MediaPage() {
  await requirePermission('media.manage')
  await assertObjectEnabled('media')

  const initial = await getMediaList()

  return (
    <div>
      <PageHeader
        breadcrumb={<>Καθημερινά <span aria-hidden>›</span></>}
        title="Media Gallery"
      />

      <MediaGallery initialFolders={initial.folders} initialAssets={initial.assets} />
    </div>
  )
}
