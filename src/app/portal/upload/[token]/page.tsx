import Link from 'next/link'
import { getUploadRequestByToken } from '@/lib/pm/portal-public'
import { PortalInvalid } from '@/components/portal/portal-invalid'
import { PortalUploadForm } from '@/components/portal/portal-upload-form'

export const dynamic = 'force-dynamic'

/**
 * Δημόσια (χωρίς auth) σελίδα ανεβάσματος δικαιολογητικού μέσω magic-link
 * (C2d). Το token επικυρώνεται server-side από getUploadRequestByToken —
 * χωρίς έγκυρο/ενεργό token δεν εμφανίζεται καμία πληροφορία, μόνο
 * <PortalInvalid/>. Ίδιο minimal shell με src/app/portal/page.tsx, χωρίς
 * nav/signout — δεν υπάρχει session εδώ.
 */
export default async function PortalUploadPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const v = await getUploadRequestByToken(token)
  if (!v.ok) return <PortalInvalid />

  const { request } = v

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center px-6">
      <div className="glass stagger w-full max-w-md p-8 text-center">
        <Link href="/" className="wordmark mb-6 inline-flex text-[18px] text-foreground">
          DAMASK
        </Link>
        <p className="mb-1 text-[11.5px] font-semibold uppercase tracking-wide text-muted-foreground">
          Αίτημα εγγράφου
        </p>
        <h1 className="mb-2 text-[22px]">{request.title}</h1>
        {request.description && (
          <p className="mb-3 text-sm text-muted-foreground">{request.description}</p>
        )}
        <p className="mb-6 text-[12.5px] font-semibold text-muted-foreground">
          {request.customerName} · {request.programTitle}
        </p>

        <PortalUploadForm token={token} title={request.title} alreadyUploaded={request.alreadyUploaded} />
      </div>
    </div>
  )
}
