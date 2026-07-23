import Link from 'next/link'
import { recordLeadClick } from '@/lib/prospects/click'
import { PortalInvalid } from '@/components/portal/portal-invalid'

export const dynamic = 'force-dynamic'

/**
 * Public (no auth, outside (app)) click-through landing page for the W3
 * newsletter tracked link (${AUTH_URL}/go/{rawToken} — see
 * src/lib/prospects/actions.ts#sendProgramNewsletter). Records the click
 * (idempotently) via recordLeadClick and shows only a generic thank-you with
 * the program title — no other Trdr/lead data is ever exposed here.
 */
export default async function LeadClickPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params
  const result = await recordLeadClick(token)
  if (!result.ok) return <PortalInvalid />

  return (
    <div className="app-canvas flex min-h-screen flex-col items-center justify-center px-6">
      <div className="glass stagger w-full max-w-md p-8 text-center">
        <Link href="/" className="wordmark mb-6 inline-flex text-[18px] text-foreground">
          DAMASK
        </Link>
        <h1 className="mb-2 text-[22px]">Ευχαριστούμε!</h1>
        <p className="text-sm text-muted-foreground">
          Το ενδιαφέρον σας για «{result.programTitle}» καταγράφηκε — θα επικοινωνήσουμε σύντομα μαζί σας.
        </p>
      </div>
    </div>
  )
}
