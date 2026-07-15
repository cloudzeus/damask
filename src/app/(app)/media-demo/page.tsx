import { requirePermission } from '@/lib/rbac-server'
import { MassUploaderDemo } from './uploader-demo'

export default async function MediaDemoPage() {
  await requirePermission('media.manage')
  return (
    <div>
      <h1 className="mb-5 text-xl font-semibold">Δοκιμή Media Uploader</h1>
      <MassUploaderDemo />
    </div>
  )
}
